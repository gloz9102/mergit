import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CommitFileDto } from '../../../shared/types'
import { splitPath } from '../lib/paths'
import { toastError } from '../lib/run'
import { useRepoStore } from '../stores/repoStore'
import { useUiStore } from '../stores/uiStore'

const STATUS_COLOR: Record<string, string> = {
  A: 'text-emerald-400',
  M: 'text-amber-400',
  D: 'text-red-400'
}

export function CommitDetail({ hash }: { hash: string }) {
  const { t } = useTranslation()
  const commit = useRepoStore((s) => s.commits.find((c) => c.hash === hash))
  const diffView = useUiStore((s) => s.diffView)
  const openDiff = useUiStore((s) => s.openDiff)
  const [files, setFiles] = useState<CommitFileDto[]>([])
  const hasCommit = !!commit

  useEffect(() => {
    let ignore = false
    setFiles([])
    // refresh로 커밋이 사라진 경우(브랜치 삭제 등) IPC 호출 생략
    if (!hasCommit) return
    window.api
      .commitFiles(hash)
      .then((result) => {
        if (!ignore) setFiles(result)
      })
      .catch(toastError)
    return () => {
      ignore = true
    }
  }, [hash, hasCommit])

  if (!commit) return null

  // diff는 중앙 영역(DiffPanel)에 크게 표시한다
  async function showDiff(path: string): Promise<void> {
    try {
      const text = await window.api.diffCommitFile(hash, path)
      openDiff({ title: path, text })
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
      <div className="min-h-0 flex-1 overflow-y-auto">
        {files.map((f) => {
          const { dir, base } = splitPath(f.path)
          return (
            <button
              key={f.path}
              title={f.path}
              onClick={() => void showDiff(f.path)}
              className={`flex w-full items-baseline gap-1.5 rounded px-1 py-0.5 text-left font-mono text-xs hover:bg-zinc-800 ${
                diffView?.title === f.path ? 'bg-zinc-700' : ''
              }`}
            >
              <span className={`shrink-0 ${STATUS_COLOR[f.status] ?? 'text-zinc-400'}`}>
                {f.status}
              </span>
              <span className="shrink-0 truncate text-zinc-200">{base}</span>
              <span className="min-w-0 truncate text-[11px] text-zinc-500">{dir}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
