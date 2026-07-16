import type {
  GitHubAccountStateDto,
  GitHubAccountUnavailableReason,
  GitHubRemoteTransport
} from '../../shared/types'

export interface GitHubCredentialProvider {
  listAccounts(): Promise<string[]>
}

export interface GitHubRemoteSnapshot {
  branch: string
  upstream: string
  remoteName: string
  fetchUrls: string[]
  pushUrls: string[]
}

interface ParsedRemoteUrl {
  isGitHub: boolean
  transport: GitHubRemoteTransport
  account: string | null
  hasPassword: boolean
  sanitizedUrl: string
}

export function parseGcmAccounts(raw: string): string[] {
  return [...new Set(raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))]
}

export function parseGitHubRemoteUrl(raw: string): ParsedRemoteUrl {
  const trimmed = raw.trim()
  if (!trimmed) {
    return {
      isGitHub: false,
      transport: 'none',
      account: null,
      hasPassword: false,
      sanitizedUrl: ''
    }
  }

  if (/^[^@\s]+@github\.com:/i.test(trimmed)) {
    return {
      isGitHub: true,
      transport: 'ssh',
      account: null,
      hasPassword: false,
      sanitizedUrl: trimmed
    }
  }

  try {
    const url = new URL(trimmed)
    const isGitHub = url.hostname.toLowerCase() === 'github.com'
    const transport: GitHubRemoteTransport =
      url.protocol === 'https:' ? 'https' : url.protocol === 'ssh:' ? 'ssh' : 'other'
    const hasPassword = url.password.length > 0
    const account = url.username ? decodeUrlComponent(url.username) : null
    if (hasPassword) {
      url.username = '***'
      url.password = ''
    }
    return {
      isGitHub,
      transport,
      account,
      hasPassword,
      sanitizedUrl: url.toString()
    }
  } catch {
    return {
      isGitHub: false,
      transport: 'other',
      account: null,
      hasPassword: false,
      sanitizedUrl: trimmed
    }
  }
}

export function withGitHubAccount(raw: string, account: string | null): string {
  const parsed = parseGitHubRemoteUrl(raw)
  if (!parsed.isGitHub || parsed.transport !== 'https' || parsed.hasPassword) {
    throw new Error('GitHub account switching requires a credential-free github.com HTTPS URL')
  }
  const url = new URL(raw)
  url.username = account ?? ''
  url.password = ''
  return url.toString()
}

export function accountStateFromSnapshot(
  snapshot: GitHubRemoteSnapshot | null,
  fallbackRemoteUrl: string | null,
  accounts: string[],
  gcmAvailable: boolean
): GitHubAccountStateDto {
  const fetchUrl = snapshot?.fetchUrls[0] ?? null
  const inspectedUrl = fetchUrl ?? fallbackRemoteUrl
  const parsed = inspectedUrl ? parseGitHubRemoteUrl(inspectedUrl) : parseGitHubRemoteUrl('')
  const hasComplexUrls =
    !!snapshot && (snapshot.fetchUrls.length !== 1 || snapshot.pushUrls.length > 1)
  const pushUrl = snapshot?.pushUrls[0]
  const parsedPush = pushUrl ? parseGitHubRemoteUrl(pushUrl) : null
  const allUrlsSupported =
    parsed.isGitHub &&
    parsed.transport === 'https' &&
    !parsed.hasPassword &&
    (!parsedPush ||
      (parsedPush.isGitHub &&
        parsedPush.transport === 'https' &&
        !parsedPush.hasPassword))

  let unavailableReason: GitHubAccountUnavailableReason | null = null
  if (!snapshot) unavailableReason = 'NO_UPSTREAM'
  else if (!parsed.isGitHub) unavailableReason = 'NOT_GITHUB'
  else if (parsed.transport === 'ssh') unavailableReason = 'SSH_UNSUPPORTED'
  else if (parsed.hasPassword || parsedPush?.hasPassword) unavailableReason = 'CREDENTIAL_IN_URL'
  else if (hasComplexUrls || !allUrlsSupported) unavailableReason = 'COMPLEX_REMOTE'
  else if (!gcmAvailable) unavailableReason = 'GCM_UNAVAILABLE'
  else if (accounts.length === 0) unavailableReason = 'NO_ACCOUNTS'

  return {
    isGitHubRepository: parsed.isGitHub,
    remoteName: snapshot?.remoteName ?? null,
    remoteUrl: parsed.sanitizedUrl || null,
    transport: parsed.transport,
    accounts,
    selectedAccount: parsed.account,
    recoveryAvailable: parsed.isGitHub,
    accountSwitchAvailable: unavailableReason === null,
    unavailableReason
  }
}

function decodeUrlComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
