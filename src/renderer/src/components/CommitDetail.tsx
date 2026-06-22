import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CommitFileDto } from '../../../shared/types'
import { commitDiffTargetKey, useLatestDiff } from '../lib/useLatestDiff'
import { splitPath } from '../lib/paths'
import { toastError } from '../lib/run'
import { useRepoStore } from '../stores/repoStore'
import { useUiStore } from '../stores/uiStore'

const STATUS_COLOR: Record<string, string> = {
  A: 'text-emerald-400',
  M: 'text-amber-400',
  D: 'text-red-400',
  R: 'text-sky-400',
  C: 'text-cyan-400'
}

export function CommitDetail({ hash }: { hash: string }) {
  const { t } = useTranslation()
  const commit = useRepoStore((s) => s.commits.find((c) => c.hash === hash))
  const diffView = useUiStore((s) => s.diffView)
  const { showDiff: showLatestDiff } = useLatestDiff()
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
  async function showDiff(file: CommitFileDto): Promise<void> {
    const title = formatFileChange(file)
    await showLatestDiff({
      key: commitDiffTargetKey(hash, file.path),
      title,
      load: () => window.api.diffCommitFile(hash, file.path)
    })
  }

  return (
    <div className="flex h-full flex-col gap-2 p-3 text-sm">
      <p className="font-semibold">{commit.subject}</p>
      {commit.body && (
        <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-zinc-900/70 p-2 text-sm text-zinc-300 ring-1 ring-zinc-800">
          {commit.body}
        </div>
      )}
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
          const old = f.oldPath ? splitPath(f.oldPath) : null
          const title = formatFileChange(f)
          return (
            <button
              key={`${f.kind}:${f.oldPath ?? ''}:${f.path}`}
              title={title}
              onClick={() => void showDiff(f)}
              className={`flex w-full items-baseline gap-1.5 rounded px-1 py-0.5 text-left font-mono text-xs hover:bg-zinc-800 ${
                diffView?.targetKey === commitDiffTargetKey(hash, f.path) ? 'bg-zinc-700' : ''
              }`}
            >
              <span className={`shrink-0 ${STATUS_COLOR[f.kind] ?? 'text-zinc-400'}`}>
                {formatKind(f)}
              </span>
              {old && (
                <>
                  <span className="shrink-0 truncate text-zinc-500">{old.base}</span>
                  <span className="shrink-0 text-zinc-500">-&gt;</span>
                </>
              )}
              <span className="shrink-0 truncate text-zinc-200">{base}</span>
              <span className="min-w-0 truncate text-[11px] text-zinc-500">{dir}</span>
            </button>
          )
        })}
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
