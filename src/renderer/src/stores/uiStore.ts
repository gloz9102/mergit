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
  diffView: DiffView | null
  branchQuery: BranchQuery | null
  select(sel: Selection): void
  openDiff(view: DiffView | null): void
  startFilter(initial: string): void
  startSearch(): void
  setBranchQueryText(text: string): void
  closeBranchQuery(): void
  openConflict(path: string | null): void
  setShowSettings(v: boolean): void
  pushToast(message: string, detail?: string): void
  dismissToast(id: number): void
  ask(message: string, onConfirm: () => void): void
  closeConfirm(): void
  setPending(key: string, value: boolean): void
}

let toastId = 0

export const useUiStore = create<UiState>((set) => ({
  selected: null,
  conflictFile: null,
  showSettings: false,
  toasts: [],
  confirm: null,
  pending: {},
  diffView: null,

  branchQuery: null,

  // 선택이 바뀌면 보고 있던 diff는 의미가 없어지므로 함께 닫는다
  select: (selected) => set({ selected, diffView: null }),
  openDiff: (diffView) => set({ diffView }),

  startFilter: (initial) => set({ branchQuery: { mode: 'filter', text: initial } }),
  // 필터 중이어도 비우고 검색으로 전환 (요구사항: 필터링 중이면 중지)
  startSearch: () => set({ branchQuery: { mode: 'search', text: '' } }),
  setBranchQueryText: (text) =>
    set((s) => (s.branchQuery ? { branchQuery: { ...s.branchQuery, text } } : {})),
  closeBranchQuery: () => set({ branchQuery: null }),
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

  setPending: (key, value) => set((s) => ({ pending: { ...s.pending, [key]: value } }))
}))
