import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CommitFileDto } from '../../../shared/types'
import { toastError } from '../lib/run'
import { useRepoStore } from '../stores/repoStore'
import { DiffViewer } from './DiffViewer'

const STATUS_COLOR: Record<string, string> = {
  A: 'text-emerald-400',
  M: 'text-amber-400',
  D: 'text-red-400'
}

export function CommitDetail({ hash }: { hash: string }) {
  const { t } = useTranslation()
  const commit = useRepoStore((s) => s.commits.find((c) => c.hash === hash))
  const [files, setFiles] = useState<CommitFileDto[]>([])
  const [diff, setDiff] = useState<{ path: string; text: string } | null>(null)

  useEffect(() => {
    setDiff(null)
    setFiles([])
    window.api.commitFiles(hash).then(setFiles).catch(toastError)
  }, [hash])

  if (!commit) return null

  async function showDiff(path: string): Promise<void> {
    try {
      const text = await window.api.diffCommitFile(hash, path)
      setDiff({ path, text })
    } catch (err) {
      toastError(err)
    }
  }

  return (
    <div className="flex h-full flex-col gap-2 p-3 text-sm">
      <p className="font-semibold">{commit.subject}</p>
      <p className="text-xs text-zinc-500">
        {commit.author} · {new Date(commit.date).toLocaleString()} ·{' '}
        <span className="font-mono">{commit.hash.slice(0, 8)}</span>
      </p>
      <p className="text-xs uppercase text-zinc-500">
        {t('panel.files')} ({files.length})
      </p>
      <div className="max-h-48 overflow-y-auto">
        {files.map((f) => (
          <button
            key={f.path}
            onClick={() => void showDiff(f.path)}
            className={`block w-full truncate rounded px-1 py-0.5 text-left font-mono text-xs hover:bg-zinc-800 ${
              diff?.path === f.path ? 'bg-zinc-700' : ''
            }`}
          >
            <span className={STATUS_COLOR[f.status] ?? 'text-zinc-400'}>{f.status}</span> {f.path}
          </button>
        ))}
      </div>
      {diff && <DiffViewer text={diff.text} />}
    </div>
  )
}
