import { useTranslation } from 'react-i18next'
import { run } from '../lib/run'
import { useRepoStore } from '../stores/repoStore'
import { useUiStore } from '../stores/uiStore'

// merge/cherry-pick/revert 진행 중 배너 — 충돌 파일 목록과 중단/계속 버튼
export function MergeBanner() {
  const { t } = useTranslation()
  const status = useRepoStore((s) => s.status)
  const openConflict = useUiStore((s) => s.openConflict)
  const ask = useUiStore((s) => s.ask)

  const op = status?.operation ?? null
  // 작업 진행 중이 아니어도 충돌이 남아 있으면(stash pop 충돌 등) 배너로 해결 경로를 제공한다
  // (StagingPanel은 conflicted 파일을 숨기므로 이 배너가 유일한 진입점)
  if (!status || (!op && status.conflicted.length === 0)) return null
  const allResolved = status.conflicted.length === 0
  const title =
    op === 'merge'
      ? t('merge.inProgress')
      : op === 'cherry-pick'
        ? t('merge.cherryPickInProgress')
        : op === 'revert'
          ? t('merge.revertInProgress')
          : t('merge.conflictsOnly')
  const doneToast =
    op === 'merge' ? 'toast.merged' : op === 'cherry-pick' ? 'toast.cherryPicked' : 'toast.reverted'

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-amber-700 bg-amber-950 px-3 py-2 text-sm">
      <span className="font-semibold text-amber-300">{title}</span>
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
      {/* 중단/계속 버튼은 git 작업(operation)이 있을 때만 — stash 충돌은 파일 해결만 하면 끝 */}
      {op && (
        <div className="ml-auto flex gap-2">
          <button
            onClick={() =>
              ask(t('merge.abortConfirm'), () =>
                void run(async () => {
                  await window.api.abortOperation()
                  openConflict(null)
                }, 'toast.operationAborted')
              )
            }
            className="rounded px-3 py-1 text-amber-200 hover:bg-amber-900"
          >
            {t('merge.abort')}
          </button>
          <button
            disabled={!allResolved}
            onClick={() => void run(() => window.api.continueOperation(), doneToast)}
            className="rounded bg-emerald-700 px-3 py-1 font-semibold hover:bg-emerald-600 disabled:opacity-40"
          >
            {op === 'merge' ? t('merge.commitMerge') : t('merge.continue')}
          </button>
        </div>
      )}
    </div>
  )
}
