import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CommitFileDto } from '../../../shared/types'
import { splitPath } from '../lib/paths'
import { run, toastError } from '../lib/run'
import { useRepoStore } from '../stores/repoStore'
import { useUiStore } from '../stores/uiStore'

const STATUS_COLOR: Record<string, string> = {
  A: 'text-emerald-400',
  M: 'text-amber-400',
  D: 'text-red-400',
  R: 'text-sky-400',
  C: 'text-cyan-400'
}

export function StashDetail({ oid }: { oid: string }) {
  const { t } = useTranslation()
  const refresh = useRepoStore((s) => s.refresh)
  const stash = useRepoStore((s) => s.stashes.find((item) => item.oid === oid))
  const ask = useUiStore((s) => s.ask)
  const select = useUiStore((s) => s.select)
  const [files, setFiles] = useState<CommitFileDto[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let ignore = false
    setFiles([])
    if (!stash) return
    setLoading(true)
    window.api
      .stashFiles(oid)
      .then((result) => {
        if (!ignore) setFiles(result)
      })
      .catch((err) => {
        toastError(err)
        void refresh({ stashes: true })
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [oid, refresh, stash])

  if (!stash) return null
  const stashMessage = stash.message

  function applyStash(): void {
    void run(() => window.api.stashApply(oid), undefined, 'stash', { status: true, stashes: true })
  }

  function popStash(): void {
    void run(
      async () => {
        await window.api.stashPop(oid)
        select(null)
      },
      'toast.stashPopped',
      'stash',
      { status: true, stashes: true }
    )
  }

  function dropStash(): void {
    ask(t('stash.dropConfirm', { name: stashMessage }), () => {
      void run(
        async () => {
          await window.api.stashDrop(oid)
          select(null)
        },
        undefined,
        undefined,
        { status: true, stashes: true }
      )
    })
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3 text-sm">
      <div>
        <p className="text-xs uppercase text-zinc-500">{t('stash.detailTitle')}</p>
        <p className="mt-1 break-words font-semibold">{stashMessage}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={applyStash}
          className="rounded bg-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-600"
        >
          {t('stash.apply')}
        </button>
        <button
          onClick={popStash}
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-semibold hover:bg-emerald-600"
        >
          {t('stash.pop')}
        </button>
        <button
          onClick={dropStash}
          className="rounded bg-red-900/70 px-3 py-1.5 text-sm text-red-100 hover:bg-red-800"
        >
          {t('stash.drop')}
        </button>
      </div>
      <p className="text-xs uppercase text-zinc-500">
        {t('stash.files')} ({files.length})
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <p className="text-xs text-zinc-500">{t('stash.loadingFiles')}</p>
        ) : files.length === 0 ? (
          <p className="text-xs text-zinc-500">{t('stash.noFiles')}</p>
        ) : (
          files.map((file) => {
            const { dir, base } = splitPath(file.path)
            const old = file.oldPath ? splitPath(file.oldPath) : null
            const title = formatFileChange(file)
            return (
              <div
                key={`${file.kind}:${file.oldPath ?? ''}:${file.path}`}
                title={title}
                className="flex w-full items-baseline gap-1.5 rounded px-1 py-0.5 font-mono text-xs"
              >
                <span className={`shrink-0 ${STATUS_COLOR[file.kind] ?? 'text-zinc-400'}`}>
                  {formatKind(file)}
                </span>
                {old && (
                  <>
                    <span className="shrink-0 truncate text-zinc-500">{old.base}</span>
                    <span className="shrink-0 text-zinc-500">-&gt;</span>
                  </>
                )}
                <span className="shrink-0 truncate text-zinc-200">{base}</span>
                <span className="min-w-0 truncate text-[11px] text-zinc-500">{dir}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function formatKind(file: CommitFileDto): string {
  return file.score == null ? file.kind : `${file.kind}${file.score}`
}

function formatFileChange(file: CommitFileDto): string {
  return file.oldPath ? `${file.oldPath} -> ${file.path}` : file.path
}
