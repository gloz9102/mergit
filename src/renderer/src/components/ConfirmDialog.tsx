import { useTranslation } from 'react-i18next'
import { useUiStore } from '../stores/uiStore'

export function ConfirmDialog() {
  const { t } = useTranslation()
  const confirm = useUiStore((s) => s.confirm)
  const close = useUiStore((s) => s.closeConfirm)
  if (!confirm) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-96 rounded-lg border border-zinc-600 bg-zinc-800 p-4">
        <p className="text-sm">{confirm.message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={close} className="rounded px-3 py-1.5 text-sm hover:bg-zinc-700">
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
