import { useTranslation } from 'react-i18next'
import { setLanguage } from '../i18n'
import { toastError } from '../lib/run'
import { useUiStore } from '../stores/uiStore'

export function SettingsModal() {
  const { t, i18n } = useTranslation()
  const show = useUiStore((s) => s.showSettings)
  const setShow = useUiStore((s) => s.setShowSettings)
  const appVersion = useUiStore((s) => s.appVersion)
  const ask = useUiStore((s) => s.ask)
  const pushToast = useUiStore((s) => s.pushToast)
  const checking = useUiStore((s) => s.pending['updateCheck'])
  const setPending = useUiStore((s) => s.setPending)
  if (!show) return null

  async function checkUpdate(): Promise<void> {
    setPending('updateCheck', true)
    try {
      const r = await window.api.checkForUpdates()
      if (r.hasUpdate) {
        ask(t('update.available', { current: r.currentVersion, latest: r.latestVersion }), () =>
          void window.api.openExternal(r.releaseUrl).catch(toastError)
        )
      } else {
        pushToast(t('update.upToDate'))
      }
    } catch (err) {
      toastError(err) // 수동 체크는 실패를 토스트로 알린다
    } finally {
      setPending('updateCheck', false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
      <div className="w-80 rounded-lg border border-zinc-600 bg-zinc-800 p-4">
        <p className="mb-3 font-semibold">{t('settings.title')}</p>
        <p className="mb-1 text-xs uppercase text-zinc-500">{t('settings.language')}</p>
        <div className="flex gap-2">
          {(['ko', 'en'] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              className={`flex-1 rounded px-3 py-1.5 text-sm ${
                i18n.language === lang ? 'bg-emerald-700 font-semibold' : 'bg-zinc-700 hover:bg-zinc-600'
              }`}
            >
              {lang === 'ko' ? '한국어' : 'English'}
            </button>
          ))}
        </div>
        <p className="mb-1 mt-4 text-xs uppercase text-zinc-500">{t('update.title')}</p>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-zinc-500">{t('update.version')}</span>
          <span className="min-w-0 truncate text-right">
            {appVersion ? `Mergit v${appVersion}` : t('update.unknownVersion')}
          </span>
        </div>
        <div className="mt-2">
          <button
            onClick={() => void checkUpdate()}
            disabled={checking}
            className="w-full rounded bg-emerald-700 px-3 py-1.5 text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50"
          >
            {checking ? t('update.checking') : t('update.check')}
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={() => setShow(false)} className="rounded px-3 py-1.5 text-sm hover:bg-zinc-700">
            {t('settings.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
