import { env } from '@/config/env'

export interface DeploySource {
  repoUrl: string
  ref: string
  dockerfilePath: string
  installationId: string | null
  installationToken: string | null
}

export type DeployTarget =
  | { mode: 'docker' }
  | { mode: 'agent'; accountId: string }

export interface DeployRequest {
  deploymentId: string
  serviceId: string
  environmentId: string
  imageTag: string
  port: number | null
  healthCheck: string
  envVars: Record<string, string>
  serviceType: 'web' | 'worker' | 'cron' | 'static'
  target?: DeployTarget
  source?: DeploySource
}

export type DeployResponse =
  | { success: true; deployUrl: string | null; containerId: string; hostPort: number | null }
  | { success: false; error: string }

export async function requestDeploy(input: DeployRequest): Promise<DeployResponse> {
  const res = await fetch(`${env.MITTO_ORCHESTRATOR_URL}/deploy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  return res.json() as Promise<DeployResponse>
}

export interface TeardownRequest {
  serviceId: string
  environmentId: string
}

export type TeardownResponse =
  | { success: true }
  | { success: false; error: string }

export async function requestTeardown(input: TeardownRequest): Promise<TeardownResponse> {
  const res = await fetch(`${env.MITTO_ORCHESTRATOR_URL}/teardown`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  return res.json() as Promise<TeardownResponse>
}
