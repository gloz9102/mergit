import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { buildOutput, countConflicts, countResolved, parseConflicts } from '../../../shared/conflicts'
import type { ConflictChoice, ConflictSegment } from '../../../shared/types'
import { run, toastError } from '../lib/run'
import { useUiStore } from '../stores/uiStore'
import { CodeEditor } from './CodeEditor'

const SIDE_CLS = {
  ours: { header: 'bg-emerald-950 text-emerald-300', body: 'bg-emerald-950/50', border: 'border-emerald-400' },
  theirs: { header: 'bg-red-950 text-red-300', body: 'bg-red-950/50', border: 'border-red-400' }
} as const

export function ConflictEditor() {
  const { t } = useTranslation()
  const file = useUiStore((s) => s.conflictFile)
  const openConflict = useUiStore((s) => s.openConflict)
  const [segments, setSegments] = useState<ConflictSegment[]>([])
  const [choices, setChoices] = useState<ConflictChoice[]>([])
  const [output, setOutput] = useState('')
  const [focus, setFocus] = useState(0) // 현재 충돌 블록 인덱스
  const blockRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    if (!file) return
    setFocus(0)
    // 파일 전환 시 이전 파일 내용이 한 프레임 노출되지 않도록 비운다
    setSegments([])
    setChoices([])
    setOutput('')
    window.api
      .readWorkingFile(file)
      .then((content) => {
        const segs = parseConflicts(content)
        const init = segs.filter((s) => s.type === 'conflict').map(() => ({ ours: false, theirs: false }))
        setSegments(segs)
        setChoices(init)
        setOutput(buildOutput(segs, init))
      })
      .catch((err) => {
        toastError(err)
        openConflict(null)
      })
  }, [file, openConflict])

  const total = useMemo(() => countConflicts(segments), [segments])
  const resolved = countResolved(choices)

  function toggle(index: number, side: 'ours' | 'theirs'): void {
    const next = choices.map((c, i) => (i === index ? { ...c, [side]: !c[side] } : c))
    setChoices(next)
    setOutput(buildOutput(segments, next))
  }

  function jump(delta: number): void {
    const next = Math.min(total - 1, Math.max(0, focus + delta))
    setFocus(next)
    blockRefs.current[next]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  if (!file) return null

  // 한쪽 컬럼 렌더링: context는 흐리게, 충돌 블록은 체크박스 헤더와 함께
  function column(side: 'ours' | 'theirs') {
    let ci = -1
    return (
      <div className="min-h-0 flex-1 overflow-auto border-r border-zinc-700 last:border-r-0">
        {segments.map((seg, si) => {
          if (seg.type === 'context') {
            return (
              <pre key={si} className="whitespace-pre px-2 font-mono text-xs leading-5 text-zinc-600">
                {seg.lines.join('\n')}
              </pre>
            )
          }
          ci++
          const index = ci
          const checked = choices[index]?.[side] ?? false
          const lines = side === 'ours' ? seg.ours : seg.theirs
          const label = side === 'ours' ? seg.oursLabel : seg.theirsLabel
          return (
            <div
              key={si}
              ref={(el) => {
                if (side === 'ours') blockRefs.current[index] = el
              }}
              className={`my-1 border-l-2 ${index === focus ? SIDE_CLS[side].border : 'border-transparent'}`}
            >
              <label
                className={`flex cursor-pointer items-center gap-2 px-2 py-1 text-xs ${SIDE_CLS[side].header}`}
              >
                <input type="checkbox" checked={checked} onChange={() => toggle(index, side)} />
                #{index + 1} {t(`merge.${side}`, { label })}
              </label>
              <pre
                className={`whitespace-pre px-2 font-mono text-xs leading-5 ${
                  checked ? `${SIDE_CLS[side].body} text-zinc-200` : 'text-zinc-500'
                }`}
              >
                {lines.join('\n')}
              </pre>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-zinc-900 p-3">
      <div className="mb-2 flex items-center gap-3">
        <span className="font-mono text-sm font-semibold">{file}</span>
        <span className="text-sm text-amber-300">{t('merge.resolved', { resolved, total })}</span>
        <button onClick={() => jump(-1)} className="rounded px-2 py-1 text-xs hover:bg-zinc-700">
          ↑ {t('merge.prev')}
        </button>
        <button onClick={() => jump(1)} className="rounded px-2 py-1 text-xs hover:bg-zinc-700">
          ↓ {t('merge.next')}
        </button>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => openConflict(null)}
            className="rounded px-3 py-1 text-sm hover:bg-zinc-700"
          >
            {t('common.close')}
          </button>
          <button
            onClick={() =>
              void run(async () => {
                await window.api.saveResolved(file, output)
                openConflict(null)
              }, 'toast.resolvedSaved')
            }
            className="rounded bg-emerald-700 px-3 py-1 text-sm font-semibold hover:bg-emerald-600"
          >
            {t('merge.save')}
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-[3] rounded border border-zinc-700">
        {column('ours')}
        {column('theirs')}
      </div>
      <p className="mt-2 text-xs uppercase text-zinc-500">{t('merge.output')}</p>
      <div className="min-h-0 flex-[2] rounded border border-zinc-700">
        <CodeEditor value={output} onChange={setOutput} />
      </div>
    </div>
  )
}
