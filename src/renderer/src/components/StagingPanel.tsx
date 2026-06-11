import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FileStatusDto } from '../../../shared/types'
import { splitPath } from '../lib/paths'
import { run, toastError } from '../lib/run'
import { useRepoStore } from '../stores/repoStore'
import { useUiStore } from '../stores/uiStore'

export function StagingPanel() {
  const { t } = useTranslation()
  const status = useRepoStore((s) => s.status)
  const ask = useUiStore((s) => s.ask)
  const diffView = useUiStore((s) => s.diffView)
  const openDiff = useUiStore((s) => s.openDiff)
  const [message, setMessage] = useState('')

  if (!status) return null
  // 충돌 파일은 MergeBanner/ConflictEditor가 담당
  const staged = status.files.filter((f) => !f.isConflicted && f.index !== ' ' && f.index !== '?')
  const unstaged = status.files.filter(
    (f) => !f.isConflicted && f.workingDir !== ' ' && f.workingDir !== ''
  )

  // diff는 중앙 영역(DiffPanel)에 크게 표시한다
  async function showDiff(file: FileStatusDto, fromStaged: boolean): Promise<void> {
    try {
      const text = await window.api.diffWorkingFile(file.path, fromStaged)
      openDiff({ title: file.path, text })
    } catch (err) {
      toastError(err)
    }
  }

  function commit(): void {
    const msg = message.trim()
    if (!msg) return
    void run(async () => {
      await window.api.commit(msg)
      setMessage('')
      openDiff(null)
    }, 'toast.committed')
  }

  function fileRow(file: FileStatusDto, fromStaged: boolean) {
    const { dir, base } = splitPath(file.path)
    return (
      <div key={file.path} className="group flex items-center gap-1 rounded px-1 hover:bg-zinc-800">
        <button
          title={file.path}
          onClick={() => void showDiff(file, fromStaged)}
          className={`flex min-w-0 flex-1 items-baseline gap-1.5 rounded text-left font-mono text-xs ${
            diffView?.title === file.path ? 'bg-zinc-700' : ''
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
              openDiff(null)
              void run(() => window.api.unstage([file.path]))
            }}
            className="hidden rounded px-1 text-xs text-zinc-400 hover:text-zinc-200 group-hover:block"
          >
            {t('panel.unstage')}
          </button>
        ) : (
          <>
            <button
              onClick={() => {
                openDiff(null)
                void run(() => window.api.stage([file.path]))
              }}
              className="hidden rounded px-1 text-xs text-emerald-400 hover:text-emerald-300 group-hover:block"
            >
              {t('panel.stage')}
            </button>
            <button
              onClick={() =>
                ask(t('common.discardConfirm', { name: file.path }), () => {
                  openDiff(null)
                  void run(() => window.api.discard([file.path]))
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

  return (
    <div className="flex h-full flex-col gap-2 p-3 text-sm">
      <p className="text-xs uppercase text-zinc-500">
        {t('panel.unstaged')} ({unstaged.length})
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto">{unstaged.map((f) => fileRow(f, false))}</div>
      <p className="text-xs uppercase text-zinc-500">
        {t('panel.staged')} ({staged.length})
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto">{staged.map((f) => fileRow(f, true))}</div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t('panel.commitMessagePlaceholder')}
        rows={3}
        className="resize-none rounded bg-zinc-800 p-2 text-sm outline-none ring-1 ring-zinc-700 focus:ring-emerald-500"
      />
      <button
        onClick={commit}
        disabled={!message.trim() || staged.length === 0}
        className="rounded bg-emerald-700 py-1.5 text-sm font-semibold hover:bg-emerald-600 disabled:opacity-40"
      >
        {t('panel.commit')}
      </button>
    </div>
  )
}
