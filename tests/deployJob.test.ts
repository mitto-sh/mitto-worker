import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import type { Job } from 'bullmq'
import { db } from '@/lib/db'
import { eq, users, projects, environments, services, deployments, logStreams, providerConfigs, providerAgents } from 'mitto-lib-ts-orm'
import { processDeployJob } from '@/jobs/deployJob'
import type { DeployJobData } from '@/queues/deployQueue'

async function makeFixtures(overrides: { repoUrl?: string | null; ownerId?: string } = {}) {
  const [project] = await db.insert(projects).values({
    name: 'deploy-job-test',
    slug: `deploy-job-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    ownerId: overrides.ownerId ?? null,
  }).returning()

  const [environment] = await db.insert(environments).values({
    projectId: project.id,
    name: 'Production',
    slug: 'production',
    isDefault: true,
  }).returning()

  const [service] = await db.insert(services).values({
    projectId: project.id,
    name: 'web',
    type: 'web',
    port: 3000,
    healthCheck: '/healthz',
    dockerfilePath: 'Dockerfile',
    defaultBranch: 'main',
    repoUrl: overrides.repoUrl === undefined ? 'https://github.com/owner/repo' : overrides.repoUrl,
    repoProvider: 'github',
  }).returning()

  const [deployment] = await db.insert(deployments).values({
    serviceId: service.id,
    environmentId: environment.id,
    status: 'queued',
  }).returning()

  return { project, environment, service, deployment }
}

function makeJob(data: DeployJobData): Job<DeployJobData> {
  return { data } as Job<DeployJobData>
}

function mockFetchByUrl(responses: Record<string, unknown>) {
  return vi.fn((url: string) => {
    const match = Object.entries(responses).find(([key]) => url.includes(key))
    if (!match) throw new Error(`Unexpected fetch to ${url}`)
    return Promise.resolve({ json: () => Promise.resolve(match[1]) })
  })
}

describe('processDeployJob', () => {
  const cleanupProjectIds: string[] = []
  const cleanupUserIds: string[] = []

  afterEach(async () => {
    vi.unstubAllGlobals()
    for (const id of cleanupProjectIds.splice(0)) {
      await db.delete(projects).where(eq(projects.id, id))
    }
    for (const id of cleanupUserIds.splice(0)) {
      await db.delete(users).where(eq(users.id, id))
    }
  })

  async function makeSelfHostedOwner(opts: { withOnlineAgent?: boolean } = {}) {
    const [user] = await db.insert(users).values({
      email: `deploy-job-owner-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`,
    }).returning()
    cleanupUserIds.push(user.id)

    await db.insert(providerConfigs).values({ userId: user.id, kind: 'self-hosted-vm' })

    if (opts.withOnlineAgent) {
      await db.insert(providerAgents).values({
        userId: user.id,
        name: 'test-vm',
        tokenHash: `hash-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        tokenPrefix: 'mag_test',
        status: 'online',
      })
    }

    return user
  }

  it('runs the full happy path through to live', async () => {
    const { project, environment, service, deployment } = await makeFixtures()
    cleanupProjectIds.push(project.id)

    vi.stubGlobal('fetch', mockFetchByUrl({
      '/build': { success: true, imageTag: 'mitto-x:abc123', imageId: 'img1', commitSha: 'abc123def', logs: ['built'] },
      '/deploy': { success: true, deployUrl: 'http://localhost:54321', containerId: 'container1', hostPort: 54321 },
    }))

    await processDeployJob(makeJob({
      deploymentId: deployment.id,
      serviceId: service.id,
      projectId: project.id,
      environmentId: environment.id,
    }))

    const [final] = await db.select().from(deployments).where(eq(deployments.id, deployment.id))
    expect(final.status).toBe('live')
    expect(final.deployUrl).toBe('http://localhost:54321')
    expect(final.imageUri).toBe('mitto-x:abc123')
    expect(final.commitSha).toBe('abc123def')
    expect(final.finishedAt).not.toBeNull()

    const streams = await db.select().from(logStreams).where(eq(logStreams.deploymentId, deployment.id))
    expect(streams).toHaveLength(2)
    expect(streams.map((s) => s.streamType).sort()).toEqual(['build', 'runtime'])
  })

  it('marks the deployment failed when the build fails', async () => {
    const { project, environment, service, deployment } = await makeFixtures()
    cleanupProjectIds.push(project.id)

    vi.stubGlobal('fetch', mockFetchByUrl({
      '/build': { success: false, error: 'Dockerfile not found', logs: [] },
    }))

    await processDeployJob(makeJob({
      deploymentId: deployment.id,
      serviceId: service.id,
      projectId: project.id,
      environmentId: environment.id,
    }))

    const [final] = await db.select().from(deployments).where(eq(deployments.id, deployment.id))
    expect(final.status).toBe('failed')
    expect(final.errorMessage).toBe('Dockerfile not found')
  })

  it('marks the deployment failed when the orchestrator deploy fails', async () => {
    const { project, environment, service, deployment } = await makeFixtures()
    cleanupProjectIds.push(project.id)

    vi.stubGlobal('fetch', mockFetchByUrl({
      '/build': { success: true, imageTag: 'mitto-x:abc123', imageId: 'img1', commitSha: 'abc123def', logs: [] },
      '/deploy': { success: false, error: 'health check timed out' },
    }))

    await processDeployJob(makeJob({
      deploymentId: deployment.id,
      serviceId: service.id,
      projectId: project.id,
      environmentId: environment.id,
    }))

    const [final] = await db.select().from(deployments).where(eq(deployments.id, deployment.id))
    expect(final.status).toBe('failed')
    expect(final.errorMessage).toBe('health check timed out')
  })

  it('marks the deployment failed when the service has no repoUrl', async () => {
    const { project, environment, service, deployment } = await makeFixtures({ repoUrl: null })
    cleanupProjectIds.push(project.id)

    await expect(processDeployJob(makeJob({
      deploymentId: deployment.id,
      serviceId: service.id,
      projectId: project.id,
      environmentId: environment.id,
    }))).rejects.toThrow('no repoUrl configured')

    const [final] = await db.select().from(deployments).where(eq(deployments.id, deployment.id))
    expect(final.status).toBe('failed')
    expect(final.errorMessage).toMatch(/no repoUrl configured/)
  })

  it('fails a self-hosted-vm deploy when no agent is connected', async () => {
    const owner = await makeSelfHostedOwner()
    const { project, environment, service, deployment } = await makeFixtures({ ownerId: owner.id })
    cleanupProjectIds.push(project.id)

    await processDeployJob(makeJob({
      deploymentId: deployment.id,
      serviceId: service.id,
      projectId: project.id,
      environmentId: environment.id,
    }))

    const [final] = await db.select().from(deployments).where(eq(deployments.id, deployment.id))
    expect(final.status).toBe('failed')
    expect(final.errorMessage).toMatch(/No self-hosted agent is connected/)
  })

  it('routes a self-hosted-vm deploy to the agent, skipping the build service', async () => {
    const owner = await makeSelfHostedOwner({ withOnlineAgent: true })
    const { project, environment, service, deployment } = await makeFixtures({ ownerId: owner.id })
    cleanupProjectIds.push(project.id)

    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/build')) throw new Error('build service must not be called for agent deploys')
      if (url.includes('/deploy')) {
        const body = JSON.parse(String(init?.body))
        expect(body.target).toEqual({ mode: 'agent', accountId: owner.id })
        expect(body.source.repoUrl).toBe('https://github.com/owner/repo')
        expect(body.source.dockerfilePath).toBe('Dockerfile')
        return Promise.resolve({ json: () => Promise.resolve({ success: true, deployUrl: 'http://host.docker.internal:5000', containerId: 'agent-container', hostPort: 5000 }) })
      }
      throw new Error(`Unexpected fetch to ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    await processDeployJob(makeJob({
      deploymentId: deployment.id,
      serviceId: service.id,
      projectId: project.id,
      environmentId: environment.id,
    }))

    const [final] = await db.select().from(deployments).where(eq(deployments.id, deployment.id))
    expect(final.status).toBe('live')
    expect(final.deployUrl).toBe('http://host.docker.internal:5000')

    const streams = await db.select().from(logStreams).where(eq(logStreams.deploymentId, deployment.id))
    expect(streams).toHaveLength(2)
    expect(streams.every((s) => s.provider === 'agent')).toBe(true)
  })

  it('throws when the deployment does not exist', async () => {
    await expect(processDeployJob(makeJob({
      deploymentId: '00000000-0000-0000-0000-000000000000',
      serviceId: '00000000-0000-0000-0000-000000000000',
      projectId: '00000000-0000-0000-0000-000000000000',
      environmentId: '00000000-0000-0000-0000-000000000000',
    }))).rejects.toThrow('not found')
  })
})
