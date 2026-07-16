import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { GitErrorDto } from '../../../shared/types'
import { toastError } from '../lib/run'
import { useRepoStore } from '../stores/repoStore'
import { useUiStore } from '../stores/uiStore'

const GITHUB_BUG_REPORT_URL = 'https://github.com/gloz9102/mergit/issues/new?template=bug_report.yml'

export function Toasts() {
  const { t } = useTranslation()
  const toasts = useUiStore((s) => s.toasts)
  const dismiss = useUiStore((s) => s.dismissToast)
  const ask = useUiStore((s) => s.ask)
  const pushToast = useUiStore((s) => s.pushToast)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [copying, setCopying] = useState<number | null>(null)
  const [recovering, setRecovering] = useState<number | null>(null)
  const [recoveryAvailability, setRecoveryAvailability] = useState<
    Record<number, 'loading' | 'available' | 'unavailable'>
  >({})
  const checkedRecoveryToasts = useRef(new Set<number>())

  useEffect(() => {
    const candidates = toasts.filter(
      (toast) =>
        toast.kind === 'error' &&
        (toast.errorCode === 'AUTH' || toast.errorCode === 'REMOTE') &&
        !checkedRecoveryToasts.current.has(toast.id)
    )
    if (candidates.length === 0) return
    for (const toast of candidates) {
      checkedRecoveryToasts.current.add(toast.id)
      setRecoveryAvailability((current) => ({ ...current, [toast.id]: 'loading' }))
      void window.api
        .getGitHubAccountState()
        .then((state) => {
          setRecoveryAvailability((current) => ({
            ...current,
            [toast.id]: state.recoveryAvailable ? 'available' : 'unavailable'
          }))
        })
        .catch(() => {
          setRecoveryAvailability((current) => ({ ...current, [toast.id]: 'unavailable' }))
        })
    }
  }, [toasts])

  async function copyLog(id: number, message: string, detail?: string): Promise<void> {
    setCopying(id)
    try {
      await window.api.copyToClipboard(detail ? `${message}\n\n${detail}` : message)
      ask(
        t('common.logCopiedIssuePrompt'),
        () => void window.api.openExternal(GITHUB_BUG_REPORT_URL).catch(toastError),
        'primary'
      )
    } catch (err) {
      const error = err as Partial<GitErrorDto>
      pushToast(t('error.CLIPBOARD'), error.detail ?? error.message, 'error')
    } finally {
      setCopying((current) => (current === id ? null : current))
    }
  }

  async function recoverGitHub(id: number): Promise<void> {
    const ui = useUiStore.getState()
    const mutation = ui.beginGitMutation('githubRecovery')
    if (!mutation) return
    setRecovering(id)
    try {
      const result = await window.api.recoverGitHub()
      await useRepoStore.getState().refresh()
      dismiss(id)
      useUiStore.getState().pushToast(
        t('toast.githubRecoverySucceeded'),
        result.transcript,
        'success',
        { persistent: true }
      )
    } catch (err) {
      await useRepoStore.getState().refresh().catch(toastError)
      dismiss(id)
      toastError(err)
    } finally {
      useUiStore.getState().endGitMutation(mutation)
      setRecovering((current) => (current === id ? null : current))
    }
  }

  return (
    <div aria-live="polite" className="fixed bottom-4 left-4 right-4 z-40 flex w-auto flex-col gap-2 sm:left-auto sm:w-96">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.kind === 'error' ? 'alert' : 'status'}
          className={`rounded border bg-zinc-800 p-3 text-sm shadow-lg ${
            toast.kind === 'error'
              ? 'border-red-700'
              : toast.kind === 'success'
                ? 'border-emerald-700'
                : 'border-zinc-600'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <span>{toast.message}</span>
            <button
              aria-label={t('common.close')}
              onClick={() => {
                dismiss(toast.id)
                setExpanded((prev) => (prev === toast.id ? null : prev))
              }}
              className="text-zinc-500 hover:text-zinc-300"
            >
              ✕
            </button>
          </div>
          {(toast.detail || toast.kind === 'error') && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {recoveryAvailability[toast.id] === 'available' && (
                <button
                  type="button"
                  disabled={recovering !== null}
                  aria-busy={recovering === toast.id}
                  onClick={() => void recoverGitHub(toast.id)}
                  className="rounded bg-emerald-700 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-600 disabled:cursor-wait disabled:opacity-50"
                >
                  {recovering === toast.id
                    ? t('github.recovery.running')
                    : t('github.recovery.action')}
                </button>
              )}
              {toast.detail && (
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === toast.id ? null : toast.id)}
                  className="text-xs text-emerald-400 hover:text-emerald-300"
                >
                  {t('common.detail')}
                </button>
              )}
              {toast.kind === 'error' && (
                <button
                  type="button"
                  disabled={copying === toast.id}
                  aria-busy={copying === toast.id}
                  onClick={() => void copyLog(toast.id, toast.message, toast.detail)}
                  className="text-xs text-emerald-400 hover:text-emerald-300 disabled:cursor-wait disabled:text-zinc-500"
                >
                  {t('common.copyLog')}
                </button>
              )}
            </div>
          )}
          {expanded === toast.id && toast.detail && (
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-zinc-900 p-2 text-xs text-zinc-400">
              {toast.detail}
            </pre>
          )}
        </div>
      ))}
    </div>
  )
}
