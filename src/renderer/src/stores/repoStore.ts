import { create } from 'zustand'
import type { BranchDto, CommitDto, RepoInfoDto, StashDto, StatusDto } from '../../../shared/types'

// 한 번에 불러오는 커밋 수 — 그래프 무한 스크롤의 페이지 단위
export const PAGE_SIZE = 500

interface RepoState {
  repo: RepoInfoDto | null
  commits: CommitDto[]
  branches: BranchDto[]
  status: StatusDto | null
  stashes: StashDto[]
  hasMoreCommits: boolean
  loadingMore: boolean
  openRepo(path: string): Promise<void>
  refresh(): Promise<void>
  loadMore(): Promise<void>
}

export const useRepoStore = create<RepoState>((set, get) => ({
  repo: null,
  commits: [],
  branches: [],
  status: null,
  stashes: [],
  hasMoreCommits: true,
  loadingMore: false,

  async openRepo(path: string) {
    const repo = await window.api.openRepo(path)
    set({ repo, commits: [], hasMoreCommits: true })
    await get().refresh()
  },

  async refresh() {
    if (!get().repo) return
    // 현재 로드된 깊이만큼 다시 불러와 스크롤 위치를 보존한다
    const depth = Math.max(PAGE_SIZE, get().commits.length)
    const [commits, branches, status, stashes] = await Promise.all([
      window.api.log(0, depth),
      window.api.branches(),
      window.api.status(),
      window.api.stashList()
    ])
    set({ commits, branches, status, stashes, hasMoreCommits: commits.length === depth })
  },

  async loadMore() {
    const { repo, loadingMore, hasMoreCommits, commits } = get()
    if (!repo || loadingMore || !hasMoreCommits) return
    set({ loadingMore: true })
    try {
      const page = await window.api.log(commits.length, PAGE_SIZE)
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
  }
}))
