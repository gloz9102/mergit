import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FileStatusDto } from '../../../shared/types'
import { useLatestDiff, workingDiffTargetKey } from '../lib/useLatestDiff'
import { splitPath } from '../lib/paths'
import { run, toastError } from '../lib/run'
import { useRepoStore } from '../stores/repoStore'
import { useUiStore } from '../stores/uiStore'

export function StagingPanel() {
  const { t } = useTranslation()
  const status = useRepoStore((s) => s.status)
  const commits = useRepoStore((s) => s.commits)
  const ask = useUiStore((s) => s.ask)
  const diffView = useUiStore((s) => s.diffView)
  const openDiff = useUiStore((s) => s.openDiff)
  const { showDiff: showLatestDiff, clearDiff } = useLatestDiff()
  const [message, setMessage] = useState('')
  const [amend, setAmend] = useState(false)
  // amend 체크 전에 작성하던 메시지 — 체크 해제 시 복원
  const savedMessage = useRef('')

  // 충돌 파일은 MergeBanner/ConflictEditor가 담당
  const files = status?.files ?? []
  const staged = useMemo(
    () => files.filter((f) => !f.isConflicted && f.index !== ' ' && f.index !== '?'),
    [files]
  )
  const unstaged = useMemo(
    () => files.filter((f) => !f.isConflicted && f.workingDir !== ' ' && f.workingDir !== ''),
    [files]
  )

  // diff는 중앙 영역(DiffPanel)에 크게 표시한다
  const showDiff = useCallback(async (file: FileStatusDto, fromStaged: boolean): Promise<void> => {
    await showLatestDiff({
      key: workingDiffTargetKey(file.path, fromStaged),
      title: file.path,
      load: () => window.api.diffWorkingFile(file.path, fromStaged)
    })
  }, [showLatestDiff])

  if (!status) return null
  const canAmend = commits.length > 0 && status.operation === null

  function commit(): void {
    const msg = message.trim()
    if (!msg) return
    const isAmend = amend
    void run(async () => {
      await window.api.commit(msg, isAmend)
      setMessage('')
      savedMessage.current = ''
      setAmend(false)
      openDiff(null)
    }, isAmend ? 'toast.amended' : 'toast.committed')
  }

  function toggleAmend(checked: boolean): void {
    if (!checked) {
      setAmend(false)
      setMessage(savedMessage.current)
      return
    }
    const proceed = async (): Promise<void> => {
      try {
        savedMessage.current = message
        // 본문까지 포함한 전체 메시지를 prefill
        setMessage(await window.api.lastCommitMessage())
        setAmend(true)
      } catch (err) {
        toastError(err)
      }
    }
    // ahead 0이면 HEAD가 이미 원격에 있다고 보고 히스토리 변경을 경고한다
    if (status?.tracking && status.ahead === 0) {
      ask(t('panel.amendPushedConfirm'), () => void proceed())
    } else {
      void proceed()
    }
  }

  return (
    <div className="flex h-full flex-col gap-2 p-3 text-sm">
      <p className="text-xs uppercase text-zinc-500">
        {t('panel.unstaged')} ({unstaged.length})
      </p>
      <FileList
        files={unstaged}
        fromStaged={false}
        activeDiffTargetKey={diffView?.targetKey ?? null}
        onShowDiff={showDiff}
        onClearDiff={clearDiff}
        onAsk={ask}
      />
      <p className="text-xs uppercase text-zinc-500">
        {t('panel.staged')} ({staged.length})
      </p>
      <FileList
        files={staged}
        fromStaged
        activeDiffTargetKey={diffView?.targetKey ?? null}
        onShowDiff={showDiff}
        onClearDiff={clearDiff}
        onAsk={ask}
      />
      <label
        className={`flex items-center gap-1.5 text-xs ${canAmend ? 'text-zinc-400' : 'text-zinc-600'}`}
      >
        <input
          type="checkbox"
          checked={amend}
          disabled={!canAmend}
          onChange={(e) => toggleAmend(e.target.checked)}
          className="accent-emerald-600"
        />
        {t('panel.amend')}
      </label>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t('panel.commitMessagePlaceholder')}
        rows={3}
        className="resize-none rounded bg-zinc-800 p-2 text-sm outline-none ring-1 ring-zinc-700 focus:ring-emerald-500"
      />
      <button
        onClick={commit}
        disabled={!message.trim() || (!amend && staged.length === 0)}
        className="rounded bg-emerald-700 py-1.5 text-sm font-semibold hover:bg-emerald-600 disabled:opacity-40"
      >
        {amend ? t('panel.amendCommit') : t('panel.commit')}
      </button>
    </div>
  )
}

const FileList = memo(function FileList({
  files,
  fromStaged,
  activeDiffTargetKey,
  onShowDiff,
  onClearDiff,
  onAsk
}: {
  files: FileStatusDto[]
  fromStaged: boolean
  activeDiffTargetKey: string | null
  onShowDiff: (file: FileStatusDto, fromStaged: boolean) => Promise<void>
  onClearDiff: () => void
  onAsk: (message: string, onConfirm: () => void) => void
}) {
  const { t } = useTranslation()

  function fileRow(file: FileStatusDto) {
    const { dir, base } = splitPath(file.path)
    const targetKey = workingDiffTargetKey(file.path, fromStaged)
    return (
      <div key={file.path} className="group flex items-center gap-1 rounded px-1 hover:bg-zinc-800">
        <button
          title={file.path}
          onClick={() => void onShowDiff(file, fromStaged)}
          className={`flex min-w-0 flex-1 items-baseline gap-1.5 rounded text-left font-mono text-xs ${
            activeDiffTargetKey === targetKey ? 'bg-zinc-700' : ''
          }`}
        >
          <span className="shrink-0 text-amber-400">
            {fromStaged ? file.index : file.workingDir}
          </span>
          <span className="shrink-0 truncate text-zinc-200">{base}</span>
          <span className="min-w-0 truncate text-[11px] text-zinc-500">{dir}</span>
        </button>
        {fromStaged ? (
          <button
            onClick={() => {
              onClearDiff()
              void run(() => window.api.unstage([file.path]), undefined, undefined, { status: true })
            }}
            className="hidden rounded px-1 text-xs text-zinc-400 hover:text-zinc-200 group-hover:block"
          >
            {t('panel.unstage')}
          </button>
        ) : (
          <>
            <button
              onClick={() => {
                onClearDiff()
                void run(() => window.api.stage([file.path]), undefined, undefined, { status: true })
              }}
              className="hidden rounded px-1 text-xs text-emerald-400 hover:text-emerald-300 group-hover:block"
            >
              {t('panel.stage')}
            </button>
            <button
              onClick={() => {
                onClearDiff()
                // 이 파일만 스태시 — 메시지를 경로로 지정해 목록에서 식별
                void run(() => window.api.stashSave(file.path, [file.path]), 'toast.stashSaved', 'stash', {
                  status: true,
                  stashes: true
                })
              }}
              className="hidden rounded px-1 text-xs text-zinc-400 hover:text-zinc-200 group-hover:block"
            >
              {t('panel.stashFile')}
            </button>
            <button
              onClick={() =>
                onAsk(t('common.discardConfirm', { name: file.path }), () => {
                  onClearDiff()
                  void run(() => window.api.discard([file.path]), undefined, undefined, { status: true })
                })
              }
              className="hidden rounded px-1 text-xs text-red-400 hover:text-red-300 group-hover:block"
            >
              {t('panel.discard')}
            </button>
          </>
        )}
      </div>
    )
  }

  return <div className="min-h-0 flex-1 overflow-y-auto">{files.map(fileRow)}</div>
})
