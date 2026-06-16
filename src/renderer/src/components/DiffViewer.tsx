import { useEffect, useMemo, useRef, useState } from 'react'
import { DIFF_OVERSCAN, DIFF_ROW_H, diffLineClass } from '../lib/diffLines'

export function DiffViewer({ text }: { text: string }) {
  const lines = useMemo(() => text.split('\n'), [text])
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

  const start = Math.max(0, Math.floor(scrollTop / DIFF_ROW_H) - DIFF_OVERSCAN)
  const end = Math.min(lines.length, Math.ceil((scrollTop + viewH) / DIFF_ROW_H) + DIFF_OVERSCAN)

  return (
    <div
      ref={ref}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className="min-h-0 flex-1 overflow-auto font-mono text-xs leading-5"
    >
      <div className="relative" style={{ height: lines.length * DIFF_ROW_H }}>
        {lines.slice(start, end).map((line, j) => {
          const i = start + j
          return (
            <div
              key={i}
              className={`absolute left-0 w-full whitespace-pre ${diffLineClass(line)}`}
              style={{ top: i * DIFF_ROW_H, height: DIFF_ROW_H }}
            >
              {line || ' '}
            </div>
          )
        })}
      </div>
    </div>
  )
}
