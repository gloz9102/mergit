import { useTranslation } from 'react-i18next'
import { run } from '../lib/run'
import { useRepoStore } from '../stores/repoStore'
import { useUiStore } from '../stores/uiStore'

export function MergeBanner() {
  const { t } = useTranslation()
  const status = useRepoStore((s) => s.status)
  const openConflict = useUiStore((s) => s.openConflict)
  const ask = useUiStore((s) => s.ask)

  if (!status?.merging) return null
  const allResolved = status.conflicted.length === 0

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-amber-700 bg-amber-950 px-3 py-2 text-sm">
      <span className="font-semibold text-amber-300">{t('merge.inProgress')}</span>
      <span className="text-amber-200">
        {t('merge.conflictedFiles', { count: status.conflicted.length })}
      </span>
      {status.conflicted.map((file) => (
        <button
          key={file}
          onClick={() => openConflict(file)}
          className="rounded bg-amber-900 px-2 py-0.5 font-mono text-xs text-amber-200 hover:bg-amber-800"
        >
          {file}
        </button>
      ))}
      <div className="ml-auto flex gap-2">
        <button
          onClick={() =>
            ask(t('merge.abortConfirm'), () =>
              void run(async () => {
                await window.api.abortMerge()
                openConflict(null)
              }, 'toast.mergeAborted')
            )
          }
          className="rounded px-3 py-1 text-amber-200 hover:bg-amber-900"
        >
          {t('merge.abort')}
        </button>
        <button
          disabled={!allResolved}
          onClick={() => void run(() => window.api.commitMerge(), 'toast.merged')}
          className="rounded bg-emerald-700 px-3 py-1 font-semibold hover:bg-emerald-600 disabled:opacity-40"
        >
          {t('merge.commitMerge')}
        </button>
      </div>
    </div>
  )
}
