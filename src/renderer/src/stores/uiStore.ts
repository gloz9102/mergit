import { create } from 'zustand'
import type { UpdateEventDto } from '../../../shared/api'
import type { GitErrorCode } from '../../../shared/types'

export type Selection = { type: 'commit'; hash: string } | { type: 'wip' } | { type: 'stash'; oid: string } | null

// 중앙 영역에 크게 표시되는 diff (그래프를 잠시 대체)
export interface DiffView {
  title: string // 파일 경로
  text: string
  targetKey?: string
}

export interface DiffRequest {
  id: number
  repoGeneration: number
  targetKey: string
}

export interface GitMutationToken {
  id: number
  key: string
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

export type BranchCheckoutGesture = 'single' | 'double'
export type LeftPanelSection = 'local' | 'remote' | 'stash'

export interface LeftPanelListLimits {
  local: number
  remote: number
  stash: number
}

export type ToastKind = 'info' | 'success' | 'error'

export interface Toast {
  id: number
  message: string
  detail?: string
  kind: ToastKind
  errorCode?: GitErrorCode
}

export interface ToastOptions {
  errorCode?: GitErrorCode
  persistent?: boolean
}

interface ConfirmState {
  message: string
  onConfirm: () => void
  tone: 'danger' | 'primary'
}

interface UiState {
  selected: Selection
  conflictFile: string | null
  showSettings: boolean
  toasts: Toast[]
  confirm: ConfirmState | null
  // 진행 중인 git 작업 키 (예: 'pull') — 버튼 스피너/비활성화에 사용
  pending: Record<string, boolean>
  gitMutation: GitMutationToken | null
  appVersion: string
  autoCheckForUpdates: boolean
  autoDownloadUpdates: boolean
  updateState: UpdateEventDto
  showUpdateModal: boolean
  branchCheckoutGesture: BranchCheckoutGesture
  leftPanelListLimits: LeftPanelListLimits
  alwaysShowCurrentBranch: boolean
  diffView: DiffView | null
  diffRequest: DiffRequest | null
  branchQuery: BranchQuery | null
  commitQuery: CommitQuery | null
  select(sel: Selection): void
  openDiff(view: DiffView | null): void
  beginDiffRequest(repoGeneration: number, targetKey: string): DiffRequest
  openDiffForRequest(request: DiffRequest, view: DiffView): void
  finishDiffRequest(request: DiffRequest): boolean
  startFilter(initial: string): void
  startSearch(): void
  setBranchQueryText(text: string): void
  closeBranchQuery(): void
  openCommitSearch(): void
  setCommitQueryText(text: string): void
  closeCommitSearch(): void
  openConflict(path: string | null): void
  setShowSettings(v: boolean): void
  pushToast(message: string, detail?: string, kind?: ToastKind, options?: ToastOptions): void
  dismissToast(id: number): void
  ask(message: string, onConfirm: () => void, tone?: ConfirmState['tone']): void
  closeConfirm(): void
  resetRepoScopedState(): void
  setPending(key: string, value: boolean): void
  beginGitMutation(key: string): GitMutationToken | null
  endGitMutation(token: GitMutationToken): void
  setAppVersion(version: string): void
  setAutoCheckForUpdates(value: boolean): void
  setAutoDownloadUpdates(value: boolean): void
  setUpdateState(event: UpdateEventDto): void
  dismissUpdateModal(): void
  setBranchCheckoutGesture(gesture: BranchCheckoutGesture): void
  setLeftPanelListLimit(section: LeftPanelSection, limit: number): void
  setAlwaysShowCurrentBranch(value: boolean): void
}

let toastId = 0
let diffRequestId = 0
let gitMutationId = 0
const BRANCH_CHECKOUT_GESTURE_KEY = 'branchCheckoutGesture'
const LEFT_PANEL_LIST_LIMITS_KEY = 'leftPanelListLimits'
const ALWAYS_SHOW_CURRENT_BRANCH_KEY = 'alwaysShowCurrentBranch'
const AUTO_CHECK_FOR_UPDATES_KEY = 'autoCheckForUpdates'
const AUTO_DOWNLOAD_UPDATES_KEY = 'autoDownloadUpdates'
const DEFAULT_LEFT_PANEL_LIST_LIMITS: LeftPanelListLimits = {
  local: 10,
  remote: 10,
  stash: 10
}

function loadBranchCheckoutGesture(): BranchCheckoutGesture {
  if (!hasLocalStorage()) return 'double'
  const saved = localStorage.getItem(BRANCH_CHECKOUT_GESTURE_KEY)
  return saved === 'single' || saved === 'double' ? saved : 'double'
}

function loadLeftPanelListLimits(): LeftPanelListLimits {
  if (!hasLocalStorage()) return DEFAULT_LEFT_PANEL_LIST_LIMITS
  try {
    const saved = JSON.parse(localStorage.getItem(LEFT_PANEL_LIST_LIMITS_KEY) ?? '{}') as Partial<LeftPanelListLimits>
    return {
      local: validLimit(saved.local) ?? DEFAULT_LEFT_PANEL_LIST_LIMITS.local,
      remote: validLimit(saved.remote) ?? DEFAULT_LEFT_PANEL_LIST_LIMITS.remote,
      stash: validLimit(saved.stash) ?? DEFAULT_LEFT_PANEL_LIST_LIMITS.stash
    }
  } catch {
    return DEFAULT_LEFT_PANEL_LIST_LIMITS
  }
}

function loadAlwaysShowCurrentBranch(): boolean {
  if (!hasLocalStorage()) return true
  const saved = localStorage.getItem(ALWAYS_SHOW_CURRENT_BRANCH_KEY)
  return saved === null ? true : saved === 'true'
}

function loadBoolean(key: string, defaultValue: boolean): boolean {
  if (!hasLocalStorage()) return defaultValue
  const saved = localStorage.getItem(key)
  return saved === null ? defaultValue : saved === 'true'
}

function hasLocalStorage(): boolean {
  return (
    typeof localStorage !== 'undefined' &&
    typeof localStorage.getItem === 'function' &&
    typeof localStorage.setItem === 'function'
  )
}

function sameDiffRequest(a: DiffRequest | null, b: DiffRequest): boolean {
  return (
    a?.id === b.id &&
    a.repoGeneration === b.repoGeneration &&
    a.targetKey === b.targetKey
  )
}

function validLimit(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : null
}

export const useUiStore = create<UiState>((set) => ({
  selected: null,
  conflictFile: null,
  showSettings: false,
  toasts: [],
  confirm: null,
  pending: {},
  gitMutation: null,
  appVersion: '',
  autoCheckForUpdates: loadBoolean(AUTO_CHECK_FOR_UPDATES_KEY, true),
  autoDownloadUpdates: loadBoolean(AUTO_DOWNLOAD_UPDATES_KEY, false),
  updateState: { status: 'idle' },
  showUpdateModal: false,
  branchCheckoutGesture: loadBranchCheckoutGesture(),
  leftPanelListLimits: loadLeftPanelListLimits(),
  alwaysShowCurrentBranch: loadAlwaysShowCurrentBranch(),
  diffView: null,
  diffRequest: null,

  branchQuery: null,
  commitQuery: null,

  // 선택이 바뀌면 보고 있던 diff는 의미가 없어지므로 함께 닫는다
  select: (selected) => set({ selected, diffView: null, diffRequest: null }),
  openDiff: (diffView) => set({ diffView, diffRequest: null }),
  beginDiffRequest: (repoGeneration, targetKey) => {
    const request = { id: ++diffRequestId, repoGeneration, targetKey }
    set({ diffRequest: request })
    return request
  },
  openDiffForRequest: (request, diffView) =>
    set((s) =>
      sameDiffRequest(s.diffRequest, request)
        ? { diffView: { ...diffView, targetKey: diffView.targetKey ?? request.targetKey }, diffRequest: null }
        : {}
    ),
  finishDiffRequest: (request) => {
    let matched = false
    set((s) => {
      if (!sameDiffRequest(s.diffRequest, request)) return {}
      matched = true
      return { diffRequest: null }
    })
    return matched
  },

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

  pushToast: (message, detail, kind = 'info', options) => {
    const id = ++toastId
    set((s) => ({
      toasts: [...s.toasts, { id, message, detail, kind, errorCode: options?.errorCode }]
    }))
    if (!options?.persistent) {
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 6000)
    }
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  ask: (message, onConfirm, tone = 'danger') => set({ confirm: { message, onConfirm, tone } }),
  closeConfirm: () => set({ confirm: null }),
  resetRepoScopedState: () =>
    set({
      selected: null,
      conflictFile: null,
      diffView: null,
      diffRequest: null,
      branchQuery: null,
      commitQuery: null,
      confirm: null,
      pending: {},
      gitMutation: null
    }),

  setPending: (key, value) => set((s) => ({ pending: { ...s.pending, [key]: value } })),
  beginGitMutation: (key) => {
    let token: GitMutationToken | null = null
    set((state) => {
      if (state.gitMutation) return {}
      token = { id: ++gitMutationId, key }
      return { gitMutation: token }
    })
    return token
  },
  endGitMutation: (token) =>
    set((state) => (state.gitMutation?.id === token.id ? { gitMutation: null } : {})),
  setAppVersion: (appVersion) => set({ appVersion }),
  setAutoCheckForUpdates: (autoCheckForUpdates) => {
    if (hasLocalStorage()) {
      localStorage.setItem(AUTO_CHECK_FOR_UPDATES_KEY, String(autoCheckForUpdates))
    }
    set({ autoCheckForUpdates })
  },
  setAutoDownloadUpdates: (autoDownloadUpdates) => {
    if (hasLocalStorage()) {
      localStorage.setItem(AUTO_DOWNLOAD_UPDATES_KEY, String(autoDownloadUpdates))
    }
    set({ autoDownloadUpdates })
  },
  setUpdateState: (updateState) =>
    set({
      updateState,
      showUpdateModal:
        updateState.status === 'available' ||
        updateState.status === 'downloading' ||
        updateState.status === 'downloaded'
    }),
  dismissUpdateModal: () => set({ showUpdateModal: false }),
  setBranchCheckoutGesture: (branchCheckoutGesture) => {
    if (hasLocalStorage()) {
      localStorage.setItem(BRANCH_CHECKOUT_GESTURE_KEY, branchCheckoutGesture)
    }
    set({ branchCheckoutGesture })
  },
  setLeftPanelListLimit: (section, limit) =>
    set((state) => {
      const next = {
        ...state.leftPanelListLimits,
        [section]: Math.max(1, Math.floor(limit))
      }
      if (hasLocalStorage()) {
        localStorage.setItem(LEFT_PANEL_LIST_LIMITS_KEY, JSON.stringify(next))
      }
      return { leftPanelListLimits: next }
    }),
  setAlwaysShowCurrentBranch: (alwaysShowCurrentBranch) => {
    if (hasLocalStorage()) {
      localStorage.setItem(ALWAYS_SHOW_CURRENT_BRANCH_KEY, String(alwaysShowCurrentBranch))
    }
    set({ alwaysShowCurrentBranch })
  }
}))
