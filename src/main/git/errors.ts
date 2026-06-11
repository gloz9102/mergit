import type { GitErrorCode, GitErrorDto } from '../../shared/types'

export function toGitError(err: unknown): GitErrorDto {
  const detail = err instanceof Error ? err.message : String(err)
  const message = detail.split('\n')[0]
  let code: GitErrorCode = 'GIT_ERROR'
  if (/conflict/i.test(detail)) code = 'CONFLICT'
  else if (/authentication|permission denied|could not read username/i.test(detail)) code = 'AUTH'
  else if (/not a git repository/i.test(detail)) code = 'NOT_A_REPO'
  else if (/couldn't find remote ref|no upstream|unable to access|could not resolve host/i.test(detail))
    code = 'REMOTE'
  else if (/no repository open/i.test(detail)) code = 'NO_REPO'
  return { code, message, detail }
}
