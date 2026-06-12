import { useEffect } from 'react'
import { useRepoStore } from './stores/repoStore'
import { useUiStore } from './stores/uiStore'
import { Toolbar } from './components/Toolbar'
import { EmptyState } from './components/EmptyState'
import { LeftPanel } from './components/LeftPanel'
import { GraphView } from './components/GraphView'
import { DiffPanel } from './components/DiffPanel'
import { RightPanel } from './components/RightPanel'
import { MergeBanner } from './components/MergeBanner'
import { ConflictEditor } from './components/ConflictEditor'
import { SettingsModal } from './components/SettingsModal'
import { ConfirmDialog } from './components/ConfirmDialog'
import { Toasts } from './components/Toasts'

export default function App() {
  const repo = useRepoStore((s) => s.repo)
  const refresh = useRepoStore((s) => s.refresh)
  const diffView = useUiStore((s) => s.diffView)

  useEffect(() => window.api.onRepoChanged(() => void refresh()), [refresh])

  // 전역 키 입력: 포커스 없는 타이핑 → 브랜치 필터, Ctrl/Cmd+F → 브랜치 검색
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const ui = useUiStore.getState()
      if (!useRepoStore.getState().repo) return
      if (ui.showSettings || ui.conflictFile !== null || ui.confirm !== null) return
      const el = e.target as HTMLElement | null
      // Ctrl/Cmd+F는 다른 input에 있어도 가로채 검색 진입 (자체 query input은 onKeyDown이 처리)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        if (el?.closest?.('[data-branch-query]')) return
        e.preventDefault()
        ui.startSearch()
        return
      }
      // 입력 요소 포커스 중에는 타이핑 필터 금지 (커밋 textarea, rename, CodeMirror 등)
      if (
        el?.tagName === 'INPUT' ||
        el?.tagName === 'TEXTAREA' ||
        el?.isContentEditable ||
        el?.closest?.('.cm-content')
      ) {
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.isComposing || e.keyCode === 229) return // 한글 IME 조합 중
      if (e.key.length !== 1) return // printable 문자만
      e.preventDefault()
      ui.startFilter(e.key)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-screen flex-col bg-zinc-900 text-zinc-200">
      <Toolbar />
      <MergeBanner />
      {repo ? (
        <div className="flex min-h-0 flex-1">
          <LeftPanel />
          {diffView ? <DiffPanel /> : <GraphView />}
          <RightPanel />
        </div>
      ) : (
        <EmptyState />
      )}
      <ConflictEditor />
      <SettingsModal />
      <ConfirmDialog />
      <Toasts />
    </div>
  )
}
