import { useTranslation } from 'react-i18next'
import { toastError } from '../lib/run'
import { useUiStore } from '../stores/uiStore'

export function UpdateModal() {
  const { t } = useTranslation()
  const show = useUiStore((s) => s.showUpdateModal)
  const update = useUiStore((s) => s.updateState)
  const dismiss = useUiStore((s) => s.dismissUpdateModal)
  const pushToast = useUiStore((s) => s.pushToast)
  const pending = useUiStore((s) => s.pending)
  const setPending = useUiStore((s) => s.setPending)
  if (!show) return null

  async function download(): Promise<void> {
    setPending('updateDownload', true)
    try {
      await window.api.downloadUpdate()
    } catch (err) {
      toastError(err)
    } finally {
      setPending('updateDownload', false)
    }
  }

  async function installNow(): Promise<void> {
    setPending('updateInstall', true)
    try {
      await window.api.installDownloadedUpdate()
    } catch (err) {
      setPending('updateInstall', false)
      toastError(err)
    }
  }

  function installLater(): void {
    dismiss()
    pushToast(t('update.installOnQuit'))
  }

  function openReleasePage(): void {
    if (!update.releaseUrl) return
    dismiss()
    void window.api.openExternal(update.releaseUrl).catch(toastError)
  }

  const progress = update.progress
  const percent = Math.max(0, Math.min(100, progress?.percent ?? 0))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-96 rounded-lg border border-zinc-600 bg-zinc-800 p-4 text-sm shadow-xl">
        <p className="font-semibold">{t('update.modalTitle')}</p>
        {update.status === 'available' && (
          <>
            <p className="mt-3 text-zinc-300">
              {update.canDownload
                ? t('update.availableDownload', {
                    current: update.currentVersion,
                    latest: update.latestVersion
                  })
                : t('update.availableExternal', {
                    current: update.currentVersion,
                    latest: update.latestVersion
                  })}
            </p>
            {update.message && <p className="mt-2 text-xs text-zinc-500">{update.message}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={dismiss} className="rounded px-3 py-1.5 hover:bg-zinc-700">
                {t('update.later')}
              </button>
              {update.canDownload ? (
                <button
                  onClick={() => void download()}
                  disabled={!!pending['updateDownload']}
                  className="rounded bg-emerald-700 px-3 py-1.5 font-semibold hover:bg-emerald-600 disabled:opacity-50"
                >
                  {pending['updateDownload'] ? t('update.downloading') : t('update.download')}
                </button>
              ) : (
                <button
                  onClick={openReleasePage}
                  className="rounded bg-emerald-700 px-3 py-1.5 font-semibold hover:bg-emerald-600"
                >
                  {t('update.openRelease')}
                </button>
              )}
            </div>
          </>
        )}
        {update.status === 'downloading' && (
          <>
            <p className="mt-3 text-zinc-300">
              {t('update.downloadingVersion', { latest: update.latestVersion })}
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded bg-zinc-700">
              <div className="h-full bg-emerald-500" style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              {t('update.downloadProgress', {
                percent: percent.toFixed(0),
                transferred: formatBytes(progress?.transferred ?? 0),
                total: formatBytes(progress?.total ?? 0),
                speed: formatBytes(progress?.bytesPerSecond ?? 0)
              })}
            </p>
            <div className="mt-4 flex justify-end">
              <button onClick={dismiss} className="rounded px-3 py-1.5 hover:bg-zinc-700">
                {t('common.close')}
              </button>
            </div>
          </>
        )}
        {update.status === 'downloaded' && (
          <>
            <p className="mt-3 text-zinc-300">
              {t('update.downloaded', { latest: update.latestVersion })}
            </p>
            <p className="mt-2 text-xs text-zinc-500">{t('update.installOnQuit')}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={installLater} className="rounded px-3 py-1.5 hover:bg-zinc-700">
                {t('update.installLater')}
              </button>
              <button
                onClick={() => void installNow()}
                disabled={!!pending['updateInstall']}
                className="rounded bg-emerald-700 px-3 py-1.5 font-semibold hover:bg-emerald-600 disabled:opacity-50"
              >
                {t('update.restartAndInstall')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}
