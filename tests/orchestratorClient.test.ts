import { describe, it, expect, vi, afterEach } from 'vitest'
import { requestDeploy, requestTeardown } from '@/clients/orchestratorClient'

describe('requestDeploy', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const input = {
    deploymentId: 'd1',
    serviceId: 's1',
    environmentId: 'e1',
    imageTag: 'mitto-s1:main',
    port: 3000,
    healthCheck: '/healthz',
    envVars: {},
    serviceType: 'web' as const,
  }

  it('returns the parsed success response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, deployUrl: 'http://localhost:54321', containerId: 'c1', hostPort: 54321 }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestDeploy(input)

    expect(result).toEqual({ success: true, deployUrl: 'http://localhost:54321', containerId: 'c1', hostPort: 54321 })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3003/deploy',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }),
    )
  })

  it('returns the parsed failure response without throwing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: false, error: 'health check timed out' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestDeploy(input)

    expect(result).toEqual({ success: false, error: 'health check timed out' })
  })
})

describe('requestTeardown', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const input = { serviceId: 's1', environmentId: 'e1' }

  it('returns the parsed success response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true }) })
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestTeardown(input)

    expect(result).toEqual({ success: true })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3003/teardown',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }),
    )
  })

  it('returns the parsed failure response without throwing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: false, error: 'daemon unreachable' }) })
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestTeardown(input)

    expect(result).toEqual({ success: false, error: 'daemon unreachable' })
  })
})
