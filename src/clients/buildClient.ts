import { env } from '@/config/env'

export interface BuildRequest {
  deploymentId: string
  serviceId: string
  repoUrl: string
  ref: string
  installationId: string | null
  dockerfilePath: string
  imageTag: string
}

export type BuildResponse =
  | { success: true; imageTag: string; imageId: string; commitSha: string; logs: string[] }
  | { success: false; error: string; logs: string[] }

export async function requestBuild(input: BuildRequest): Promise<BuildResponse> {
  const res = await fetch(`${env.MITTO_BUILD_URL}/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  return res.json() as Promise<BuildResponse>
}
