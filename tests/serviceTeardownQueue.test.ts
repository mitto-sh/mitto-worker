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

vi.mock('@/jobs/serviceTeardownJob', () => ({
  processServiceTeardownJob: vi.fn(),
}))

describe('startServiceTeardownWorker', () => {
  beforeEach(() => {
    MockWorker.mockClear()
  })

  it('constructs a Worker for the service-teardown queue with the job processor', async () => {
    const { startServiceTeardownWorker } = await import('@/queues/serviceTeardownQueue')
    const { processServiceTeardownJob } = await import('@/jobs/serviceTeardownJob')

    startServiceTeardownWorker()

    expect(MockWorker).toHaveBeenCalledWith('service-teardown', processServiceTeardownJob, expect.objectContaining({
      connection: expect.objectContaining({ url: expect.any(String) }),
    }))
  })

  it('logs on completed and failed events without throwing', async () => {
    const { startServiceTeardownWorker } = await import('@/queues/serviceTeardownQueue')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    startServiceTeardownWorker()

    expect(() => handlers.completed({ id: '1', data: { serviceId: 's1' } })).not.toThrow()
    expect(() => handlers.failed({ id: '1', data: { serviceId: 's1' } }, new Error('boom'))).not.toThrow()
    expect(logSpy).toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalled()

    logSpy.mockRestore()
    errorSpy.mockRestore()
  })
})
