import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { setLanguage } from '../i18n'
import { toastError } from '../lib/run'
import { useUiStore, type LeftPanelSection } from '../stores/uiStore'

const LIST_LIMIT_PRESETS = [5, 10, 15] as const
const GITHUB_REPO_URL = 'https://github.com/gloz9102/mergit'

export function SettingsModal() {
  const { t, i18n } = useTranslation()
  const show = useUiStore((s) => s.showSettings)
  const setShow = useUiStore((s) => s.setShowSettings)
  const appVersion = useUiStore((s) => s.appVersion)
  const pushToast = useUiStore((s) => s.pushToast)
  const checking = useUiStore((s) => s.pending['updateCheck'])
  const setPending = useUiStore((s) => s.setPending)
  const autoCheckForUpdates = useUiStore((s) => s.autoCheckForUpdates)
  const setAutoCheckForUpdates = useUiStore((s) => s.setAutoCheckForUpdates)
  const autoDownloadUpdates = useUiStore((s) => s.autoDownloadUpdates)
  const setAutoDownloadUpdates = useUiStore((s) => s.setAutoDownloadUpdates)
  const setUpdateState = useUiStore((s) => s.setUpdateState)
  const branchCheckoutGesture = useUiStore((s) => s.branchCheckoutGesture)
  const setBranchCheckoutGesture = useUiStore((s) => s.setBranchCheckoutGesture)
  const listLimits = useUiStore((s) => s.leftPanelListLimits)
  const setListLimit = useUiStore((s) => s.setLeftPanelListLimit)
  const alwaysShowCurrentBranch = useUiStore((s) => s.alwaysShowCurrentBranch)
  const setAlwaysShowCurrentBranch = useUiStore((s) => s.setAlwaysShowCurrentBranch)
  const [customLimitOpen, setCustomLimitOpen] = useState<Partial<Record<LeftPanelSection, boolean>>>({})
  if (!show) return null

  async function checkUpdate(): Promise<void> {
    setPending('updateCheck', true)
    try {
      const r = await window.api.checkForUpdates({ autoDownload: autoDownloadUpdates })
      if (r.hasUpdate) {
        setUpdateState(r)
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
      <div className="w-96 rounded-lg border border-zinc-600 bg-zinc-800 p-4">
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
        <p className="mb-1 mt-4 text-xs uppercase text-zinc-500">
          {t('settings.branchCheckout.label')}
        </p>
        <div className="flex gap-2">
          {(['single', 'double'] as const).map((gesture) => (
            <button
              key={gesture}
              onClick={() => setBranchCheckoutGesture(gesture)}
              className={`flex-1 rounded px-3 py-1.5 text-sm ${
                branchCheckoutGesture === gesture
                  ? 'bg-emerald-700 font-semibold'
                  : 'bg-zinc-700 hover:bg-zinc-600'
              }`}
            >
              {t(`settings.branchCheckout.${gesture}`)}
            </button>
          ))}
        </div>
        <p className="mb-1 mt-4 text-xs uppercase text-zinc-500">{t('settings.listLimit.title')}</p>
        <div className="space-y-2">
          {(['local', 'remote', 'stash'] as const).map((section) => (
            <ListLimitControl
              key={section}
              label={t(`settings.listLimit.${section}`)}
              value={listLimits[section]}
              customOpen={
                !!customLimitOpen[section] ||
                !LIST_LIMIT_PRESETS.some((preset) => preset === listLimits[section])
              }
              onPreset={(limit) => {
                setCustomLimitOpen((state) => ({ ...state, [section]: false }))
                setListLimit(section, limit)
              }}
              onCustomOpen={() => setCustomLimitOpen((state) => ({ ...state, [section]: true }))}
              onCustomChange={(limit) => setListLimit(section, limit)}
            />
          ))}
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={alwaysShowCurrentBranch}
            onChange={(e) => setAlwaysShowCurrentBranch(e.target.checked)}
            className="accent-emerald-600"
          />
          {t('settings.alwaysShowCurrentBranch')}
        </label>
        <p className="mb-1 mt-4 text-xs uppercase text-zinc-500">{t('update.title')}</p>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-zinc-500">{t('update.version')}</span>
          <span className="min-w-0 truncate text-right">
            {appVersion ? `Mergit v${appVersion}` : t('update.unknownVersion')}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-sm">
          <span className="text-zinc-500">{t('settings.githubRepo')}</span>
          <button
            onClick={() => void window.api.openExternal(GITHUB_REPO_URL).catch(toastError)}
            className="min-w-0 truncate rounded px-2 py-1 text-right font-mono text-xs text-emerald-300 hover:bg-zinc-700"
            title={GITHUB_REPO_URL}
          >
            {GITHUB_REPO_URL}
          </button>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={autoCheckForUpdates}
            onChange={(e) => setAutoCheckForUpdates(e.target.checked)}
            className="accent-emerald-600"
          />
          {t('update.autoCheck')}
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={autoDownloadUpdates}
            onChange={(e) => setAutoDownloadUpdates(e.target.checked)}
            className="accent-emerald-600"
          />
          {t('update.autoDownload')}
        </label>
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

function ListLimitControl({
  label,
  value,
  customOpen,
  onPreset,
  onCustomOpen,
  onCustomChange
}: {
  label: string
  value: number
  customOpen: boolean
  onPreset: (limit: number) => void
  onCustomOpen: () => void
  onCustomChange: (limit: number) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-[72px_1fr] items-center gap-2">
      <span className="text-xs text-zinc-400">{label}</span>
      <div className="flex min-w-0 items-center gap-1">
        {LIST_LIMIT_PRESETS.map((limit) => (
          <button
            key={limit}
            onClick={() => onPreset(limit)}
            className={`rounded px-2 py-1 text-xs ${
              value === limit && !customOpen
                ? 'bg-emerald-700 font-semibold'
                : 'bg-zinc-700 hover:bg-zinc-600'
            }`}
          >
            {limit}
          </button>
        ))}
        {customOpen ? (
          <input
            type="number"
            min={1}
            max={999}
            value={value}
            onChange={(e) => {
              const next = Number(e.target.value)
              if (Number.isFinite(next) && next >= 1) onCustomChange(next)
            }}
            className="min-w-0 flex-1 rounded bg-zinc-900 px-2 py-1 text-xs outline-none ring-1 ring-emerald-500"
          />
        ) : (
          <button
            onClick={onCustomOpen}
            className="min-w-0 flex-1 rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600"
          >
            {t('settings.listLimit.custom')}
          </button>
        )}
      </div>
    </div>
  )
}
