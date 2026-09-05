import { readFileSync } from 'node:fs'
import jwt from 'jsonwebtoken'
import { env } from '@/config/env'

let cachedPrivateKey: string | null = null

function getPrivateKey(): string {
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY_PATH) {
    throw new Error('GitHub App is not configured on this worker')
  }
  if (!cachedPrivateKey) {
    cachedPrivateKey = readFileSync(env.GITHUB_APP_PRIVATE_KEY_PATH, 'utf8')
  }
  return cachedPrivateKey
}

export function signAppJwt(): string {
  const now = Math.floor(Date.now() / 1000)
  return jwt.sign(
    { iat: now - 60, exp: now + 9 * 60, iss: env.GITHUB_APP_ID },
    getPrivateKey(),
    { algorithm: 'RS256' },
  )
}

export async function getInstallationAccessToken(installationId: string): Promise<string> {
  const res = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${signAppJwt()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (!res.ok) {
    throw new Error(`Failed to mint GitHub installation access token for installation ${installationId}`)
  }

  const body = await res.json() as { token: string }
  return body.token
}
