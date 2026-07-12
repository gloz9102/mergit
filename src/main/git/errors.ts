import type { GitErrorCode, GitErrorDto } from '../../shared/types'
import { GitCommandExecutionError, GitCommandTimeoutError } from './gitCommandCoordinator'

export class GitServiceError extends Error {
  constructor(
    message: string,
    readonly code: GitErrorCode = 'GIT_ERROR',
    readonly paths?: string[]
  ) {
    super(message)
    this.name = 'GitServiceError'
  }
}

const CHECKOUT_BLOCKED_HEADERS = [
  /Your local changes to the following files would be overwritten by (?:checkout|switch):/i,
  /The following untracked working tree files would be overwritten by (?:checkout|switch):/i
]
const REMOTE_ERROR_PATTERN =
  /could not read from remote repository|correct access rights|repository not found|couldn't find remote ref|no upstream|unable to access|could not resolve host/i

export function toGitError(err: unknown): GitErrorDto {
  if (err instanceof GitServiceError) {
    const detail = sanitizeGitDetail(err.message)
    const error: GitErrorDto = { code: err.code, message: detail.split('\n')[0], detail }
    if (err.paths) error.paths = err.paths
    return error
  }
  if (err instanceof GitCommandTimeoutError) {
    const detail = sanitizeGitDetail(err.message)
    return { code: 'GIT_ERROR', message: detail, detail }
  }
  const detail = sanitizeGitDetail(
    err instanceof GitCommandExecutionError
      ? gitCommandErrorDetail(err)
      : err instanceof Error
        ? err.message
        : String(err)
  )
  const message = detail.split('\n')[0]
  let code: GitErrorCode = 'GIT_ERROR'
  const checkoutBlocked = isCheckoutBlocked(detail)
  if (checkoutBlocked) code = 'CHECKOUT_BLOCKED'
  else if (/conflict|충돌/i.test(detail)) code = 'CONFLICT'
  else if (/authentication|permission denied|could not read username|인증/i.test(detail)) code = 'AUTH'
  else if (/not a git repository|저장소가 아닙니다/i.test(detail)) code = 'NOT_A_REPO'
  else if (REMOTE_ERROR_PATTERN.test(detail)) code = 'REMOTE'
  else if (/no repository open/i.test(detail)) code = 'NO_REPO'
  const error: GitErrorDto = { code, message, detail }
  if (checkoutBlocked) error.paths = parseCheckoutBlockedPaths(detail)
  return error
}

function gitCommandErrorDetail(err: GitCommandExecutionError): string {
  const detail = [err.message, err.stderr, err.stdout].filter(Boolean).join('\n')
  return detail || `Git ${err.kind} command failed: ${err.label}`
}

function sanitizeGitDetail(detail: string): string {
  return detail.replace(/(https?:\/\/)([^/\s:@]+(?::[^/\s@]*)?@)/gi, '$1***@')
}

function isCheckoutBlocked(detail: string): boolean {
  return CHECKOUT_BLOCKED_HEADERS.some((header) => header.test(detail))
}

export function parseCheckoutBlockedPaths(detail: string): string[] {
  const paths: string[] = []
  const lines = detail.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (!CHECKOUT_BLOCKED_HEADERS.some((header) => header.test(lines[i]))) continue
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j]
      const trimmed = line.trim()
      if (!trimmed) continue
      if (/^(Please |Aborting|error: |fatal: )/i.test(trimmed)) break
      paths.push(trimmed)
    }
  }
  return [...new Set(paths)]
}
