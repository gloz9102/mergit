import { describe, expect, it } from 'vitest'
import { GitServiceError, toGitError } from '../errors'
import { GitCommandExecutionError } from '../gitCommandCoordinator'

describe('toGitError', () => {
  it('main에서 생성한 typed error code를 문자열 분류 없이 보존한다', () => {
    const error = toGitError(new GitServiceError('No upstream configured', 'REMOTE'))

    expect(error).toEqual({
      code: 'REMOTE',
      message: 'No upstream configured',
      detail: 'No upstream configured'
    })
  })

  it('typed error의 paths를 보존한다', () => {
    const error = toGitError(new GitServiceError('Checkout blocked', 'CHECKOUT_BLOCKED', ['a.txt']))

    expect(error.code).toBe('CHECKOUT_BLOCKED')
    expect(error.paths).toEqual(['a.txt'])
  })

  it('checkout blocked: local changes 파일 목록을 파싱한다', () => {
    const error = toGitError(
      new Error(
        [
          'error: Your local changes to the following files would be overwritten by checkout:',
          '\tpnpm-lock.yaml',
          '\tsrc/app.ts',
          'Please commit your changes or stash them before you switch branches.',
          'Aborting'
        ].join('\n')
      )
    )

    expect(error.code).toBe('CHECKOUT_BLOCKED')
    expect(error.paths).toEqual(['pnpm-lock.yaml', 'src/app.ts'])
  })

  it('checkout blocked: untracked 파일 목록을 파싱한다', () => {
    const error = toGitError(
      [
        'error: The following untracked working tree files would be overwritten by checkout:',
        '  generated.json',
        'Please move or remove them before you switch branches.',
        'Aborting'
      ].join('\n')
    )

    expect(error.code).toBe('CHECKOUT_BLOCKED')
    expect(error.paths).toEqual(['generated.json'])
  })

  it('checkout blocked: 파일 목록이 없으면 빈 배열을 반환한다', () => {
    const error = toGitError(
      [
        'error: Your local changes to the following files would be overwritten by checkout:',
        'Please commit your changes or stash them before you switch branches.',
        'Aborting'
      ].join('\n')
    )

    expect(error.code).toBe('CHECKOUT_BLOCKED')
    expect(error.paths).toEqual([])
  })

  it('Git 실행 오류의 stdout, stderr, exit code를 구조적으로 보존한다', () => {
    const error = new GitCommandExecutionError({
      kind: 'mutation',
      label: 'checkoutBranch',
      message: 'checkout failed',
      stdout: 'stdout text',
      stderr: 'stderr text',
      exitCode: 1
    })

    expect(error.kind).toBe('mutation')
    expect(error.label).toBe('checkoutBranch')
    expect(error.stdout).toBe('stdout text')
    expect(error.stderr).toBe('stderr text')
    expect(error.exitCode).toBe(1)
    expect(toGitError(error).detail).toContain('stderr text')
  })

  it('원격 저장소 접근 실패를 REMOTE로 분류한다', () => {
    const error = toGitError(
      new Error(
        [
          'fatal: Could not read from remote repository.',
          'Please make sure you have the correct access rights',
          'and the repository exists.'
        ].join('\n')
      )
    )

    expect(error.code).toBe('REMOTE')
  })

  it('오류 detail의 URL credential은 사용자에게 노출하지 않는다', () => {
    const error = toGitError(
      new Error('fatal: unable to access https://user:secret@example.com/private.git/')
    )

    expect(error.detail).toContain('https://***@example.com/private.git/')
    expect(error.detail).not.toContain('user:secret')
  })
})
