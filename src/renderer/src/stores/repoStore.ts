import { create } from 'zustand'
import type {
  BranchDto,
  CommitDto,
  HistoryOptions,
  RepoInfoDto,
  StashDto,
  StatusDto
} from '../../../shared/types'

// 한 번에 불러오는 커밋 수 — 그래프 무한 스크롤의 페이지 단위
export const PAGE_SIZE = 500
export const DEFAULT_HISTORY_OPTIONS: HistoryOptions = {
  order: 'topo-order',
  all: false
}

export interface RefreshScope {
  history?: boolean
  branches?: boolean
  status?: boolean
  stashes?: boolean
}

type NormalizedRefreshScope = Required<RefreshScope>

interface RepoState {
  repo: RepoInfoDto | null
  commits: CommitDto[]
  branches: BranchDto[]
  status: StatusDto | null
  stashes: StashDto[]
  historyVersion: number
  historyOptions: HistoryOptions
  hasMoreCommits: boolean
  loadingMore: boolean
  openRepo(path: string): Promise<void>
  refresh(scope?: RefreshScope): Promise<void>
  loadMore(): Promise<void>
  setHistoryOptions(options: Partial<HistoryOptions>): Promise<void>
}

const FULL_REFRESH: NormalizedRefreshScope = {
  history: true,
  branches: true,
  status: true,
  stashes: true
}

let queuedScope: NormalizedRefreshScope | null = null
let queuedResolvers: { resolve: () => void; reject: (err: unknown) => void }[] = []
let refreshRunning = false
let refreshScheduled = false
let activeScope: NormalizedRefreshScope | null = null
let activeHistoryOptionsKey: string | null = null
let activePromise: Promise<void> | null = null

function normalizeScope(scope?: RefreshScope): NormalizedRefreshScope {
  if (!scope) return { ...FULL_REFRESH }
  return {
    history: scope.history ?? false,
    branches: scope.branches ?? false,
    status: scope.status ?? false,
    stashes: scope.stashes ?? false
  }
}

function mergeScope(a: NormalizedRefreshScope | null, b: NormalizedRefreshScope): NormalizedRefreshScope {
  return {
    history: (a?.history ?? false) || b.history,
    branches: (a?.branches ?? false) || b.branches,
    status: (a?.status ?? false) || b.status,
    stashes: (a?.stashes ?? false) || b.stashes
  }
}

function subtractCoveredScope(
  requested: NormalizedRefreshScope,
  covered: NormalizedRefreshScope | null,
  requestedHistoryOptionsKey: string,
  coveredHistoryOptionsKey: string | null
): NormalizedRefreshScope {
  return {
    history:
      requested.history &&
      (!(covered?.history ?? false) || requestedHistoryOptionsKey !== coveredHistoryOptionsKey),
    branches: requested.branches && !(covered?.branches ?? false),
    status: requested.status && !(covered?.status ?? false),
    stashes: requested.stashes && !(covered?.stashes ?? false)
  }
}

function isEmptyScope(scope: NormalizedRefreshScope): boolean {
  return !scope.history && !scope.branches && !scope.status && !scope.stashes
}

function historyOptionsKey(options: HistoryOptions): string {
  return `${options.order}:${options.all ? 'all' : 'current'}`
}

async function drainRefreshQueue(refreshOnce: (scope: NormalizedRefreshScope) => Promise<void>): Promise<void> {
  if (refreshRunning) return
  refreshRunning = true
  refreshScheduled = false
  while (queuedScope) {
    const scope = queuedScope
    const resolvers = queuedResolvers
    queuedScope = null
    queuedResolvers = []
    activeScope = scope
    activeHistoryOptionsKey = historyOptionsKey(useRepoStore.getState().historyOptions)
    activePromise = refreshOnce(scope)
    try {
      await activePromise
      resolvers.forEach(({ resolve }) => resolve())
    } catch (err) {
      resolvers.forEach(({ reject }) => reject(err))
    } finally {
      activeScope = null
      activeHistoryOptionsKey = null
      activePromise = null
    }
  }
  refreshRunning = false
}

function enqueueRefresh(
  scope: NormalizedRefreshScope,
  refreshOnce: (scope: NormalizedRefreshScope) => Promise<void>
): Promise<void> {
  const requestedHistoryOptionsKey = historyOptionsKey(useRepoStore.getState().historyOptions)
  const uncovered = subtractCoveredScope(scope, activeScope, requestedHistoryOptionsKey, activeHistoryOptionsKey)
  if (activePromise && isEmptyScope(uncovered)) return activePromise
  if (isEmptyScope(uncovered)) return Promise.resolve()
  queuedScope = mergeScope(queuedScope, uncovered)
  return new Promise((resolve, reject) => {
    queuedResolvers.push({ resolve, reject })
    if (!refreshScheduled && !refreshRunning) {
      refreshScheduled = true
      queueMicrotask(() => void drainRefreshQueue(refreshOnce))
    }
  })
}

export const useRepoStore = create<RepoState>((set, get) => ({
  repo: null,
  commits: [],
  branches: [],
  status: null,
  stashes: [],
  historyVersion: 0,
  historyOptions: DEFAULT_HISTORY_OPTIONS,
  hasMoreCommits: true,
  loadingMore: false,

  async openRepo(path: string) {
    const repo = await window.api.openRepo(path)
    set({
      repo,
      commits: [],
      branches: [],
      status: null,
      stashes: [],
      historyVersion: 0,
      historyOptions: get().historyOptions,
      hasMoreCommits: true
    })
    await get().refresh()
  },

  async refresh(scope) {
    if (!get().repo) return
    await enqueueRefresh(normalizeScope(scope), async (s) => {
      if (!get().repo) return
      // 현재 로드된 깊이만큼 다시 불러와 스크롤 위치를 보존한다
      const depth = Math.max(PAGE_SIZE, get().commits.length)
      const historyOptions = get().historyOptions
      const requestHistoryOptionsKey = historyOptionsKey(historyOptions)
      const [commits, branches, status, stashes] = await Promise.all([
        s.history ? window.api.log(0, depth, historyOptions) : Promise.resolve(get().commits),
        s.branches ? window.api.branches() : Promise.resolve(get().branches),
        s.status ? window.api.status() : Promise.resolve(get().status),
        s.stashes ? window.api.stashList() : Promise.resolve(get().stashes)
      ])
      set((state) => ({
        commits:
          s.history && historyOptionsKey(state.historyOptions) === requestHistoryOptionsKey
            ? commits
            : state.commits,
        branches,
        status,
        stashes,
        hasMoreCommits:
          s.history && historyOptionsKey(state.historyOptions) === requestHistoryOptionsKey
            ? commits.length === depth
            : state.hasMoreCommits,
        historyVersion:
          s.history && historyOptionsKey(state.historyOptions) === requestHistoryOptionsKey
            ? state.historyVersion + 1
            : state.historyVersion
      }))
    })
  },

  async loadMore() {
    const { repo, loadingMore, hasMoreCommits, commits, historyOptions } = get()
    if (!repo || loadingMore || !hasMoreCommits) return
    const requestHistoryOptionsKey = historyOptionsKey(historyOptions)
    set({ loadingMore: true })
    try {
      const page = await window.api.log(commits.length, PAGE_SIZE, historyOptions)
      if (historyOptionsKey(get().historyOptions) !== requestHistoryOptionsKey) return
      // 페이지 사이 ref 이동으로 커밋이 경계를 넘을 수 있어 중복을 제거하며 덧붙인다
      const seen = new Set(get().commits.map((c) => c.hash))
      const fresh = page.filter((c) => !seen.has(c.hash))
      set({
        commits: [...get().commits, ...fresh],
        hasMoreCommits: page.length === PAGE_SIZE
      })
    } finally {
      set({ loadingMore: false })
    }
  },

  async setHistoryOptions(options) {
    const current = get().historyOptions
    const next = { ...current, ...options }
    if (historyOptionsKey(current) === historyOptionsKey(next)) return
    set({
      historyOptions: next,
      commits: [],
      hasMoreCommits: true,
      loadingMore: false
    })
    await get().refresh({ history: true })
  }
}))
