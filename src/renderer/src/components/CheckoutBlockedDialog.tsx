import { useTranslation } from 'react-i18next'

interface CheckoutBlockedDialogProps {
  target: string
  paths: string[]
  onClose: () => void
  onStashBlocking: () => void
  onStashAll: () => void
}

export function CheckoutBlockedDialog({
  target,
  paths,
  onClose,
  onStashBlocking,
  onStashAll
}: CheckoutBlockedDialogProps) {
  const { t } = useTranslation()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[30rem] rounded-lg border border-zinc-600 bg-zinc-800 p-4 shadow-xl">
        <h2 className="text-sm font-semibold text-zinc-100">{t('checkoutBlocked.title')}</h2>
        <p className="mt-2 text-sm text-zinc-300">
          {t('checkoutBlocked.description', { branch: target })}
        </p>
        <p className="mt-4 text-xs font-semibold uppercase text-zinc-500">
          {t('checkoutBlocked.blockedFiles')}
        </p>
        <div className="mt-1 max-h-40 overflow-y-auto rounded bg-zinc-900 p-2 font-mono text-xs text-zinc-300 ring-1 ring-zinc-700">
          {paths.length > 0 ? (
            paths.map((path) => <div key={path}>{path}</div>)
          ) : (
            <div className="text-zinc-500">-</div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-sm hover:bg-zinc-700">
            {t('common.cancel')}
          </button>
          <button
            onClick={onStashAll}
            className="rounded bg-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-600"
          >
            {t('checkoutBlocked.stashAll')}
          </button>
          <button
            onClick={onStashBlocking}
            disabled={paths.length === 0}
            className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-semibold hover:bg-emerald-600 disabled:opacity-40 disabled:hover:bg-emerald-700"
          >
            {t('checkoutBlocked.stashBlocking')}
          </button>
        </div>
      </div>
    </div>
  )
}
