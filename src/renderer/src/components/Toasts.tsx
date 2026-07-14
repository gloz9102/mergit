import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { GitErrorDto } from '../../../shared/types'
import { toastError } from '../lib/run'
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
            <div className="mt-1 flex flex-wrap items-center gap-3">
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
