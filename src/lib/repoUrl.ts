const GITHUB_REPO_URL_PATTERN = /^https?:\/\/github\.com\/([^/]+)\//

export function parseRepoOwner(repoUrl: string): string {
  const match = repoUrl.match(GITHUB_REPO_URL_PATTERN)

  if (!match) {
    throw new Error(`Could not parse a GitHub owner from repoUrl: ${repoUrl}`)
  }

  return match[1]
}

export function tryParseGithubOwner(repoUrl: string): string | null {
  return repoUrl.match(GITHUB_REPO_URL_PATTERN)?.[1] ?? null
}
