import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addRecentRepo } from '../lib/recentRepos'
import { run, toastError } from '../lib/run'
import { useRepoStore } from '../stores/repoStore'
import { useUiStore } from '../stores/uiStore'

function Spinner() {
  return (
    <span aria-hidden className="mr-1 inline-block animate-spin">
      ⟳
    </span>
  )
}

export function Toolbar() {
  const { t } = useTranslation()
  const repo = useRepoStore((s) => s.repo)
  const status = useRepoStore((s) => s.status)
  const openRepo = useRepoStore((s) => s.openRepo)
  const setShowSettings = useUiStore((s) => s.setShowSettings)
  const pending = useUiStore((s) => s.pending)
  const setPending = useUiStore((s) => s.setPending)
  const [branchName, setBranchName] = useState<string | null>(null) // null = 입력창 닫힘

  const anyPending = Object.values(pending).some(Boolean)

  async function handleOpen(): Promise<void> {
    setPending('open', true)
    try {
      const path = await window.api.selectRepo()
      if (!path) return
      await openRepo(path)
      addRecentRepo(path)
    } catch (err) {
      toastError(err)
    } finally {
      setPending('open', false)
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
      <button className={btn} disabled={!!pending['open']} onClick={() => void handleOpen()}>
        {pending['open'] && <Spinner />}
        {t('app.openRepo')}
      </button>
      {repo && <span className="mx-2 text-sm font-semibold text-emerald-400">{repo.name}</span>}
      <button
        className={btn}
        disabled={!repo || !!pending['pull']}
        onClick={() => void run(() => window.api.pull(), 'toast.pulled', 'pull')}
      >
        {pending['pull'] && <Spinner />}
        {t('toolbar.pull')} {status && status.behind > 0 ? `↓${status.behind}` : ''}
      </button>
      <button
        className={btn}
        disabled={!repo || !!pending['push']}
        onClick={() => void run(() => window.api.push(), 'toast.pushed', 'push')}
      >
        {pending['push'] && <Spinner />}
        {t('toolbar.push')} {status && status.ahead > 0 ? `↑${status.ahead}` : ''}
      </button>
      <button
        className={btn}
        disabled={!repo || !!pending['fetch']}
        onClick={() => void run(() => window.api.fetch(), 'toast.fetched', 'fetch')}
      >
        {pending['fetch'] && <Spinner />}
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
        disabled={!repo || !status || status.files.length === 0 || !!pending['stash']}
        onClick={() => void run(() => window.api.stashSave(''), 'toast.stashSaved', 'stash')}
      >
        {pending['stash'] && <Spinner />}
        {t('toolbar.stash')}
      </button>
      <div className="ml-auto flex items-center gap-2">
        {anyPending && (
          <span aria-hidden className="inline-block animate-spin text-emerald-400">
            ⟳
          </span>
        )}
        <button className={btn} onClick={() => setShowSettings(true)}>
          {t('toolbar.settings')}
        </button>
      </div>
    </div>
  )
}
