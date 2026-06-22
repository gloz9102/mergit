import { describe, expect, it } from 'vitest'
import { GitServiceError, toGitError } from '../errors'

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
})
