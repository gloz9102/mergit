import { useTranslation } from 'react-i18next'
import { useUiStore } from '../stores/uiStore'
import { useDialogA11y } from '../lib/useDialogA11y'

export function ConfirmDialog() {
  const { t } = useTranslation()
  const confirm = useUiStore((s) => s.confirm)
  const close = useUiStore((s) => s.closeConfirm)
  const dialogRef = useDialogA11y(!!confirm, close)
  if (!confirm) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-message"
        tabIndex={-1}
        className="w-[calc(100%_-_2rem)] max-w-96 rounded-lg border border-zinc-600 bg-zinc-800 p-4"
      >
        <p id="confirm-dialog-message" className="text-sm">{confirm.message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button data-dialog-initial-focus onClick={close} className="rounded px-3 py-1.5 text-sm hover:bg-zinc-700">
            {t('common.cancel')}
          </button>
          <button
            onClick={() => {
              close()
              confirm.onConfirm()
            }}
            className="rounded bg-red-700 px-3 py-1.5 text-sm hover:bg-red-600"
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
