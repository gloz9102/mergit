import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BranchDto, GitErrorDto } from '../../../shared/types'
import { run, toastError } from '../lib/run'
import { useRepoStore } from '../stores/repoStore'
import { useUiStore } from '../stores/uiStore'

interface MenuState {
  x: number
  y: number
  branch: BranchDto
}

export function LeftPanel() {
  const { t } = useTranslation()
  const branches = useRepoStore((s) => s.branches)
  const stashes = useRepoStore((s) => s.stashes)
  const status = useRepoStore((s) => s.status)
  const refresh = useRepoStore((s) => s.refresh)
  const ask = useUiStore((s) => s.ask)
  const pushToast = useUiStore((s) => s.pushToast)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [renaming, setRenaming] = useState<{ from: string; value: string } | null>(null)

  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menu])

  const locals = branches.filter((b) => !b.isRemote)
  const remotes = branches.filter((b) => b.isRemote)

  function checkout(branch: BranchDto): void {
    // 원격 브랜치는 프리픽스를 떼고 git의 DWIM 추적 브랜치 생성을 활용
    const name = branch.isRemote ? branch.name.split('/').slice(1).join('/') : branch.name
    void run(() => window.api.checkoutBranch(name))
  }

  function mergeBranch(branch: BranchDto): void {
    void run(async () => {
      const result = await window.api.merge(branch.name)
      if (result.conflicts) pushToast(t('toast.mergeConflict'))
      else pushToast(t('toast.merged'))
    })
  }

  async function deleteBranch(name: string, force: boolean): Promise<void> {
    try {
      await window.api.deleteBranch(name, force)
      await refresh()
    } catch (err) {
      const e = err as GitErrorDto
      if (!force && /not fully merged/i.test(e.detail ?? '')) {
        ask(t('branch.forceDeleteConfirm', { name }), () => void deleteBranch(name, true))
      } else {
        toastError(err)
      }
    }
  }

  function commitRename(): void {
    if (!renaming) return
    const { from, value } = renaming
    setRenaming(null)
    const to = value.trim()
    if (to && to !== from) void run(() => window.api.renameBranch(from, to))
  }

  function branchRow(branch: BranchDto) {
    if (renaming && !branch.isRemote && renaming.from === branch.name) {
      return (
        <input
          key={branch.name}
          autoFocus
          value={renaming.value}
          onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') setRenaming(null)
          }}
          onBlur={commitRename}
          className="w-full rounded bg-zinc-900 px-1 text-sm outline-none ring-1 ring-emerald-500"
        />
      )
    }
    return (
      <button
        key={branch.name}
        onDoubleClick={() => checkout(branch)}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY, branch })
        }}
        className={`block w-full truncate rounded px-1 py-0.5 text-left text-sm hover:bg-zinc-800 ${
          branch.current ? 'font-semibold text-emerald-400' : ''
        }`}
      >
        {branch.current ? '● ' : ''}
        {branch.name}
      </button>
    )
  }

  return (
    <div className="w-56 shrink-0 overflow-y-auto border-r border-zinc-700 p-2">
      <p className="mb-1 text-xs font-semibold uppercase text-zinc-500">{t('panel.local')}</p>
      {locals.map(branchRow)}
      <p className="mb-1 mt-3 text-xs font-semibold uppercase text-zinc-500">{t('panel.remote')}</p>
      {remotes.map(branchRow)}
      <p className="mb-1 mt-3 text-xs font-semibold uppercase text-zinc-500">{t('panel.stash')}</p>
      {stashes.map((stash) => (
        <div key={stash.index} className="group flex items-center gap-1 rounded px-1 hover:bg-zinc-800">
          <span className="min-w-0 flex-1 truncate text-sm">{stash.message}</span>
          <button
            onClick={() => void run(() => window.api.stashApply(stash.index))}
            className="hidden text-xs text-emerald-400 group-hover:block"
          >
            {t('stash.apply')}
          </button>
          <button
            onClick={() =>
              ask(t('stash.dropConfirm', { name: stash.message }), () =>
                void run(() => window.api.stashDrop(stash.index))
              )
            }
            className="hidden text-xs text-red-400 group-hover:block"
          >
            {t('stash.drop')}
          </button>
        </div>
      ))}

      {menu && (
        <div
          className="fixed z-50 w-56 rounded border border-zinc-600 bg-zinc-800 py-1 text-sm shadow-xl"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem
            label={t('branch.checkout')}
            onClick={() => {
              checkout(menu.branch)
              setMenu(null)
            }}
            disabled={menu.branch.current}
          />
          <MenuItem
            label={t('branch.mergeInto', { target: status?.current ?? '' })}
            onClick={() => {
              mergeBranch(menu.branch)
              setMenu(null)
            }}
            disabled={menu.branch.current}
          />
          {!menu.branch.isRemote && (
            <>
              <MenuItem
                label={t('branch.rename')}
                onClick={() => {
                  setRenaming({ from: menu.branch.name, value: menu.branch.name })
                  setMenu(null)
                }}
              />
              <MenuItem
                label={t('branch.delete')}
                danger
                disabled={menu.branch.current}
                onClick={() => {
                  ask(t('branch.deleteConfirm', { name: menu.branch.name }), () =>
                    void deleteBranch(menu.branch.name, false)
                  )
                  setMenu(null)
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  label,
  onClick,
  disabled,
  danger
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`block w-full px-3 py-1 text-left hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-transparent ${
        danger ? 'text-red-400' : ''
      }`}
    >
      {label}
    </button>
  )
}
