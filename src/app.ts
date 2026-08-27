import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { env } from '@/config/env'
import { errorHandler, notFound } from '@/middleware/error'

export function createApp() {
  const app = express()

  app.use(helmet())
  app.use(cors())
  app.use(express.json())

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', service: 'mitto-worker', env: env.NODE_ENV })
  })

  app.use(notFound)
  app.use(errorHandler)

  return app
}

export const app = createApp()
