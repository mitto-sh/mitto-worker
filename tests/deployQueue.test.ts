import { describe, it, expect, vi, beforeEach } from 'vitest'

const handlers: Record<string, (...args: any[]) => void> = {}

const MockWorker = vi.fn().mockImplementation(function (this: any, queueName: string, processor: unknown, opts: unknown) {
  this.queueName = queueName
  this.processor = processor
  this.opts = opts
  this.on = vi.fn((event: string, handler: (...args: any[]) => void) => {
    handlers[event] = handler
  })
})

vi.mock('bullmq', () => ({
  Worker: MockWorker,
}))

vi.mock('@/jobs/deployJob', () => ({
  processDeployJob: vi.fn(),
}))

describe('startWorker', () => {
  beforeEach(() => {
    MockWorker.mockClear()
  })

  it('constructs a Worker for the deployments queue with the job processor', async () => {
    const { startWorker } = await import('@/queues/deployQueue')
    const { processDeployJob } = await import('@/jobs/deployJob')

    startWorker()

    expect(MockWorker).toHaveBeenCalledWith('deployments', processDeployJob, expect.objectContaining({
      connection: expect.objectContaining({ url: expect.any(String) }),
    }))
  })

  it('logs on completed and failed events without throwing', async () => {
    const { startWorker } = await import('@/queues/deployQueue')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    startWorker()

    expect(() => handlers.completed({ id: '1', data: { deploymentId: 'd1' } })).not.toThrow()
    expect(() => handlers.failed({ id: '1', data: { deploymentId: 'd1' } }, new Error('boom'))).not.toThrow()
    expect(logSpy).toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalled()

    logSpy.mockRestore()
    errorSpy.mockRestore()
  })
})
