import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FileStatusDto } from '../../../shared/types'
import { run, toastError } from '../lib/run'
import { useRepoStore } from '../stores/repoStore'
import { useUiStore } from '../stores/uiStore'
import { DiffViewer } from './DiffViewer'

export function StagingPanel() {
  const { t } = useTranslation()
  const status = useRepoStore((s) => s.status)
  const ask = useUiStore((s) => s.ask)
  const [message, setMessage] = useState('')
  const [diff, setDiff] = useState<{ path: string; text: string } | null>(null)

  if (!status) return null
  // 충돌 파일은 MergeBanner/ConflictEditor가 담당
  const staged = status.files.filter((f) => !f.isConflicted && f.index !== ' ' && f.index !== '?')
  const unstaged = status.files.filter((f) => !f.isConflicted && f.workingDir !== ' ')

  async function showDiff(file: FileStatusDto, fromStaged: boolean): Promise<void> {
    try {
      const text = await window.api.diffWorkingFile(file.path, fromStaged)
      setDiff({ path: file.path, text })
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
    }, 'toast.committed')
  }

  function fileRow(file: FileStatusDto, fromStaged: boolean) {
    return (
      <div key={file.path} className="group flex items-center gap-1 rounded px-1 hover:bg-zinc-800">
        <button
          onClick={() => void showDiff(file, fromStaged)}
          className="min-w-0 flex-1 truncate text-left font-mono text-xs"
        >
          <span className="text-amber-400">{fromStaged ? file.index : file.workingDir}</span>{' '}
          {file.path}
        </button>
        {fromStaged ? (
          <button
            onClick={() => void run(() => window.api.unstage([file.path]))}
            className="hidden rounded px-1 text-xs text-zinc-400 hover:text-zinc-200 group-hover:block"
          >
            {t('panel.unstage')}
          </button>
        ) : (
          <>
            <button
              onClick={() => void run(() => window.api.stage([file.path]))}
              className="hidden rounded px-1 text-xs text-emerald-400 hover:text-emerald-300 group-hover:block"
            >
              {t('panel.stage')}
            </button>
            <button
              onClick={() =>
                ask(t('common.discardConfirm', { name: file.path }), () =>
                  void run(() => window.api.discard([file.path]))
                )
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
      <div className="max-h-40 overflow-y-auto">{unstaged.map((f) => fileRow(f, false))}</div>
      <p className="text-xs uppercase text-zinc-500">
        {t('panel.staged')} ({staged.length})
      </p>
      <div className="max-h-40 overflow-y-auto">{staged.map((f) => fileRow(f, true))}</div>
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
      {diff && <DiffViewer text={diff.text} />}
    </div>
  )
}
