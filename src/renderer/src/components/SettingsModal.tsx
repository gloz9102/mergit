import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import type { GitHubAccountStateDto } from '../../../shared/types'
import { setLanguage } from '../i18n'
import { toastError } from '../lib/run'
import { useRepoStore } from '../stores/repoStore'
import { useUiStore, type LeftPanelSection } from '../stores/uiStore'
import { useDialogA11y } from '../lib/useDialogA11y'

const LIST_LIMIT_PRESETS = [5, 10, 15] as const
const GITHUB_REPO_URL = 'https://github.com/gloz9102/mergit'

export function SettingsModal() {
  const { t, i18n } = useTranslation()
  const repo = useRepoStore((s) => s.repo)
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
  const [githubState, setGitHubState] = useState<GitHubAccountStateDto | null>(null)
  const [githubLoading, setGitHubLoading] = useState(false)
  const [githubSwitching, setGitHubSwitching] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState('')
  const dialogRef = useDialogA11y(show, () => setShow(false))

  useEffect(() => {
    if (!show || !repo) {
      setGitHubState(null)
      setGitHubLoading(false)
      setSelectedAccount('')
      return
    }
    let cancelled = false
    setGitHubLoading(true)
    void window.api
      .getGitHubAccountState()
      .then((state) => {
        if (cancelled) return
        setGitHubState(state)
        setSelectedAccount(state.selectedAccount ?? '')
      })
      .catch((err) => {
        if (!cancelled) toastError(err)
      })
      .finally(() => {
        if (!cancelled) setGitHubLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [repo, show])

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

  async function switchGitHubAccount(): Promise<void> {
    setGitHubSwitching(true)
    try {
      const state = await window.api.switchGitHubAccount(selectedAccount || null)
      setGitHubState(state)
      setSelectedAccount(state.selectedAccount ?? '')
      pushToast(t('github.account.switched'), undefined, 'success')
    } catch (err) {
      toastError(err)
    } finally {
      setGitHubSwitching(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title" tabIndex={-1} className="max-h-[calc(100vh_-_2rem)] w-[calc(100%_-_2rem)] max-w-96 overflow-y-auto rounded-lg border border-zinc-600 bg-zinc-800 p-4">
        <p id="settings-dialog-title" className="mb-3 font-semibold">{t('settings.title')}</p>
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
        <p className="mb-1 mt-4 text-xs uppercase text-zinc-500">{t('github.account.title')}</p>
        {!repo ? (
          <p className="text-sm text-zinc-400">{t('github.account.noRepo')}</p>
        ) : githubLoading ? (
          <p role="status" className="text-sm text-zinc-400">{t('github.account.loading')}</p>
        ) : githubState ? (
          <div className="space-y-2">
            <div className="grid grid-cols-[72px_1fr] gap-2 text-xs">
              <span className="text-zinc-500">{t('github.account.remote')}</span>
              <span className="min-w-0 truncate text-right" title={githubState.remoteName ?? undefined}>
                {githubState.remoteName ?? '—'}
              </span>
              <span className="text-zinc-500">{t('github.account.transport')}</span>
              <span className="text-right uppercase">{githubState.transport}</span>
              <span className="text-zinc-500">{t('github.account.current')}</span>
              <span
                className="min-w-0 truncate text-right"
                title={githubState.selectedAccount ?? t('github.account.systemDefault')}
              >
                {githubState.selectedAccount ?? t('github.account.systemDefault')}
              </span>
            </div>
            {githubState.remoteUrl && (
              <p
                className="break-all rounded bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-400"
                title={githubState.remoteUrl}
              >
                {githubState.remoteUrl}
              </p>
            )}
            {githubState.accountSwitchAvailable ? (
              <>
                <label htmlFor="github-account-select" className="block text-xs text-zinc-400">
                  {t('github.account.select')}
                </label>
                <select
                  id="github-account-select"
                  value={selectedAccount}
                  onChange={(event) => setSelectedAccount(event.target.value)}
                  disabled={githubSwitching}
                  className="w-full rounded bg-zinc-900 px-2 py-1.5 text-sm outline-none ring-1 ring-zinc-600 focus:ring-emerald-500 disabled:opacity-50"
                >
                  <option value="">{t('github.account.systemDefault')}</option>
                  {githubState.selectedAccount &&
                    !githubState.accounts.includes(githubState.selectedAccount) && (
                      <option value={githubState.selectedAccount}>{githubState.selectedAccount}</option>
                    )}
                  {githubState.accounts.map((account) => (
                    <option key={account} value={account}>{account}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void switchGitHubAccount()}
                  disabled={githubSwitching}
                  aria-busy={githubSwitching}
                  className="w-full rounded bg-emerald-700 px-3 py-1.5 text-sm font-semibold hover:bg-emerald-600 disabled:cursor-wait disabled:opacity-50"
                >
                  {githubSwitching ? t('github.account.switching') : t('github.account.switch')}
                </button>
              </>
            ) : (
              <p className="text-sm text-zinc-400">
                {t(`github.account.unavailable.${githubState.unavailableReason ?? 'NOT_GITHUB'}`)}
              </p>
            )}
          </div>
        ) : null}
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
          <button data-dialog-initial-focus onClick={() => setShow(false)} className="rounded px-3 py-1.5 text-sm hover:bg-zinc-700">
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
