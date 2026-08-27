import type { Job } from 'bullmq'
import { db, eq, and, DeploymentStatus, deployments, githubInstallations, logStreams, getDecryptedEnvVars } from '@/lib/db'
import { env } from '@/config/env'
import { tryParseGithubOwner } from '@/lib/repoUrl'
import { requestBuild } from '@/clients/buildClient'
import { requestDeploy } from '@/clients/orchestratorClient'
import type { DeployJobData } from '@/queues/deployQueue'

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

    await db.update(deployments)
      .set({ status: DeploymentStatus.Building, startedAt: new Date() })
      .where(eq(deployments.id, deploymentId))

    const owner = tryParseGithubOwner(service.repoUrl)
    const installation = owner && service.project.ownerId
      ? await db.query.githubInstallations.findFirst({
          where: and(
            eq(githubInstallations.userId, service.project.ownerId),
            eq(githubInstallations.accountLogin, owner),
          ),
        })
      : undefined

    const envVars = await getDecryptedEnvVars(db, serviceId, environmentId, env.ENCRYPTION_KEY)

    const ref = deployment.commitSha ?? service.defaultBranch
    const imageTag = `mitto-${serviceId}:${ref.slice(0, 12)}`

    const buildResult = await requestBuild({
      deploymentId,
      serviceId,
      repoUrl: service.repoUrl,
      ref,
      installationId: installation?.installationId ?? null,
      dockerfilePath: service.dockerfilePath ?? 'Dockerfile',
      imageTag,
    })

    if (!buildResult.success) {
      await failDeployment(deploymentId, buildResult.error)
      return
    }

    await db.update(deployments)
      .set({ imageUri: buildResult.imageTag, commitSha: buildResult.commitSha })
      .where(eq(deployments.id, deploymentId))

    await db.insert(logStreams).values({
      deploymentId,
      serviceId,
      streamType: 'build',
      provider: 'docker',
      streamName: `build-${deploymentId}`,
    })

    await db.update(deployments)
      .set({ status: DeploymentStatus.Provisioning })
      .where(eq(deployments.id, deploymentId))

    const deployResult = await requestDeploy({
      deploymentId,
      serviceId,
      environmentId,
      imageTag: buildResult.imageTag,
      port: service.port,
      healthCheck: service.healthCheck ?? '/healthz',
      envVars,
      serviceType: service.type as 'web' | 'worker' | 'cron' | 'static',
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
      provider: 'docker',
      streamName: deployResult.containerId,
    })
  } catch (err) {
    await failDeployment(deploymentId, err instanceof Error ? err.message : String(err))
    throw err
  }
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
