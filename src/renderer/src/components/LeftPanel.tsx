import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BranchDto, GitErrorDto } from '../../../shared/types'
import { fuzzyMatch } from '../lib/fuzzy'
import { limitBranches, limitList, type LimitedList } from '../lib/listLimits'
import { run, toastError } from '../lib/run'
import { useRepoStore } from '../stores/repoStore'
import { useUiStore } from '../stores/uiStore'
import { ContextMenu, MenuItem } from './ContextMenu'
import { Highlight } from './Highlight'

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
  const closeBranchQuery = useUiStore((s) => s.closeBranchQuery)
  const branchCheckoutGesture = useUiStore((s) => s.branchCheckoutGesture)
  const listLimits = useUiStore((s) => s.leftPanelListLimits)
  const alwaysShowCurrentBranch = useUiStore((s) => s.alwaysShowCurrentBranch)
  const selected = useUiStore((s) => s.selected)
  const select = useUiStore((s) => s.select)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [renaming, setRenaming] = useState<{ from: string; value: string } | null>(null)
  // 섹션(로컬/원격/스태시) 접힘 상태 — localStorage에 보존
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('leftPanelCollapsed') ?? '{}')
    } catch {
      return {}
    }
  })

  function toggleSection(id: string): void {
    setCollapsed((c) => {
      const next = { ...c, [id]: !c[id] }
      localStorage.setItem('leftPanelCollapsed', JSON.stringify(next))
      return next
    })
  }

  // 검색/필터 중에는 접힘을 무시해 매칭 결과가 항상 보이게 한다
  const isOpen = (id: string): boolean => !!branchQuery || !collapsed[id]

  // filter 모드: 비매칭 제거 / search 모드 또는 비활성: 전부 표시. 매칭 인덱스는 하이라이트용.
  const { locals, remotes } = useMemo(() => {
    const withMatch = (list: BranchDto[]): { branch: BranchDto; indices: number[] }[] =>
      list
        .map((b) => ({ branch: b, m: fuzzyMatch(branchQuery?.text ?? '', b.name) }))
        .filter(({ m }) => branchQuery?.mode !== 'filter' || m.matched)
        .map(({ branch, m }) => ({ branch, indices: branchQuery ? m.indices : [] }))
    const localBranches = branches.filter((b) => !b.isRemote)
    return {
      // 설정이 켜져 있으면 현재 체크아웃된 브랜치를 목록 최상단에 고정한다.
      locals: withMatch(
        alwaysShowCurrentBranch
          ? [...localBranches].sort((a, b) => Number(b.current) - Number(a.current))
          : localBranches
      ),
      remotes: withMatch(branches.filter((b) => b.isRemote))
    }
  }, [alwaysShowCurrentBranch, branches, branchQuery])

  const bypassListLimit = !!branchQuery
  const limitedLocals = useMemo(
    () =>
      limitBranches(
        locals.map((item) => item.branch),
        listLimits.local,
        bypassListLimit,
        alwaysShowCurrentBranch
      ),
    [alwaysShowCurrentBranch, bypassListLimit, listLimits.local, locals]
  )
  const limitedRemotes = useMemo(
    () => limitList(remotes.map((item) => item.branch), listLimits.remote, bypassListLimit),
    [bypassListLimit, listLimits.remote, remotes]
  )
  const limitedStashes = useMemo(
    () => limitList(stashes, listLimits.stash, bypassListLimit),
    [bypassListLimit, listLimits.stash, stashes]
  )

  function indicesFor(branch: BranchDto, list: { branch: BranchDto; indices: number[] }[]): number[] {
    return list.find((item) => item.branch.name === branch.name)?.indices ?? []
  }

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
        onClick={() => {
          if (branchCheckoutGesture === 'single') checkout(branch)
        }}
        onDoubleClick={() => {
          if (branchCheckoutGesture === 'double') checkout(branch)
        }}
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
    <div className="h-full w-full overflow-y-auto border-r border-zinc-700 p-2">
      {branchQuery && (
        <div className="mb-2 flex items-center gap-1 rounded bg-zinc-900 px-1.5 py-0.5 ring-1 ring-emerald-500">
          <span className="shrink-0 text-xs text-zinc-500">
            {t(branchQuery.mode === 'search' ? 'branchSearch.searchLabel' : 'branchSearch.filterLabel')}
          </span>
          <input
            data-branch-query
            autoFocus
            value={branchQuery.text}
            onChange={(e) =>
              // 브랜치 이름은 ASCII 기반이므로 한글 입력은 제거한다
              setBranchQueryText(e.target.value.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, ''))
            }
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                closeBranchQuery()
              }
              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
                // 인풋이 열린 상태의 Ctrl+F는 토글 해제 (전역 리스너로 전파 차단)
                e.preventDefault()
                e.stopPropagation()
                closeBranchQuery()
              }
            }}
            placeholder={t('branchSearch.placeholder')}
            className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-600"
          />
        </div>
      )}
      <SectionHeader
        title={t('panel.local')}
        count={locals.length}
        open={isOpen('local')}
        onToggle={() => toggleSection('local')}
      />
      {isOpen('local') && (
        <>
          {limitedLocals.visible.map((branch) => branchRow({ branch, indices: indicesFor(branch, locals) }))}
          <OverflowRow result={limitedLocals} />
        </>
      )}
      <SectionHeader
        title={t('panel.remote')}
        count={remotes.length}
        open={isOpen('remote')}
        onToggle={() => toggleSection('remote')}
        topGap
      />
      {isOpen('remote') && (
        <>
          {limitedRemotes.visible.map((branch) => branchRow({ branch, indices: indicesFor(branch, remotes) }))}
          <OverflowRow result={limitedRemotes} />
        </>
      )}
      {noMatch && <p className="mt-2 text-xs text-zinc-500">{t('branchSearch.noMatch')}</p>}
      <SectionHeader
        title={t('panel.stash')}
        count={stashes.length}
        open={isOpen('stash')}
        onToggle={() => toggleSection('stash')}
        topGap
      />
      {isOpen('stash') &&
        <>
        {limitedStashes.visible.map((stash) => (
        <button
          key={stash.index}
          onClick={() => select({ type: 'stash', index: stash.index })}
          className={`block w-full truncate rounded px-1 py-0.5 text-left text-sm hover:bg-zinc-800 ${
            selected?.type === 'stash' && selected.index === stash.index ? 'bg-zinc-700' : ''
          }`}
        >
          {stash.message}
        </button>
        ))}
        <OverflowRow result={limitedStashes} />
        </>
      }

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
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
        </ContextMenu>
      )}
    </div>
  )
}

function OverflowRow({ result }: { result: LimitedList<unknown> }) {
  if (result.hiddenCount === 0) return null
  return (
    <div
      className="rounded px-1 py-0.5 text-sm text-zinc-500"
      title={`${result.hiddenCount} hidden`}
    >
      ...
    </div>
  )
}

// 접을 수 있는 섹션 헤더 — 체브론과 항목 수를 함께 표시
function SectionHeader({
  title,
  count,
  open,
  onToggle,
  topGap
}: {
  title: string
  count: number
  open: boolean
  onToggle: () => void
  topGap?: boolean
}) {
  return (
    <button
      onClick={onToggle}
      className={`mb-1 flex w-full items-center gap-1 text-xs font-semibold uppercase text-zinc-500 hover:text-zinc-300 ${
        topGap ? 'mt-3' : ''
      }`}
    >
      <span className="w-3 shrink-0">{open ? '▾' : '▸'}</span>
      {title} ({count})
    </button>
  )
}
