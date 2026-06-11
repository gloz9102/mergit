import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addRecentRepo } from '../lib/recentRepos'
import { run, toastError } from '../lib/run'
import { useRepoStore } from '../stores/repoStore'
import { useUiStore } from '../stores/uiStore'

export function Toolbar() {
  const { t } = useTranslation()
  const repo = useRepoStore((s) => s.repo)
  const status = useRepoStore((s) => s.status)
  const openRepo = useRepoStore((s) => s.openRepo)
  const setShowSettings = useUiStore((s) => s.setShowSettings)
  const [branchName, setBranchName] = useState<string | null>(null) // null = 입력창 닫힘

  async function handleOpen(): Promise<void> {
    try {
      const path = await window.api.selectRepo()
      if (!path) return
      await openRepo(path)
      addRecentRepo(path)
    } catch (err) {
      toastError(err)
    }
  }

  function createBranch(): void {
    const name = branchName?.trim()
    if (!name) return
    setBranchName(null)
    void run(() => window.api.createBranch(name, true), 'toast.branchCreated')
  }

  const btn =
    'rounded px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-transparent'

  return (
    <div className="flex items-center gap-1 border-b border-zinc-700 bg-zinc-800 px-2 py-1.5">
      <button className={btn} onClick={() => void handleOpen()}>
        {t('app.openRepo')}
      </button>
      {repo && <span className="mx-2 text-sm font-semibold text-emerald-400">{repo.name}</span>}
      <button className={btn} disabled={!repo} onClick={() => void run(() => window.api.pull(), 'toast.pulled')}>
        {t('toolbar.pull')} {status && status.behind > 0 ? `↓${status.behind}` : ''}
      </button>
      <button className={btn} disabled={!repo} onClick={() => void run(() => window.api.push(), 'toast.pushed')}>
        {t('toolbar.push')} {status && status.ahead > 0 ? `↑${status.ahead}` : ''}
      </button>
      <button className={btn} disabled={!repo} onClick={() => void run(() => window.api.fetch(), 'toast.fetched')}>
        {t('toolbar.fetch')}
      </button>
      {branchName === null ? (
        <button className={btn} disabled={!repo} onClick={() => setBranchName('')}>
          {t('toolbar.branch')} +
        </button>
      ) : (
        <input
          autoFocus
          value={branchName}
          onChange={(e) => setBranchName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              createBranch()
            }
            if (e.key === 'Escape') setBranchName(null)
          }}
          onBlur={() => setBranchName(null)}
          placeholder={t('branch.namePlaceholder')}
          className="rounded bg-zinc-900 px-2 py-1 text-sm outline-none ring-1 ring-emerald-500"
        />
      )}
      <button
        className={btn}
        disabled={!repo || !status || status.files.length === 0}
        onClick={() => void run(() => window.api.stashSave(''), 'toast.stashSaved')}
      >
        {t('toolbar.stash')}
      </button>
      <button className={`${btn} ml-auto`} onClick={() => setShowSettings(true)}>
        {t('toolbar.settings')}
      </button>
    </div>
  )
}
