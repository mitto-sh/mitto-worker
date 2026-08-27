import { Worker } from 'bullmq'
import { env } from '@/config/env'
import { processServiceTeardownJob } from '@/jobs/serviceTeardownJob'

export interface ServiceTeardownJobData {
  serviceId: string
}

export function startServiceTeardownWorker(): Worker<ServiceTeardownJobData> {
  const worker = new Worker<ServiceTeardownJobData>('service-teardown', processServiceTeardownJob, {
    connection: { url: env.REDIS_URL },
  })

  worker.on('completed', (job) => {
    console.log(`Service teardown job ${job.id} completed (serviceId=${job.data.serviceId})`)
  })

  worker.on('failed', (job, err) => {
    console.error(`Service teardown job ${job?.id} failed (serviceId=${job?.data.serviceId}):`, err.message)
  })

  return worker
}
