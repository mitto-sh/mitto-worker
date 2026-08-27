import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import type { Job } from 'bullmq'
import { db } from '@/lib/db'
import { eq, projects, environments, services, deployments } from 'mitto-lib-ts-orm'
import { processServiceTeardownJob } from '@/jobs/serviceTeardownJob'
import type { ServiceTeardownJobData } from '@/queues/serviceTeardownQueue'

async function makeFixtures() {
  const [project] = await db.insert(projects).values({
    name: 'teardown-job-test',
    slug: `teardown-job-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
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
    enabled: false,
    teardownStatus: 'tearing_down',
  }).returning()

  await db.insert(deployments).values({
    serviceId: service.id,
    environmentId: environment.id,
    status: 'live',
  })

  return { project, environment, service }
}

function makeJob(data: ServiceTeardownJobData): Job<ServiceTeardownJobData> {
  return { data } as Job<ServiceTeardownJobData>
}

describe('processServiceTeardownJob', () => {
  const cleanupProjectIds: string[] = []

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    for (const id of cleanupProjectIds.splice(0)) {
      await db.delete(projects).where(eq(projects.id, id))
    }
  })

  it('tears down every environment with a live deployment and settles teardownStatus to idle', async () => {
    const { project, environment, service } = await makeFixtures()
    cleanupProjectIds.push(project.id)

    const fetchMock = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true }) })
    vi.stubGlobal('fetch', fetchMock)

    await processServiceTeardownJob(makeJob({ serviceId: service.id }))

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/teardown'),
      expect.objectContaining({
        body: JSON.stringify({ serviceId: service.id, environmentId: environment.id }),
      }),
    )

    const [updated] = await db.select().from(services).where(eq(services.id, service.id))
    expect(updated.teardownStatus).toBe('idle')
  })

  it('leaves teardownStatus as tearing_down and throws when the orchestrator call fails', async () => {
    const { project, service } = await makeFixtures()
    cleanupProjectIds.push(project.id)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: false, error: 'daemon unreachable' }),
    }))

    await expect(processServiceTeardownJob(makeJob({ serviceId: service.id })))
      .rejects.toThrow('daemon unreachable')

    const [updated] = await db.select().from(services).where(eq(services.id, service.id))
    expect(updated.teardownStatus).toBe('tearing_down')
  })

  it('is a no-op (still settles to idle) when the service has no live deployments', async () => {
    const [project] = await db.insert(projects).values({
      name: 'teardown-job-test-empty',
      slug: `teardown-job-test-empty-${Date.now()}`,
    }).returning()
    cleanupProjectIds.push(project.id)

    const [service] = await db.insert(services).values({
      projectId: project.id,
      name: 'web',
      type: 'web',
      enabled: false,
      teardownStatus: 'tearing_down',
    }).returning()

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await processServiceTeardownJob(makeJob({ serviceId: service.id }))

    expect(fetchMock).not.toHaveBeenCalled()
    const [updated] = await db.select().from(services).where(eq(services.id, service.id))
    expect(updated.teardownStatus).toBe('idle')
  })
})
