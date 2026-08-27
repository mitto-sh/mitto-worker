import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const REQUIRED_ENV = {
  DATABASE_URL: 'postgres://mitto:mitto@localhost:5432/mitto',
  ENCRYPTION_KEY: 'b'.repeat(32),
}

describe('env config', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('parses valid environment variables, applying defaults', async () => {
    process.env = { ...originalEnv, ...REQUIRED_ENV, NODE_ENV: 'test' }
    delete process.env.PORT
    delete process.env.REDIS_URL
    delete process.env.MITTO_BUILD_URL
    delete process.env.MITTO_ORCHESTRATOR_URL
    const { env } = await import('@/config/env')

    expect(env.NODE_ENV).toBe('test')
    expect(env.PORT).toBe(3002)
    expect(env.REDIS_URL).toBe('redis://localhost:6379')
    expect(env.MITTO_BUILD_URL).toBe('http://localhost:3001')
    expect(env.MITTO_ORCHESTRATOR_URL).toBe('http://localhost:3003')
  })

  it('exits the process when required variables are missing', async () => {
    process.env = { ...originalEnv }
    delete process.env.DATABASE_URL
    delete process.env.ENCRYPTION_KEY

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(import('@/config/env')).rejects.toThrow('process.exit called')
    expect(exitSpy).toHaveBeenCalledWith(1)

    exitSpy.mockRestore()
    errorSpy.mockRestore()
  })
})
