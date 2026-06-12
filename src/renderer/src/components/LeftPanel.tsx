import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BranchDto, GitErrorDto } from '../../../shared/types'
import { fuzzyMatch } from '../lib/fuzzy'
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
  const branchQuery = useUiStore((s) => s.branchQuery)
  const setBranchQueryText = useUiStore((s) => s.setBranchQueryText)
  const startSearch = useUiStore((s) => s.startSearch)
  const closeBranchQuery = useUiStore((s) => s.closeBranchQuery)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [renaming, setRenaming] = useState<{ from: string; value: string } | null>(null)

  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menu])

  // filter 모드: 비매칭 제거 / search 모드 또는 비활성: 전부 표시. 매칭 인덱스는 하이라이트용.
  const { locals, remotes } = useMemo(() => {
    const withMatch = (list: BranchDto[]): { branch: BranchDto; indices: number[] }[] =>
      list
        .map((b) => ({ branch: b, m: fuzzyMatch(branchQuery?.text ?? '', b.name) }))
        .filter(({ m }) => branchQuery?.mode !== 'filter' || m.matched)
        .map(({ branch, m }) => ({ branch, indices: branchQuery ? m.indices : [] }))
    return {
      locals: withMatch(branches.filter((b) => !b.isRemote)),
      remotes: withMatch(branches.filter((b) => b.isRemote))
    }
  }, [branches, branchQuery])

  const noMatch = branchQuery?.mode === 'filter' && locals.length + remotes.length === 0

  function checkout(branch: BranchDto): void {
    // 원격 브랜치는 프리픽스를 떼고 git의 DWIM 추적 브랜치 생성을 활용
    const name = branch.isRemote ? branch.name.split('/').slice(1).join('/') : branch.name
    void run(() => window.api.checkoutBranch(name), undefined, 'checkout')
  }

  function mergeBranch(branch: BranchDto): void {
    void run(
      async () => {
        const result = await window.api.merge(branch.name)
        if (result.conflicts) pushToast(t('toast.mergeConflict'))
        else pushToast(t('toast.merged'))
      },
      undefined,
      'merge'
    )
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

  function branchRow({ branch, indices }: { branch: BranchDto; indices: number[] }) {
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
        <Highlight text={branch.name} indices={indices} />
      </button>
    )
  }

  return (
    <div className="w-56 shrink-0 overflow-y-auto border-r border-zinc-700 p-2">
      {branchQuery && (
        <div className="mb-2 flex items-center gap-1 rounded bg-zinc-900 px-1.5 py-0.5 ring-1 ring-emerald-500">
          <span className="shrink-0 text-xs text-zinc-500">
            {t(branchQuery.mode === 'search' ? 'branchSearch.searchLabel' : 'branchSearch.filterLabel')}
          </span>
          <input
            data-branch-query
            autoFocus
            value={branchQuery.text}
            onChange={(e) => setBranchQueryText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                closeBranchQuery()
              }
              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
                e.preventDefault()
                if (branchQuery.mode === 'filter') startSearch() // 필터 중지 → 검색 전환
              }
            }}
            placeholder={t('branchSearch.placeholder')}
            className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-600"
          />
        </div>
      )}
      <p className="mb-1 text-xs font-semibold uppercase text-zinc-500">{t('panel.local')}</p>
      {locals.map(branchRow)}
      <p className="mb-1 mt-3 text-xs font-semibold uppercase text-zinc-500">{t('panel.remote')}</p>
      {remotes.map(branchRow)}
      {noMatch && <p className="mt-2 text-xs text-zinc-500">{t('branchSearch.noMatch')}</p>}
      <p className="mb-1 mt-3 text-xs font-semibold uppercase text-zinc-500">{t('panel.stash')}</p>
      {stashes.map((stash) => (
        <div key={stash.index} className="group flex items-center gap-1 rounded px-1 hover:bg-zinc-800">
          <span className="min-w-0 flex-1 truncate text-sm">{stash.message}</span>
          <button
            onClick={() => void run(() => window.api.stashApply(stash.index), undefined, 'stash')}
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
                  closeBranchQuery() // rename input과 autoFocus 경쟁 방지
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

// 매칭 인덱스 위치의 문자를 강조해 브랜치 이름을 렌더
function Highlight({ text, indices }: { text: string; indices: number[] }) {
  if (indices.length === 0) return <>{text}</>
  const set = new Set(indices)
  return (
    <>
      {[...text].map((ch, i) =>
        set.has(i) ? (
          <span key={i} className="rounded-sm bg-emerald-500/30 font-semibold text-emerald-300">
            {ch}
          </span>
        ) : (
          <span key={i}>{ch}</span>
        )
      )}
    </>
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
