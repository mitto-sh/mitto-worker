import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'

const mockEnv: Record<string, string | undefined> = {
  GITHUB_APP_ID: undefined,
  GITHUB_APP_PRIVATE_KEY_PATH: undefined,
}

vi.mock('@/config/env', () => ({
  get env() {
    return mockEnv
  },
}))

let privateKeyPem: string

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => privateKeyPem),
}))

function configureApp() {
  mockEnv.GITHUB_APP_ID = '12345'
  mockEnv.GITHUB_APP_PRIVATE_KEY_PATH = '/fake/path/key.pem'
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

beforeAll(() => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  })
  privateKeyPem = privateKey
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  for (const key of Object.keys(mockEnv)) mockEnv[key] = undefined
})

describe('githubApp', () => {
  it('throws when the GitHub App is not configured', async () => {
    const { getInstallationAccessToken } = await import('@/lib/githubApp')
    await expect(getInstallationAccessToken('999')).rejects.toThrow('GitHub App is not configured')
  })

  it('exchanges for an installation access token using a signed app JWT', async () => {
    configureApp()
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { token: 'ghs_abc123' }))
    vi.stubGlobal('fetch', fetchMock)

    const { getInstallationAccessToken } = await import('@/lib/githubApp')
    expect(await getInstallationAccessToken('999')).toBe('ghs_abc123')

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.github.com/app/installations/999/access_tokens')
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Bearer /)
  })

  it('throws when the GitHub API responds with an error', async () => {
    configureApp()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(404, {})))

    const { getInstallationAccessToken } = await import('@/lib/githubApp')
    await expect(getInstallationAccessToken('999')).rejects.toThrow('Failed to mint GitHub installation access token')
  })
})
