import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { assignLanes } from '../../../shared/lanes'
import type { CommitDto, HistoryOrder } from '../../../shared/types'
import { commitRefBadges } from '../lib/commitRefs'
import { substringMatch } from '../lib/fuzzy'
import { buildGraphEdgeIndex, visibleGraphEdges } from '../lib/graphEdges'
import { run, toastError } from '../lib/run'
import { useRepoStore } from '../stores/repoStore'
import { useUiStore } from '../stores/uiStore'
import { ContextMenu, MenuItem } from './ContextMenu'
import { Highlight } from './Highlight'

const ROW_H = 28
const LANE_W = 14
const GRAPH_PAD = 8
const OVERSCAN = 10
const EDGE_BUCKET_SIZE = 64
const LANE_COLORS = ['#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#f87171', '#2dd4bf']
const COMMIT_SEARCH_CACHE_LIMIT = 20
const commitSearchCache = new Map<string, string[]>()
let commitSearchRequestId = 0

type Row = { type: 'wip' } | { type: 'commit'; commit: CommitDto }

interface MenuState {
  x: number
  y: number
  commit: CommitDto
}

export function GraphView() {
  const { t } = useTranslation()
  const commits = useRepoStore((s) => s.commits)
  const repoPath = useRepoStore((s) => s.repo?.path ?? null)
  const historyVersion = useRepoStore((s) => s.historyVersion)
  const historyOptions = useRepoStore((s) => s.historyOptions)
  const setHistoryOptions = useRepoStore((s) => s.setHistoryOptions)
  const status = useRepoStore((s) => s.status)
  const hasMoreCommits = useRepoStore((s) => s.hasMoreCommits)
  const loadingMore = useRepoStore((s) => s.loadingMore)
  const loadMore = useRepoStore((s) => s.loadMore)
  const selected = useUiStore((s) => s.selected)
  const select = useUiStore((s) => s.select)
  const commitQuery = useUiStore((s) => s.commitQuery)
  const setCommitQueryText = useUiStore((s) => s.setCommitQueryText)
  const closeCommitSearch = useUiStore((s) => s.closeCommitSearch)
  const ask = useUiStore((s) => s.ask)
  const pushToast = useUiStore((s) => s.pushToast)
  const searchPending = useUiStore((s) => s.pending['commitSearch'])
  const [menu, setMenu] = useState<MenuState | null>(null)
  const queryText = commitQuery?.text ?? ''

  const hasWip = (status?.files.length ?? 0) > 0
  const rows: Row[] = useMemo(
    () => [
      ...(hasWip ? [{ type: 'wip' } as Row] : []),
      ...commits.map((c) => ({ type: 'commit', commit: c }) as Row)
    ],
    [commits, hasWip]
  )

  const lanes = useMemo(() => assignLanes(commits), [commits])
  const maxLane = useMemo(
    () => commits.reduce((max, c) => Math.max(max, lanes.get(c.hash) ?? 0), 0),
    [commits, lanes]
  )
  const edgeIndex = useMemo(
    () => buildGraphEdgeIndex(commits, lanes, hasWip ? 1 : 0, EDGE_BUCKET_SIZE),
    [commits, lanes, hasWip]
  )
  const graphW = GRAPH_PAD * 2 + (maxLane + 1) * LANE_W

  // HEAD가 가리키는 커밋 — '마지막 커밋 취소' 메뉴 활성 판정용
  const headHash = useMemo(
    () => commits.find((c) => c.refs.some((r) => r === 'HEAD' || r.startsWith('HEAD -> ')))?.hash,
    [commits]
  )

  const ref = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewH, setViewH] = useState(600)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewH(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 첫 페이지가 화면을 못 채우면 추가 페이지를 즉시 불러온다 (큰 모니터 대응)
  useEffect(() => {
    if (hasMoreCommits && !loadingMore && rows.length * ROW_H < viewH) {
      loadMore().catch(toastError)
    }
  }, [rows.length, viewH, hasMoreCommits, loadingMore, loadMore])

  // ── 커밋 검색: 300ms 디바운스 후 현재 히스토리 옵션 범위에서 매칭 해시 집합을 받는다 ──
  const [matches, setMatches] = useState<Set<string>>(new Set())
  const [searching, setSearching] = useState(false)
  const [currentMatch, setCurrentMatch] = useState<string | null>(null)
  const jumping = useRef(false)
  useEffect(() => {
    const requestId = ++commitSearchRequestId
    if (!queryText || !repoPath) {
      setMatches(new Set())
      setSearching(false)
      return
    }
    const cacheKey = `${repoPath}\x00${historyVersion}\x00${historyOptions.order}\x00${historyOptions.all ? 'all' : 'current'}\x00${queryText}`
    const cached = commitSearchCache.get(cacheKey)
    if (cached) {
      setMatches(new Set(cached))
      setSearching(false)
      return
    }
    const timer = setTimeout(() => {
      setSearching(true)
      window.api
        .searchCommits(queryText, historyOptions)
        .then((hashes) => {
          if (requestId !== commitSearchRequestId) return
          if (commitSearchCache.size >= COMMIT_SEARCH_CACHE_LIMIT) {
            const oldest = commitSearchCache.keys().next().value
            if (oldest) commitSearchCache.delete(oldest)
          }
          commitSearchCache.set(cacheKey, hashes)
          setMatches(new Set(hashes))
        })
        .catch((err) => {
          if (requestId === commitSearchRequestId) toastError(err)
        })
        .finally(() => {
          if (requestId === commitSearchRequestId) setSearching(false)
        })
    }, 300)
    return () => clearTimeout(timer)
  }, [queryText, repoPath, historyVersion, historyOptions])

  function changeHistoryOrder(order: HistoryOrder): void {
    setHistoryOptions({ order }).catch(toastError)
  }

  // 다음/이전 매칭으로 점프. 로드 범위에 다음 매칭이 없으면 나타날 때까지 더 불러온다.
  // 검색 결과와 페이지 로딩은 같은 히스토리 옵션을 공유한다.
  async function jump(dir: 1 | -1): Promise<void> {
    if (matches.size === 0 || jumping.current) return
    jumping.current = true
    useUiStore.getState().setPending('commitSearch', true)
    try {
      const matchIdxs = (list: CommitDto[]): number[] =>
        list.map((c, i) => (matches.has(c.hash) ? i : -1)).filter((i) => i >= 0)
      let list = useRepoStore.getState().commits
      let idxs = matchIdxs(list)
      const curIdx = currentMatch ? list.findIndex((c) => c.hash === currentMatch) : -1
      let target: number | undefined
      if (dir === 1) {
        target = idxs.find((i) => i > curIdx)
        while (target === undefined && useRepoStore.getState().hasMoreCommits) {
          await useRepoStore.getState().loadMore()
          list = useRepoStore.getState().commits
          idxs = matchIdxs(list)
          target = idxs.find((i) => i > curIdx)
        }
        target ??= idxs[0] // 끝이면 처음으로 래핑 (로드 범위 내)
      } else {
        const anchor = curIdx === -1 ? Number.POSITIVE_INFINITY : curIdx
        target = [...idxs].reverse().find((i) => i < anchor)
        target ??= idxs[idxs.length - 1] // 처음이면 마지막으로 래핑 (로드 범위 내)
      }
      if (target !== undefined) {
        const hash = list[target].hash
        setCurrentMatch(hash)
        select({ type: 'commit', hash })
        const rowIndex = target + (useRepoStore.getState().status?.files.length ? 1 : 0)
        ref.current?.scrollTo({ top: Math.max(0, rowIndex * ROW_H - viewH / 2) })
      }
    } catch (err) {
      toastError(err)
    } finally {
      useUiStore.getState().setPending('commitSearch', false)
      jumping.current = false
    }
  }

  // ── 커밋 컨텍스트 메뉴 동작 ──
  function cherryPickCommit(c: CommitDto): void {
    void run(
      async () => {
        const result = await window.api.cherryPick(c.hash)
        pushToast(t(result.conflicts ? 'toast.mergeConflict' : 'toast.cherryPicked'))
      },
      undefined,
      'cherryPick'
    )
  }

  function revertCommit(c: CommitDto): void {
    void run(
      async () => {
        const result = await window.api.revertCommit(c.hash)
        pushToast(t(result.conflicts ? 'toast.mergeConflict' : 'toast.reverted'))
      },
      undefined,
      'revert'
    )
  }

  function undoLastCommit(c: CommitDto): void {
    // ahead 0이면 HEAD가 이미 원격에 있다고 보고 히스토리 변경을 경고한다 (보수적 휴리스틱)
    const s = useRepoStore.getState().status
    const pushed = !!s?.tracking && s.ahead === 0
    ask(
      t(pushed ? 'commit.undoLastPushedConfirm' : 'commit.undoLastConfirm', { subject: c.subject }),
      () => void run(() => window.api.undoLastCommit(), 'toast.undidCommit', 'undo')
    )
  }

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN)

  const x = (lane: number): number => GRAPH_PAD + lane * LANE_W + LANE_W / 2
  const y = (row: number): number => row * ROW_H + ROW_H / 2
  const color = (lane: number): string => LANE_COLORS[lane % LANE_COLORS.length]

  const visibleEdges = useMemo(
    () => visibleGraphEdges(edgeIndex, start, end, EDGE_BUCKET_SIZE),
    [edgeIndex, start, end]
  )
  const edges = visibleEdges.map((edge) => (
    <path
      key={edge.key}
      d={`M ${x(edge.fromLane)} ${y(edge.fromRow)} C ${x(edge.fromLane)} ${y(edge.fromRow) + ROW_H} ${x(edge.toLane)} ${y(edge.toRow) - ROW_H} ${x(edge.toLane)} ${y(edge.toRow)}`}
      stroke={color(edge.toLane)}
      fill="none"
      strokeWidth="1.5"
    />
  ))
  const nodes: ReactNode[] = []
  for (let i = start; i < end; i++) {
    const row = rows[i]
    if (row.type !== 'commit') continue
    const lane = lanes.get(row.commit.hash) ?? 0
    nodes.push(<circle key={row.commit.hash} cx={x(lane)} cy={y(i)} r="4" fill={color(lane)} />)
  }

  const contentH = (rows.length + (loadingMore ? 1 : 0)) * ROW_H

  return (
    <div className="relative flex min-w-0 flex-1 flex-col border-r border-zinc-700">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-zinc-700 bg-zinc-900 px-3">
        <span className="shrink-0 text-xs font-semibold uppercase text-zinc-500">
          {t('history.title')}
        </span>
        <div
          className="ml-auto flex min-w-0 items-center overflow-hidden rounded border border-zinc-700"
          aria-label={t('history.orderLabel')}
        >
          {(['topo-order', 'date-order'] as const).map((order) => (
            <button
              key={order}
              type="button"
              onClick={() => changeHistoryOrder(order)}
              aria-pressed={historyOptions.order === order}
              className={`px-2 py-1 text-xs ${
                historyOptions.order === order
                  ? 'bg-emerald-700 text-white'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
              }`}
            >
              {t(`history.${order}`)}
            </button>
          ))}
        </div>
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={historyOptions.all}
            onChange={(e) => setHistoryOptions({ all: e.target.checked }).catch(toastError)}
            className="h-3.5 w-3.5 accent-emerald-600"
          />
          <span>{t('history.all')}</span>
        </label>
      </div>
      {commitQuery && (
        <div className="absolute left-2 right-2 top-12 z-10 flex items-center gap-2 rounded bg-zinc-900/95 px-2 py-1 ring-1 ring-emerald-500">
          <span className="shrink-0 text-xs text-zinc-500">{t('commitSearch.label')}</span>
          <input
            data-commit-query
            autoFocus
            value={commitQuery.text}
            onChange={(e) => setCommitQueryText(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return // 한글 IME 조합 중
              if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                closeCommitSearch()
              }
              if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
                // 인풋이 열린 상태의 Ctrl+Shift+F는 토글 해제 (전역 리스너로 전파 차단)
                e.preventDefault()
                e.stopPropagation()
                closeCommitSearch()
              }
              if (e.key === 'Enter') {
                e.preventDefault()
                void jump(e.shiftKey ? -1 : 1)
              }
            }}
            placeholder={t('commitSearch.placeholder')}
            className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-600"
          />
          <span className="shrink-0 text-xs text-zinc-500">
            {searching || searchPending
              ? t('commitSearch.searching')
              : queryText
                ? matches.size > 0
                  ? t('commitSearch.matchCount', { count: matches.size })
                  : t('commitSearch.noMatch')
                : ''}
          </span>
        </div>
      )}
      <div
        ref={ref}
        onScroll={(e) => {
          const el = e.currentTarget
          setScrollTop(el.scrollTop)
          // 바닥 2뷰포트 전에 미리 다음 페이지를 불러온다
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - el.clientHeight * 2) {
            loadMore().catch(toastError)
          }
        }}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className="relative" style={{ height: contentH }}>
          <svg
            className="pointer-events-none absolute left-0 top-0"
            width={graphW}
            height={rows.length * ROW_H}
          >
            {edges}
            {nodes}
          </svg>
          {rows.slice(start, end).map((row, j) => {
            const i = start + j
            const isSelected =
              row.type === 'wip'
                ? selected?.type === 'wip'
                : selected?.type === 'commit' && selected.hash === row.commit.hash
            const isMatch =
              row.type === 'commit' && queryText !== '' && matches.has(row.commit.hash)
            const isCurrent = isMatch && row.type === 'commit' && currentMatch === row.commit.hash
            return (
              <div
                key={row.type === 'wip' ? 'WIP' : row.commit.hash}
                onClick={() =>
                  select(row.type === 'wip' ? { type: 'wip' } : { type: 'commit', hash: row.commit.hash })
                }
                onContextMenu={
                  row.type === 'commit'
                    ? (e) => {
                        e.preventDefault()
                        setMenu({ x: e.clientX, y: e.clientY, commit: row.commit })
                      }
                    : undefined
                }
                className={`absolute flex w-full cursor-pointer items-center gap-2 pr-2 text-sm ${
                  isSelected
                    ? 'bg-zinc-700'
                    : isMatch
                      ? 'bg-emerald-900/40 hover:bg-emerald-900/60'
                      : 'hover:bg-zinc-800'
                } ${isCurrent ? 'ring-1 ring-inset ring-emerald-400' : ''}`}
                style={{ top: i * ROW_H, height: ROW_H, paddingLeft: graphW + 8 }}
              >
                {row.type === 'wip' ? (
                  <span className="italic text-amber-300">{t('panel.wip')}</span>
                ) : (
                  <>
                    {commitRefBadges(row.commit.refs).map((ref) => (
                      <span
                        key={ref.key}
                        className={`shrink-0 rounded px-1 text-xs ${
                          ref.kind === 'head'
                            ? 'bg-amber-500/20 text-amber-200 ring-1 ring-inset ring-amber-400/40'
                            : 'bg-zinc-700 text-emerald-300'
                        }`}
                      >
                        {ref.label}
                      </span>
                    ))}
                    <span className="truncate">
                      {isMatch ? (
                        <Highlight
                          text={row.commit.subject}
                          indices={substringMatch(queryText, row.commit.subject).indices}
                        />
                      ) : (
                        row.commit.subject
                      )}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-zinc-500">
                      {isMatch ? (
                        <Highlight
                          text={row.commit.author}
                          indices={substringMatch(queryText, row.commit.author).indices}
                        />
                      ) : (
                        row.commit.author
                      )}
                    </span>
                  </>
                )}
              </div>
            )
          })}
          {loadingMore && (
            <div
              className="absolute flex w-full items-center justify-center text-xs text-zinc-500"
              style={{ top: rows.length * ROW_H, height: ROW_H }}
            >
              {t('panel.loadingMore')}
            </div>
          )}
        </div>
      </div>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <MenuItem
            label={t('commit.cherryPick')}
            disabled={menu.commit.hash === headHash || status?.operation != null}
            onClick={() => {
              cherryPickCommit(menu.commit)
              setMenu(null)
            }}
          />
          <MenuItem
            label={t('commit.revert')}
            disabled={status?.operation != null}
            onClick={() => {
              revertCommit(menu.commit)
              setMenu(null)
            }}
          />
          <MenuItem
            label={t('commit.undoLast')}
            danger
            disabled={
              menu.commit.hash !== headHash ||
              status?.operation != null ||
              menu.commit.parents.length === 0
            }
            onClick={() => {
              undoLastCommit(menu.commit)
              setMenu(null)
            }}
          />
        </ContextMenu>
      )}
    </div>
  )
}
