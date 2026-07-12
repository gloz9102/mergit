import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUiStore } from '../stores/uiStore'

export function Toasts() {
  const { t } = useTranslation()
  const toasts = useUiStore((s) => s.toasts)
  const dismiss = useUiStore((s) => s.dismissToast)
  const [expanded, setExpanded] = useState<number | null>(null)

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
          {toast.detail && (
            <button
              onClick={() => setExpanded(expanded === toast.id ? null : toast.id)}
              className="mt-1 text-xs text-emerald-400"
            >
              {t('common.detail')}
            </button>
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
