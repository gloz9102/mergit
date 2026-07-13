import { lazy, Suspense, useEffect, useState } from 'react'
import i18n from './i18n'
import { toastError } from './lib/run'
import { useRepoStore } from './stores/repoStore'
import { useUiStore } from './stores/uiStore'
import { Toolbar } from './components/Toolbar'
import { EmptyState } from './components/EmptyState'
import { LeftPanel } from './components/LeftPanel'
import { GraphView } from './components/GraphView'
import { DiffPanel } from './components/DiffPanel'
import { ResizeHandle } from './components/ResizeHandle'
import { RightPanel } from './components/RightPanel'
import { MergeBanner } from './components/MergeBanner'
import { ConfirmDialog } from './components/ConfirmDialog'
import { Toasts } from './components/Toasts'

const ConflictEditor = lazy(() =>
  import('./components/ConflictEditor').then((module) => ({ default: module.ConflictEditor }))
)
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((module) => ({ default: module.SettingsModal }))
)
const UpdateModal = lazy(() =>
  import('./components/UpdateModal').then((module) => ({ default: module.UpdateModal }))
)

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

function usePanelWidth(key: string, initial: number): [number, (dx: number, invert?: boolean) => void] {
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(key))
    return Number.isFinite(saved) && saved > 0 ? saved : initial
  })
  useEffect(() => localStorage.setItem(key, String(width)), [key, width])
  const resize = (dx: number, invert = false): void =>
    setWidth((w) => clamp(w + (invert ? -dx : dx), 160, 560))
  return [width, resize]
}

export default function App() {
  const repo = useRepoStore((s) => s.repo)
  const refresh = useRepoStore((s) => s.refresh)
  const diffView = useUiStore((s) => s.diffView)
  const conflictFile = useUiStore((s) => s.conflictFile)
  const appVersion = useUiStore((s) => s.appVersion)
  const autoCheckForUpdates = useUiStore((s) => s.autoCheckForUpdates)
  const autoDownloadUpdates = useUiStore((s) => s.autoDownloadUpdates)
  const [leftWidth, resizeLeft] = usePanelWidth('leftPanelWidth', 224)
  const [rightWidth, resizeRight] = usePanelWidth('rightPanelWidth', 320)

  useEffect(() => window.api.onRepoChanged((scope) => void refresh(scope, { trailing: true })), [refresh])
  useEffect(
    () =>
      window.api.onAppCloseRequested(() => {
        const ui = useUiStore.getState()
        if (ui.confirm) return
        ui.ask(i18n.t('app.quitConfirm'), () => {
          void window.api.confirmWindowClose().catch(toastError)
        })
      }),
    []
  )
  useEffect(
    () =>
      window.api.onRepoWatchError((error) => {
        useUiStore.getState().pushToast(i18n.t('error.WATCHER'), error.detail)
      }),
    []
  )

  // "새 창으로 저장소 열기"로 만들어진 창이면 예약된 경로를 받아 자동으로 연다
  useEffect(() => {
    void window.api
      .initialRepoPath()
      .then((path) => (path ? useRepoStore.getState().openRepo(path) : undefined))
      .catch(toastError)
  }, [])

  useEffect(
    () =>
      window.api.onUpdateEvent((event) => {
        const ui = useUiStore.getState()
        ui.setUpdateState(event)
        if (event.status === 'error') {
          ui.pushToast(i18n.t('error.UPDATE_FAILED'), event.detail ?? event.message)
        }
      }),
    []
  )

  // 앱 버전 적재
  useEffect(() => {
    void window.api
      .getAppVersion()
      .then((v) => useUiStore.getState().setAppVersion(v))
      .catch(() => {})
  }, [])

  // main process가 update scheduler와 현재 update state를 소유한다.
  useEffect(() => {
    void window.api
      .getUpdateState()
      .then((state) => useUiStore.getState().setUpdateState(state))
      .catch(() => {})
  }, [])

  useEffect(() => {
    void window.api
      .configureUpdateChecks({
        autoCheck: autoCheckForUpdates,
        autoDownload: autoDownloadUpdates
      })
      .then((state) => useUiStore.getState().setUpdateState(state))
      .catch(() => {})
  }, [autoCheckForUpdates, autoDownloadUpdates])

  // 창 제목: 저장소명과 앱 버전을 함께 보여준다.
  useEffect(() => {
    const appTitle = `Mergit${appVersion ? ` v${appVersion}` : ''}`
    document.title = repo ? `${repo.name} - ${appTitle}` : appTitle
  }, [appVersion, repo])

  // 전역 키 입력: 포커스 없는 타이핑 → 브랜치 필터, Ctrl/Cmd+F → 브랜치 검색
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const ui = useUiStore.getState()
      if (!useRepoStore.getState().repo) return
      if (ui.showSettings || ui.conflictFile !== null || ui.confirm !== null) return
      const el = e.target as HTMLElement | null
      // Ctrl/Cmd+F는 다른 input에 있어도 가로챈다 — 열려 있으면 해제, 아니면 검색 진입
      // (자체 query input 내부의 Ctrl(+Shift)+F는 stopPropagation으로 여기 오지 않는다)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        if (e.shiftKey) {
          // Ctrl/Cmd+Shift+F: 커밋 검색 토글
          if (ui.commitQuery) ui.closeCommitSearch()
          else ui.openCommitSearch()
        } else if (ui.branchQuery) ui.closeBranchQuery()
        // 커밋 검색이 열려 있어도 브랜치 검색으로 "전환"한다 (역방향도 동일한 대칭 동작 —
        // openCommitSearch/startSearch가 상호 배타로 반대쪽을 닫는다)
        else ui.startSearch()
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
    <main className="flex h-screen flex-col bg-zinc-900 text-zinc-200">
      <Toolbar />
      <MergeBanner />
      {repo ? (
        <div className="flex min-h-0 flex-1">
          <div style={{ width: leftWidth }} className="shrink-0">
            <LeftPanel />
          </div>
          <ResizeHandle onDrag={(dx) => resizeLeft(dx)} />
          {diffView ? <DiffPanel /> : <GraphView />}
          <ResizeHandle onDrag={(dx) => resizeRight(dx, true)} />
          <div style={{ width: rightWidth }} className="shrink-0">
            <RightPanel />
          </div>
        </div>
      ) : (
        <EmptyState />
      )}
      {conflictFile && (
        <Suspense
          fallback={
            <div role="status" className="fixed inset-0 z-30 flex items-center justify-center bg-zinc-900 text-sm text-zinc-400">
              {i18n.t('merge.loadingFile')}
            </div>
          }
        >
          <ConflictEditor />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <SettingsModal />
        <UpdateModal />
      </Suspense>
      <ConfirmDialog />
      <Toasts />
    </main>
  )
}
