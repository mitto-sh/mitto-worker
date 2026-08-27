import type { Job } from 'bullmq'
import { db, eq, and, DeploymentStatus, deployments, services } from '@/lib/db'
import { requestTeardown } from '@/clients/orchestratorClient'
import type { ServiceTeardownJobData } from '@/queues/serviceTeardownQueue'

export async function processServiceTeardownJob(job: Job<ServiceTeardownJobData>): Promise<void> {
  const { serviceId } = job.data

  const liveEnvironments = await db
    .selectDistinct({ environmentId: deployments.environmentId })
    .from(deployments)
    .where(and(eq(deployments.serviceId, serviceId), eq(deployments.status, DeploymentStatus.Live)))

  const failures: string[] = []

  for (const { environmentId } of liveEnvironments) {
    const result = await requestTeardown({ serviceId, environmentId })
    if (!result.success) failures.push(`${environmentId}: ${result.error}`)
  }

  if (failures.length > 0) {
    throw new Error(`Teardown failed for service ${serviceId}: ${failures.join('; ')}`)
  }

  await db.update(services).set({ teardownStatus: 'idle' }).where(eq(services.id, serviceId))
}
