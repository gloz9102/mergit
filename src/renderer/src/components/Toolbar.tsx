import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getBookmarks, onBookmarksChanged, toggleBookmark, type BookmarkedRepo } from '../lib/bookmarks'
import { addRecentRepo } from '../lib/recentRepos'
import { run, toastError } from '../lib/run'
import { useRepoStore } from '../stores/repoStore'
import { useUiStore } from '../stores/uiStore'
import { ContextMenu, MenuItem } from './ContextMenu'

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
  const [stashMessage, setStashMessage] = useState<string | null>(null) // null = 입력창 닫힘
  const [openMenu, setOpenMenu] = useState<{ x: number; y: number } | null>(null)
  const [bookmarks, setBookmarks] = useState<BookmarkedRepo[]>(getBookmarks)
  // 북마크 항목 클릭 시 어느 창으로 열지 묻는 모달
  const [bookmarkModal, setBookmarkModal] = useState<BookmarkedRepo | null>(null)

  const anyPending = Object.values(pending).some(Boolean)
  const bookmarked = !!repo && bookmarks.some((b) => b.path === repo.path)

  // 다른 창에서 북마크를 토글해도 이 창의 별/리스트가 함께 갱신된다
  useEffect(() => onBookmarksChanged(setBookmarks), [])

  // newWindow=true면 선택한 저장소를 새 창에서 연다
  async function handleOpen(newWindow: boolean): Promise<void> {
    setPending('open', true)
    try {
      const path = await window.api.selectRepo()
      if (!path) return
      if (newWindow) await window.api.openRepoWindow(path)
      else await openRepo(path)
      addRecentRepo(path)
    } catch (err) {
      toastError(err)
    } finally {
      setPending('open', false)
    }
  }

  async function openBookmark(b: BookmarkedRepo, newWindow: boolean): Promise<void> {
    setBookmarkModal(null)
    setPending('open', true)
    try {
      if (newWindow) await window.api.openRepoWindow(b.path)
      else await openRepo(b.path)
      addRecentRepo(b.path)
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

  function saveStash(): void {
    const msg = stashMessage?.trim() ?? ''
    setStashMessage(null)
    // 빈 메시지는 서비스가 'WIP'로 처리한다
    void run(() => window.api.stashSave(msg), 'toast.stashSaved', 'stash')
  }

  const btn =
    'rounded px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-transparent'

  return (
    <div className="flex items-center gap-1 border-b border-zinc-700 bg-zinc-800 px-2 py-1.5">
      <div className="flex items-center">
        <button
          className={`${btn} rounded-r-none`}
          disabled={!!pending['open']}
          onClick={() => void handleOpen(false)}
        >
          {pending['open'] && <Spinner />}
          {t('app.openRepo')}
        </button>
        <button
          className={`${btn} rounded-l-none border-l border-zinc-600 px-1.5`}
          disabled={!!pending['open']}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setOpenMenu({ x: r.left, y: r.bottom + 2 })
          }}
        >
          ▾
        </button>
      </div>
      {openMenu && (
        <ContextMenu x={openMenu.x} y={openMenu.y} onClose={() => setOpenMenu(null)}>
          <MenuItem
            label={t('app.openRepoNewWindow')}
            onClick={() => {
              setOpenMenu(null)
              void handleOpen(true)
            }}
          />
          <div className="my-1 border-t border-zinc-600" />
          <p className="px-3 py-1 text-xs font-semibold uppercase text-zinc-500">
            {t('bookmark.header')}
          </p>
          {bookmarks.length === 0 && (
            <p className="px-3 py-1 text-xs text-zinc-600">{t('bookmark.empty')}</p>
          )}
          {bookmarks.map((b) => (
            <MenuItem
              key={b.path}
              label={
                <>
                  <span className="text-yellow-400">★</span> {b.name}
                </>
              }
              onClick={() => {
                setOpenMenu(null)
                setBookmarkModal(b)
              }}
            />
          ))}
        </ContextMenu>
      )}
      {bookmarkModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setBookmarkModal(null)}
        >
          <div
            className="w-96 rounded-lg border border-zinc-600 bg-zinc-800 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold">
              <span className="text-yellow-400">★</span> {bookmarkModal.name}
            </p>
            <p className="mt-1 truncate text-xs text-zinc-500">{bookmarkModal.path}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setBookmarkModal(null)}
                className="rounded px-3 py-1.5 text-sm hover:bg-zinc-700"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => void openBookmark(bookmarkModal, false)}
                className="rounded bg-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-600"
              >
                {t('bookmark.openCurrentWindow')}
              </button>
              <button
                onClick={() => void openBookmark(bookmarkModal, true)}
                className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-semibold hover:bg-emerald-600"
              >
                {t('bookmark.openNewWindow')}
              </button>
            </div>
          </div>
        </div>
      )}
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
      {stashMessage === null ? (
        <button
          className={btn}
          disabled={!repo || !status || status.files.length === 0 || !!pending['stash']}
          onClick={() => setStashMessage('')}
        >
          {pending['stash'] && <Spinner />}
          {t('toolbar.stash')}
        </button>
      ) : (
        <input
          autoFocus
          value={stashMessage}
          onChange={(e) => setStashMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              saveStash()
            }
            if (e.key === 'Escape') setStashMessage(null)
          }}
          onBlur={() => setStashMessage(null)}
          placeholder={t('stash.messagePlaceholder')}
          className="rounded bg-zinc-900 px-2 py-1 text-sm outline-none ring-1 ring-emerald-500"
        />
      )}
      <div className="ml-auto flex items-center gap-2">
        {anyPending && (
          <span aria-hidden className="inline-block animate-spin text-emerald-400">
            ⟳
          </span>
        )}
        <button
          className={btn}
          disabled={!repo}
          title={t('bookmark.toggle')}
          onClick={() => repo && setBookmarks(toggleBookmark(repo.path, repo.name))}
        >
          <span className={bookmarked ? 'text-yellow-400' : 'text-zinc-400'}>
            {bookmarked ? '★' : '☆'}
          </span>
        </button>
        <button className={btn} onClick={() => setShowSettings(true)}>
          {t('toolbar.settings')}
        </button>
      </div>
    </div>
  )
}
