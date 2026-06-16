import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StatusDto } from '../../../../shared/types'
import { DEFAULT_HISTORY_OPTIONS, useRepoStore } from '../repoStore'

const status: StatusDto = {
  current: 'main',
  files: [],
  conflicted: [],
  operation: null,
  ahead: 0,
  behind: 0,
  tracking: null
}

function installApi() {
  const api = {
    log: vi.fn().mockResolvedValue([]),
    branches: vi.fn().mockResolvedValue([]),
    status: vi.fn().mockResolvedValue(status),
    stashList: vi.fn().mockResolvedValue([])
  }
  vi.stubGlobal('window', { api })
  return api
}

describe('repoStore.refresh', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    useRepoStore.setState({
      repo: { path: '/repo', name: 'repo' },
      commits: [],
      branches: [],
      status: null,
      stashes: [],
      historyVersion: 0,
      historyOptions: DEFAULT_HISTORY_OPTIONS,
      hasMoreCommits: true,
      loadingMore: false
    })
  })

  it('scope가 status면 status API만 호출한다', async () => {
    const api = installApi()

    await useRepoStore.getState().refresh({ status: true })

    expect(api.status).toHaveBeenCalledTimes(1)
    expect(api.log).not.toHaveBeenCalled()
    expect(api.branches).not.toHaveBeenCalled()
    expect(api.stashList).not.toHaveBeenCalled()
    expect(useRepoStore.getState().historyVersion).toBe(0)
  })

  it('기본 refresh는 전체 git 상태를 갱신하고 historyVersion을 올린다', async () => {
    const api = installApi()

    await useRepoStore.getState().refresh()

    expect(api.log).toHaveBeenCalledTimes(1)
    expect(api.log).toHaveBeenCalledWith(0, 500, DEFAULT_HISTORY_OPTIONS)
    expect(api.branches).toHaveBeenCalledTimes(1)
    expect(api.status).toHaveBeenCalledTimes(1)
    expect(api.stashList).toHaveBeenCalledTimes(1)
    expect(useRepoStore.getState().historyVersion).toBe(1)
  })

  it('같은 tick의 refresh 요청은 하나의 API batch로 합친다', async () => {
    const api = installApi()

    await Promise.all([
      useRepoStore.getState().refresh({ status: true }),
      useRepoStore.getState().refresh({ status: true })
    ])

    expect(api.status).toHaveBeenCalledTimes(1)
  })

  it('진행 중인 refresh가 같은 scope를 포함하면 같은 promise를 공유한다', async () => {
    const api = installApi()
    let resolveStatus: (value: StatusDto) => void = () => {}
    api.status.mockReturnValueOnce(new Promise<StatusDto>((resolve) => {
      resolveStatus = resolve
    }))

    const first = useRepoStore.getState().refresh({ status: true })
    await Promise.resolve()
    const second = useRepoStore.getState().refresh({ status: true })
    resolveStatus(status)
    await Promise.all([first, second])

    expect(api.status).toHaveBeenCalledTimes(1)
  })

  it('history 옵션 변경은 커밋 목록을 비우고 새 옵션으로 history만 다시 읽는다', async () => {
    const api = installApi()

    await useRepoStore.getState().setHistoryOptions({ order: 'date-order', all: true })

    expect(api.log).toHaveBeenCalledTimes(1)
    expect(api.log).toHaveBeenCalledWith(0, 500, { order: 'date-order', all: true })
    expect(api.branches).not.toHaveBeenCalled()
    expect(api.status).not.toHaveBeenCalled()
    expect(api.stashList).not.toHaveBeenCalled()
    expect(useRepoStore.getState().historyOptions).toEqual({ order: 'date-order', all: true })
    expect(useRepoStore.getState().historyVersion).toBe(1)
  })

  it('loadMore는 현재 history 옵션으로 다음 페이지를 읽는다', async () => {
    const api = installApi()
    useRepoStore.setState({
      commits: [{ hash: 'a', parents: [], author: 'A', email: 'a@test.com', date: '', subject: 'a', refs: [] }],
      historyOptions: { order: 'date-order', all: true }
    })

    await useRepoStore.getState().loadMore()

    expect(api.log).toHaveBeenCalledWith(1, 500, { order: 'date-order', all: true })
  })
})
