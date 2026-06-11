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
