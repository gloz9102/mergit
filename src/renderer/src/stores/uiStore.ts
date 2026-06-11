import { create } from 'zustand'

export type Selection = { type: 'commit'; hash: string } | { type: 'wip' } | null

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
  select(sel: Selection): void
  openConflict(path: string | null): void
  setShowSettings(v: boolean): void
  pushToast(message: string, detail?: string): void
  dismissToast(id: number): void
  ask(message: string, onConfirm: () => void): void
  closeConfirm(): void
}

let toastId = 0

export const useUiStore = create<UiState>((set) => ({
  selected: null,
  conflictFile: null,
  showSettings: false,
  toasts: [],
  confirm: null,

  select: (selected) => set({ selected }),
  openConflict: (conflictFile) => set({ conflictFile }),
  setShowSettings: (showSettings) => set({ showSettings }),

  pushToast: (message, detail) => {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts, { id, message, detail }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 6000)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  ask: (message, onConfirm) => set({ confirm: { message, onConfirm } }),
  closeConfirm: () => set({ confirm: null })
}))
