import { create } from 'zustand'
import type { BranchDto, CommitDto, RepoInfoDto, StashDto, StatusDto } from '../../../shared/types'

interface RepoState {
  repo: RepoInfoDto | null
  commits: CommitDto[]
  branches: BranchDto[]
  status: StatusDto | null
  stashes: StashDto[]
  openRepo(path: string): Promise<void>
  refresh(): Promise<void>
}

export const useRepoStore = create<RepoState>((set, get) => ({
  repo: null,
  commits: [],
  branches: [],
  status: null,
  stashes: [],

  async openRepo(path: string) {
    const repo = await window.api.openRepo(path)
    set({ repo })
    await get().refresh()
  },

  async refresh() {
    if (!get().repo) return
    const [commits, branches, status, stashes] = await Promise.all([
      window.api.log(),
      window.api.branches(),
      window.api.status(),
      window.api.stashList()
    ])
    set({ commits, branches, status, stashes })
  }
}))
