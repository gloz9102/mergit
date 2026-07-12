// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRepoStore } from '../../stores/repoStore'
import { useUiStore } from '../../stores/uiStore'
import { run } from '../run'

describe('run', () => {
  beforeEach(() => {
    localStorage.setItem('lang', 'en')
    useUiStore.setState({
      toasts: [],
      pending: {},
      gitMutation: null
    })
    useRepoStore.setState({
      refresh: vi.fn().mockResolvedValue(undefined)
    } as Partial<ReturnType<typeof useRepoStore.getState>>)
  })

  it('진행 중인 mutation이 있으면 두 번째 action을 실행하지 않는다', async () => {
    let finish!: () => void
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    const first = vi.fn(() => pending)
    const second = vi.fn().mockResolvedValue(undefined)

    const firstRun = run(first, undefined, 'stage', { status: true })
    await Promise.resolve()
    await run(second, undefined, 'unstage', { status: true })

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
    finish()
    await firstRun
    expect(useUiStore.getState().gitMutation).toBe(null)
  })

  it('post-action refresh 실패를 숨기지 않고 toast로 보고한다', async () => {
    useRepoStore.setState({
      refresh: vi.fn().mockRejectedValue({
        code: 'GIT_ERROR',
        message: 'refresh failed',
        detail: 'refresh failed'
      })
    } as Partial<ReturnType<typeof useRepoStore.getState>>)

    await run(async () => {}, undefined, 'commit', { status: true })

    expect(useRepoStore.getState().refresh).toHaveBeenCalledWith({ status: true })
    expect(useUiStore.getState().pending['commit']).toBe(false)
    expect(useUiStore.getState().toasts.at(-1)).toMatchObject({
      message: 'Git operation failed',
      detail: 'refresh failed'
    })
  })
})
