// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { useRepoStore } from '../../stores/repoStore'
import { useUiStore } from '../../stores/uiStore'
import { StashDetail } from '../StashDetail'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => {
  localStorage.setItem('lang', 'en')
  useRepoStore.setState({
    repo: { path: '/repo', name: 'repo' },
    repoGeneration: 1,
    stashes: [{ oid: 'stash-oid', index: 0, message: 'work' }]
  })
  useUiStore.setState({ selected: { type: 'stash', oid: 'stash-oid' }, toasts: [] })
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('StashDetail', () => {
  it('파일 조회가 계속 실패해도 stash 목록 갱신 뒤 요청을 반복하지 않는다', async () => {
    const api = {
      stashFiles: vi.fn().mockRejectedValue({ code: 'GIT_ERROR', message: 'failed' }),
      stashList: vi.fn().mockResolvedValue([{ oid: 'stash-oid', index: 0, message: 'work' }])
    }
    vi.stubGlobal('window', { api })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<StashDetail oid="stash-oid" />)
      await flushPromises()
    })

    expect(api.stashFiles).toHaveBeenCalledTimes(1)
    expect(api.stashList).toHaveBeenCalledTimes(1)
    await act(async () => {
      await flushPromises()
    })
    expect(api.stashFiles).toHaveBeenCalledTimes(1)

    act(() => root.unmount())
  })
})

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}
