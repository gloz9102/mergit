import { create } from 'zustand'

export type Selection = { type: 'commit'; hash: string } | { type: 'wip' } | null

// 중앙 영역에 크게 표시되는 diff (그래프를 잠시 대체)
export interface DiffView {
  title: string // 파일 경로
  text: string
}

// 좌측 브랜치 패널의 입력 모드 — filter: 목록 좁힘, search: 하이라이트만. 동시에 하나만 활성.
export interface BranchQuery {
  mode: 'filter' | 'search'
  text: string
}

// 커밋 그래프 검색(메시지·작성자) — 브랜치 검색과 동시에 열리지 않는다
export interface CommitQuery {
  text: string
}

interface Toast {
  id: number
  message: string
  detail?: string
}

interface ConfirmState {
  message: string
  onConfirm: () => void
}

interface UiState {
  selected: Selection
  conflictFile: string | null
  showSettings: boolean
  toasts: Toast[]
  confirm: ConfirmState | null
  // 진행 중인 git 작업 키 (예: 'pull') — 버튼 스피너/비활성화에 사용
  pending: Record<string, boolean>
  appVersion: string
  diffView: DiffView | null
  branchQuery: BranchQuery | null
  commitQuery: CommitQuery | null
  select(sel: Selection): void
  openDiff(view: DiffView | null): void
  startFilter(initial: string): void
  startSearch(): void
  setBranchQueryText(text: string): void
  closeBranchQuery(): void
  openCommitSearch(): void
  setCommitQueryText(text: string): void
  closeCommitSearch(): void
  openConflict(path: string | null): void
  setShowSettings(v: boolean): void
  pushToast(message: string, detail?: string): void
  dismissToast(id: number): void
  ask(message: string, onConfirm: () => void): void
  closeConfirm(): void
  setPending(key: string, value: boolean): void
  setAppVersion(version: string): void
}

let toastId = 0

export const useUiStore = create<UiState>((set) => ({
  selected: null,
  conflictFile: null,
  showSettings: false,
  toasts: [],
  confirm: null,
  pending: {},
  appVersion: '',
  diffView: null,

  branchQuery: null,
  commitQuery: null,

  // 선택이 바뀌면 보고 있던 diff는 의미가 없어지므로 함께 닫는다
  select: (selected) => set({ selected, diffView: null }),
  openDiff: (diffView) => set({ diffView }),

  // 브랜치/커밋 검색은 상호 배타 — autoFocus 인풋이 동시에 두 개 열리는 것을 막는다
  startFilter: (initial) => set({ branchQuery: { mode: 'filter', text: initial }, commitQuery: null }),
  // 필터 중이어도 비우고 검색으로 전환 (요구사항: 필터링 중이면 중지)
  startSearch: () => set({ branchQuery: { mode: 'search', text: '' }, commitQuery: null }),
  setBranchQueryText: (text) =>
    set((s) => {
      if (!s.branchQuery) return {}
      // 필터 모드에서 문자를 모두 지우면 필터 해제 (검색 모드는 빈 값 허용)
      if (s.branchQuery.mode === 'filter' && text === '') return { branchQuery: null }
      return { branchQuery: { ...s.branchQuery, text } }
    }),
  closeBranchQuery: () => set({ branchQuery: null }),

  openCommitSearch: () => set({ commitQuery: { text: '' }, branchQuery: null }),
  setCommitQueryText: (text) => set((s) => (s.commitQuery ? { commitQuery: { text } } : {})),
  closeCommitSearch: () => set({ commitQuery: null }),
  openConflict: (conflictFile) => set({ conflictFile }),
  setShowSettings: (showSettings) => set({ showSettings }),

  pushToast: (message, detail) => {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts, { id, message, detail }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 6000)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  ask: (message, onConfirm) => set({ confirm: { message, onConfirm } }),
  closeConfirm: () => set({ confirm: null }),

  setPending: (key, value) => set((s) => ({ pending: { ...s.pending, [key]: value } })),
  setAppVersion: (appVersion) => set({ appVersion })
}))
