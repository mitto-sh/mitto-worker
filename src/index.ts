import 'dotenv/config'
import { app } from '@/app'
import { env } from '@/config/env'
import { startWorker } from '@/queues/deployQueue'
import { startServiceTeardownWorker } from '@/queues/serviceTeardownQueue'

app.listen(env.PORT, () => {
  console.log(`mitto-worker running on port ${env.PORT} [${env.NODE_ENV}]`)
})

startWorker()
startServiceTeardownWorker()

export default app
