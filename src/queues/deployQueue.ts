import { Worker } from 'bullmq'
import { env } from '@/config/env'
import { processDeployJob } from '@/jobs/deployJob'

export interface DeployJobData {
  deploymentId: string
  serviceId: string
  projectId: string
  environmentId: string
}

export function startWorker(): Worker<DeployJobData> {
  const worker = new Worker<DeployJobData>('deployments', processDeployJob, {
    connection: { url: env.REDIS_URL },
  })

  worker.on('completed', (job) => {
    console.log(`Deployment job ${job.id} completed (deploymentId=${job.data.deploymentId})`)
  })

  worker.on('failed', (job, err) => {
    console.error(`Deployment job ${job?.id} failed (deploymentId=${job?.data.deploymentId}):`, err.message)
  })

  return worker
}
