import { describe, it, expect, vi } from 'vitest'
import { ZodError, z } from 'zod'
import { AppError, errorHandler, notFound } from '@/middleware/error'

function mockRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.send = vi.fn().mockReturnValue(res)
  return res
}

describe('AppError', () => {
  it('carries statusCode, message and optional code', () => {
    const err = new AppError(404, 'Not found', 'NOT_FOUND')
    expect(err.statusCode).toBe(404)
    expect(err.message).toBe('Not found')
    expect(err.code).toBe('NOT_FOUND')
    expect(err.name).toBe('AppError')
  })
})

describe('errorHandler', () => {
  it('returns 400 with field errors for ZodError', () => {
    const schema = z.object({ name: z.string() })
    const result = schema.safeParse({})
    const zodErr = result.success ? undefined : (result.error as ZodError)
    const res = mockRes()

    errorHandler(zodErr!, {} as any, res, vi.fn())

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Validation error' }),
    )
  })

  it('returns the statusCode and message for AppError', () => {
    const res = mockRes()
    errorHandler(new AppError(409, 'Already exists', 'CONFLICT'), {} as any, res, vi.fn())

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({ error: 'Already exists', code: 'CONFLICT' })
  })

  it('returns 500 for unrecognized errors', () => {
    const res = mockRes()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    errorHandler(new Error('boom'), {} as any, res, vi.fn())

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' })
    spy.mockRestore()
  })
})

describe('notFound', () => {
  it('returns 404 with an error message', () => {
    const res = mockRes()
    notFound({} as any, res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({ error: 'Route not found' })
  })
})
