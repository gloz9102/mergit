import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommitDto, RepoInfoDto, StatusDto } from '../../../../shared/types'
import { useUiStore } from '../uiStore'
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
    openRepo: vi.fn(),
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
      loadingMore: false,
      repoGeneration: 0
    })
    useUiStore.setState({
      selected: null,
      conflictFile: null,
      diffView: null,
      diffRequest: null,
      branchQuery: null,
      commitQuery: null,
      pending: {}
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

  it('trailing refresh는 진행 중인 같은 scope refresh 뒤에 한 번 더 실행된다', async () => {
    const api = installApi()
    const firstStatus = deferred<StatusDto>()
    api.status.mockReturnValueOnce(firstStatus.promise).mockResolvedValue(status)

    const first = useRepoStore.getState().refresh({ status: true })
    await Promise.resolve()
    const trailing = useRepoStore.getState().refresh({ status: true }, { trailing: true })
    expect(api.status).toHaveBeenCalledTimes(1)

    firstStatus.resolve(status)
    await Promise.all([first, trailing])

    expect(api.status).toHaveBeenCalledTimes(2)
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
      commits: [{ hash: 'a', parents: [], author: 'A', email: 'a@test.com', date: '', subject: 'a', body: '', refs: [] }],
      historyOptions: { order: 'date-order', all: true }
    })

    await useRepoStore.getState().loadMore()

    expect(api.log).toHaveBeenCalledWith(1, 500, { order: 'date-order', all: true })
  })

  it('동시에 호출된 loadMore는 같은 요청 완료를 공유한다', async () => {
    const api = installApi()
    const page = deferred<CommitDto[]>()
    api.log.mockReturnValueOnce(page.promise)

    const first = useRepoStore.getState().loadMore()
    const second = useRepoStore.getState().loadMore()
    await Promise.resolve()

    expect(api.log).toHaveBeenCalledTimes(1)
    expect(useRepoStore.getState().loadingMore).toBe(true)
    page.resolve([])
    await Promise.all([first, second])
    expect(useRepoStore.getState().loadingMore).toBe(false)
  })

  it('중복 페이지로 새 커밋이 늘지 않으면 추가 로딩을 종료한다', async () => {
    const api = installApi()
    const commit = { hash: 'a', parents: [], author: 'A', email: 'a@test.com', date: '', subject: 'a', body: '', refs: [] }
    useRepoStore.setState({ commits: [commit] })
    api.log.mockResolvedValue(Array.from({ length: 500 }, () => commit))

    await useRepoStore.getState().loadMore()

    expect(useRepoStore.getState().commits).toEqual([commit])
    expect(useRepoStore.getState().hasMoreCommits).toBe(false)
  })

  it('loadMore: 저장소 전환 후 이전 요청의 finally가 새 loadingMore를 덮지 않는다', async () => {
    const api = installApi()
    const slowLog = deferred<CommitDto[]>()
    api.log.mockReturnValueOnce(slowLog.promise)
    useRepoStore.setState({
      repo: { path: '/repo-a', name: 'repo-a' },
      repoGeneration: 1,
      commits: [{ hash: 'a', parents: [], author: 'A', email: 'a@test.com', date: '', subject: 'a', body: '', refs: [] }],
      loadingMore: false,
      hasMoreCommits: true
    })

    const loadMore = useRepoStore.getState().loadMore()
    await Promise.resolve()
    expect(useRepoStore.getState().loadingMore).toBe(true)

    useRepoStore.setState({
      repo: { path: '/repo-b', name: 'repo-b' },
      repoGeneration: 2,
      commits: [{ hash: 'b', parents: [], author: 'B', email: 'b@test.com', date: '', subject: 'b', body: '', refs: [] }],
      loadingMore: true
    })
    slowLog.resolve([])
    await loadMore

    expect(useRepoStore.getState().repo?.path).toBe('/repo-b')
    expect(useRepoStore.getState().loadingMore).toBe(true)
  })

  it('openRepo: 늦게 끝난 이전 요청은 최신 저장소 state를 덮지 않는다', async () => {
    const api = installApi()
    const first = deferred<RepoInfoDto>()
    const second = deferred<RepoInfoDto>()
    api.openRepo.mockImplementation((path: string) => (path === '/repo-a' ? first.promise : second.promise))
    useUiStore.setState({
      selected: { type: 'wip' },
      conflictFile: 'conflicted.txt',
      diffView: { title: 'old.txt', text: 'old' },
      diffRequest: { id: 1, repoGeneration: 0, targetKey: 'working:unstaged:old.txt' }
    })

    const firstOpen = useRepoStore.getState().openRepo('/repo-a')
    const secondOpen = useRepoStore.getState().openRepo('/repo-b')

    second.resolve({ path: '/repo-b', name: 'repo-b' })
    await secondOpen
    expect(useRepoStore.getState().repo?.path).toBe('/repo-b')
    expect(useUiStore.getState().selected).toBe(null)
    expect(useUiStore.getState().conflictFile).toBe(null)
    expect(useUiStore.getState().diffView).toBe(null)
    expect(useUiStore.getState().diffRequest).toBe(null)

    first.resolve({ path: '/repo-a', name: 'repo-a' })
    await firstOpen
    expect(useRepoStore.getState().repo?.path).toBe('/repo-b')
  })

  it('refresh: repoGeneration이 바뀌면 이전 refresh 결과를 폐기한다', async () => {
    const api = installApi()
    const slowLog = deferred<CommitDto[]>()
    api.log.mockReturnValueOnce(slowLog.promise)
    useRepoStore.setState({ repoGeneration: 1 })

    const refresh = useRepoStore.getState().refresh({ history: true })
    await Promise.resolve()
    useRepoStore.setState({
      repo: { path: '/repo-b', name: 'repo-b' },
      repoGeneration: 2,
      commits: [
        { hash: 'b', parents: [], author: 'B', email: 'b@test.com', date: '', subject: 'b', body: '', refs: [] }
      ]
    })
    slowLog.resolve([
      { hash: 'a', parents: [], author: 'A', email: 'a@test.com', date: '', subject: 'a', body: '', refs: [] }
    ])
    await refresh

    expect(useRepoStore.getState().commits.map((commit) => commit.hash)).toEqual(['b'])
  })
})

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}
