import { describe, it, expect } from 'vitest'
import { parseRepoOwner, tryParseGithubOwner } from '@/lib/repoUrl'

describe('parseRepoOwner', () => {
  it('extracts the owner from an https GitHub URL', () => {
    expect(parseRepoOwner('https://github.com/mitto-sh/mitto-dashboard')).toBe('mitto-sh')
  })

  it('extracts the owner from an http GitHub URL', () => {
    expect(parseRepoOwner('http://github.com/some-user/some-repo')).toBe('some-user')
  })

  it('throws on a non-GitHub URL', () => {
    expect(() => parseRepoOwner('https://gitlab.com/owner/repo')).toThrow(
      'Could not parse a GitHub owner from repoUrl',
    )
  })

  it('throws on a malformed URL', () => {
    expect(() => parseRepoOwner('not-a-url')).toThrow()
  })
})

describe('tryParseGithubOwner', () => {
  it('extracts the owner from a GitHub URL', () => {
    expect(tryParseGithubOwner('https://github.com/mitto-sh/mitto-dashboard')).toBe('mitto-sh')
  })

  it('returns null for a non-GitHub URL instead of throwing', () => {
    expect(tryParseGithubOwner('https://gitlab.com/owner/repo')).toBeNull()
  })

  it('returns null for a local file path used in tests', () => {
    expect(tryParseGithubOwner('file:///tmp/some-local-repo')).toBeNull()
  })
})
