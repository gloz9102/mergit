import { useTranslation } from 'react-i18next'
import { setLanguage } from '../i18n'
import { useUiStore } from '../stores/uiStore'

export function SettingsModal() {
  const { t, i18n } = useTranslation()
  const show = useUiStore((s) => s.showSettings)
  const setShow = useUiStore((s) => s.setShowSettings)
  if (!show) return null

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
        <div className="mt-4 flex justify-end">
          <button onClick={() => setShow(false)} className="rounded px-3 py-1.5 text-sm hover:bg-zinc-700">
            {t('settings.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
