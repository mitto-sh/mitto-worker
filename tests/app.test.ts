import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '@/app'

const app = createApp()

describe('app', () => {
  it('responds ok on /healthz', async () => {
    const res = await request(app).get('/healthz').expect(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.service).toBe('mitto-worker')
  })

  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/does-not-exist').expect(404)
    expect(res.body.error).toBe('Route not found')
  })
})
