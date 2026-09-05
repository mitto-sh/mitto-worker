import type { Job } from 'bullmq'
import {
  db, eq, and, isNull,
  DeploymentStatus, AgentStatus,
  deployments, githubInstallations, logStreams, providerConfigs, providerAgents,
  getDecryptedEnvVars,
} from '@/lib/db'
import { env } from '@/config/env'
import { tryParseGithubOwner } from '@/lib/repoUrl'
import { requestBuild } from '@/clients/buildClient'
import { requestDeploy } from '@/clients/orchestratorClient'
import type { DeployTarget, DeploySource } from '@/clients/orchestratorClient'
import type { DeployJobData } from '@/queues/deployQueue'

const SELF_HOSTED_VM = 'self-hosted-vm'

export async function processDeployJob(job: Job<DeployJobData>): Promise<void> {
  const { deploymentId, serviceId, environmentId } = job.data

  try {
    const deployment = await db.query.deployments.findFirst({
      where: eq(deployments.id, deploymentId),
      with: { service: { with: { project: true } } },
    })
    if (!deployment) throw new Error(`Deployment ${deploymentId} not found`)

    const { service } = deployment
    if (!service.repoUrl) throw new Error(`Service ${serviceId} has no repoUrl configured`)

    const ownerId = service.project.ownerId
    const providerKind = ownerId ? await resolveProviderKind(ownerId) : 'cloud-managed'
    const viaAgent = providerKind === SELF_HOSTED_VM

    let agentAccountId: string | null = null
    if (viaAgent) {
      agentAccountId = ownerId
      const agent = ownerId ? await findOnlineAgent(ownerId) : undefined
      if (!agent) {
        await failDeployment(deploymentId, 'No self-hosted agent is connected for this account')
        return
      }
    }

    await db.update(deployments)
      .set({ status: DeploymentStatus.Building, startedAt: new Date() })
      .where(eq(deployments.id, deploymentId))

    const owner = tryParseGithubOwner(service.repoUrl)
    const installation = owner && ownerId
      ? await db.query.githubInstallations.findFirst({
          where: and(
            eq(githubInstallations.userId, ownerId),
            eq(githubInstallations.accountLogin, owner),
          ),
        })
      : undefined

    const envVars = await getDecryptedEnvVars(db, serviceId, environmentId, env.ENCRYPTION_KEY)

    const ref = deployment.commitSha ?? service.defaultBranch
    const imageTag = `mitto-${serviceId}:${ref.slice(0, 12)}`
    const dockerfilePath = service.dockerfilePath ?? 'Dockerfile'
    const installationId = installation?.installationId ?? null

    if (!viaAgent) {
      const buildResult = await requestBuild({
        deploymentId,
        serviceId,
        repoUrl: service.repoUrl,
        ref,
        installationId,
        dockerfilePath,
        imageTag,
      })

      if (!buildResult.success) {
        await failDeployment(deploymentId, buildResult.error)
        return
      }

      await db.update(deployments)
        .set({ imageUri: buildResult.imageTag, commitSha: buildResult.commitSha })
        .where(eq(deployments.id, deploymentId))
    }

    const provider = viaAgent ? 'agent' : 'docker'

    await db.insert(logStreams).values({
      deploymentId,
      serviceId,
      streamType: 'build',
      provider,
      streamName: `build-${deploymentId}`,
    })

    await db.update(deployments)
      .set({ status: DeploymentStatus.Provisioning })
      .where(eq(deployments.id, deploymentId))

    let target: DeployTarget | undefined
    let source: DeploySource | undefined
    if (viaAgent && agentAccountId) {
      target = { mode: 'agent', accountId: agentAccountId }
      source = { repoUrl: service.repoUrl, ref, dockerfilePath, installationId, installationToken: null }
    }

    const deployResult = await requestDeploy({
      deploymentId,
      serviceId,
      environmentId,
      imageTag,
      port: service.port,
      healthCheck: service.healthCheck ?? '/healthz',
      envVars,
      serviceType: service.type as 'web' | 'worker' | 'cron' | 'static',
      target,
      source,
    })

    if (!deployResult.success) {
      await failDeployment(deploymentId, deployResult.error)
      return
    }

    await db.update(deployments)
      .set({
        status: DeploymentStatus.Live,
        deployUrl: deployResult.deployUrl,
        finishedAt: new Date(),
      })
      .where(eq(deployments.id, deploymentId))

    await db.insert(logStreams).values({
      deploymentId,
      serviceId,
      streamType: 'runtime',
      provider,
      streamName: deployResult.containerId,
    })
  } catch (err) {
    await failDeployment(deploymentId, err instanceof Error ? err.message : String(err))
    throw err
  }
}

async function resolveProviderKind(ownerId: string): Promise<string> {
  const config = await db.query.providerConfigs.findFirst({
    where: eq(providerConfigs.userId, ownerId),
  })
  return config?.kind ?? 'cloud-managed'
}

async function findOnlineAgent(ownerId: string) {
  return db.query.providerAgents.findFirst({
    where: and(
      eq(providerAgents.userId, ownerId),
      eq(providerAgents.status, AgentStatus.Online),
      isNull(providerAgents.revokedAt),
    ),
  })
}

async function failDeployment(deploymentId: string, errorMessage: string): Promise<void> {
  await db.update(deployments)
    .set({
      status: DeploymentStatus.Failed,
      errorMessage,
      finishedAt: new Date(),
    })
    .where(eq(deployments.id, deploymentId))
}
