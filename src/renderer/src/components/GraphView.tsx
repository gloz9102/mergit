import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { assignLanes } from '../../../shared/lanes'
import type { CommitDto } from '../../../shared/types'
import { useRepoStore } from '../stores/repoStore'
import { useUiStore } from '../stores/uiStore'

const ROW_H = 28
const LANE_W = 14
const GRAPH_PAD = 8
const OVERSCAN = 10
const LANE_COLORS = ['#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#f87171', '#2dd4bf']

type Row = { type: 'wip' } | { type: 'commit'; commit: CommitDto }

export function GraphView() {
  const { t } = useTranslation()
  const commits = useRepoStore((s) => s.commits)
  const status = useRepoStore((s) => s.status)
  const selected = useUiStore((s) => s.selected)
  const select = useUiStore((s) => s.select)

  const hasWip = (status?.files.length ?? 0) > 0
  const rows: Row[] = useMemo(
    () => [
      ...(hasWip ? [{ type: 'wip' } as Row] : []),
      ...commits.map((c) => ({ type: 'commit', commit: c }) as Row)
    ],
    [commits, hasWip]
  )

  const lanes = useMemo(() => assignLanes(commits), [commits])
  const rowOf = useMemo(() => {
    const m = new Map<string, number>()
    rows.forEach((row, i) => {
      if (row.type === 'commit') m.set(row.commit.hash, i)
    })
    return m
  }, [rows])
  const maxLane = useMemo(
    () => commits.reduce((max, c) => Math.max(max, lanes.get(c.hash) ?? 0), 0),
    [commits, lanes]
  )
  const graphW = GRAPH_PAD * 2 + (maxLane + 1) * LANE_W

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

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN)

  const x = (lane: number): number => GRAPH_PAD + lane * LANE_W + LANE_W / 2
  const y = (row: number): number => row * ROW_H + ROW_H / 2
  const color = (lane: number): string => LANE_COLORS[lane % LANE_COLORS.length]

  const edges: ReactNode[] = []
  const nodes: ReactNode[] = []
  // 엣지는 출발/도착이 화면 밖이어도 선이 뷰포트를 가로지를 수 있으므로
  // 전체를 순회하고 가시 범위와 교차하는 것만 그린다
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (row.type !== 'commit') continue
    const lane = lanes.get(row.commit.hash) ?? 0
    for (const p of row.commit.parents) {
      const pr = rowOf.get(p)
      if (pr === undefined) continue
      if (Math.max(i, pr) < start || Math.min(i, pr) > end) continue
      const pl = lanes.get(p) ?? 0
      edges.push(
        <path
          key={`${row.commit.hash}-${p}`}
          d={`M ${x(lane)} ${y(i)} C ${x(lane)} ${y(i) + ROW_H} ${x(pl)} ${y(pr) - ROW_H} ${x(pl)} ${y(pr)}`}
          stroke={color(pl)}
          fill="none"
          strokeWidth="1.5"
        />
      )
    }
  }
  for (let i = start; i < end; i++) {
    const row = rows[i]
    if (row.type !== 'commit') continue
    const lane = lanes.get(row.commit.hash) ?? 0
    nodes.push(<circle key={row.commit.hash} cx={x(lane)} cy={y(i)} r="4" fill={color(lane)} />)
  }

  return (
    <div
      ref={ref}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className="relative min-w-0 flex-1 overflow-y-auto border-r border-zinc-700"
    >
      <div className="relative" style={{ height: rows.length * ROW_H }}>
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
          return (
            <div
              key={row.type === 'wip' ? 'WIP' : row.commit.hash}
              onClick={() =>
                select(row.type === 'wip' ? { type: 'wip' } : { type: 'commit', hash: row.commit.hash })
              }
              className={`absolute flex w-full cursor-pointer items-center gap-2 pr-2 text-sm ${
                isSelected ? 'bg-zinc-700' : 'hover:bg-zinc-800'
              }`}
              style={{ top: i * ROW_H, height: ROW_H, paddingLeft: graphW + 8 }}
            >
              {row.type === 'wip' ? (
                <span className="italic text-amber-300">{t('panel.wip')}</span>
              ) : (
                <>
                  {row.commit.refs.map((r) => (
                    <span
                      key={r}
                      className="shrink-0 rounded bg-zinc-700 px-1 text-xs text-emerald-300"
                    >
                      {r.replace('HEAD -> ', '')}
                    </span>
                  ))}
                  <span className="truncate">{row.commit.subject}</span>
                  <span className="ml-auto shrink-0 text-xs text-zinc-500">{row.commit.author}</span>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
