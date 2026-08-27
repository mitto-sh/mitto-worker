import { describe, it, expect, vi, afterEach } from 'vitest'
import { requestBuild } from '@/clients/buildClient'

describe('requestBuild', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const input = {
    deploymentId: 'd1',
    serviceId: 's1',
    repoUrl: 'https://github.com/owner/repo',
    ref: 'main',
    installationId: null,
    dockerfilePath: 'Dockerfile',
    imageTag: 'mitto-s1:main',
  }

  it('returns the parsed success response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, imageTag: 'mitto-s1:main', imageId: 'abc', commitSha: 'abc123', logs: ['step 1'] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestBuild(input)

    expect(result).toEqual({ success: true, imageTag: 'mitto-s1:main', imageId: 'abc', commitSha: 'abc123', logs: ['step 1'] })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/build',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }),
    )
  })

  it('returns the parsed failure response without throwing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: false, error: 'Dockerfile not found', logs: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestBuild(input)

    expect(result).toEqual({ success: false, error: 'Dockerfile not found', logs: [] })
  })
})
