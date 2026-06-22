import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  buildOutput,
  countConflicts,
  countResolved,
  parseConflicts,
  validateConflictResolution
} from '../../../shared/conflicts'
import type { ConflictChoice, ConflictSegment } from '../../../shared/types'
import { run, toastError } from '../lib/run'
import { useUiStore } from '../stores/uiStore'
import { CodeEditor } from './CodeEditor'

const SIDE_CLS = {
  ours: { header: 'bg-emerald-950 text-emerald-300', body: 'bg-emerald-950/50', border: 'border-emerald-400' },
  theirs: { header: 'bg-red-950 text-red-300', body: 'bg-red-950/50', border: 'border-red-400' }
} as const

interface ConflictDraft {
  file: string
  requestId: number
  loading: boolean
  segments: ConflictSegment[]
  choices: ConflictChoice[]
  output: string
  manualEdited: boolean
}

export function ConflictEditor() {
  const { t } = useTranslation()
  const file = useUiStore((s) => s.conflictFile)
  const openConflict = useUiStore((s) => s.openConflict)
  const pushToast = useUiStore((s) => s.pushToast)
  const [draft, setDraft] = useState<ConflictDraft | null>(null)
  const [focus, setFocus] = useState(0) // 현재 충돌 블록 인덱스
  const blockRefs = useRef<(HTMLDivElement | null)[]>([])
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!file) {
      setDraft(null)
      return
    }
    const requestId = ++requestIdRef.current
    let active = true
    setFocus(0)
    setDraft({ file, requestId, loading: true, segments: [], choices: [], output: '', manualEdited: false })
    window.api
      .readWorkingFile(file)
      .then((content) => {
        if (!active || requestId !== requestIdRef.current || useUiStore.getState().conflictFile !== file) return
        const segs = parseConflicts(content)
        const init = segs.filter((s) => s.type === 'conflict').map((): ConflictChoice => 'unresolved')
        setDraft({
          file,
          requestId,
          loading: false,
          segments: segs,
          choices: init,
          output: buildOutput(segs, init),
          manualEdited: false
        })
      })
      .catch((err) => {
        if (!active || requestId !== requestIdRef.current || useUiStore.getState().conflictFile !== file) return
        toastError(err)
        setDraft(null)
        openConflict(null)
      })
    return () => {
      active = false
    }
  }, [file, openConflict])

  const total = useMemo(() => countConflicts(draft?.segments ?? []), [draft?.segments])
  const resolved = countResolved(draft?.choices ?? [])
  const canSave =
    !!file &&
    !!draft &&
    !draft.loading &&
    draft.file === file &&
    validateConflictResolution(draft.segments, draft.choices, draft.output).ok

  function toggle(index: number, side: 'ours' | 'theirs'): void {
    if (!draft || draft.loading) return
    if (draft.manualEdited && !window.confirm(t('merge.discardManualConfirm'))) return
    const next = draft.choices.map((choice, i) => (i === index ? toggleChoice(choice, side) : choice))
    setDraft({
      ...draft,
      choices: next,
      output: buildOutput(draft.segments, next),
      manualEdited: false
    })
  }

  function jump(delta: number): void {
    if (total === 0) return
    const next = Math.min(total - 1, Math.max(0, focus + delta))
    setFocus(next)
    blockRefs.current[next]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  function setOutput(output: string): void {
    setDraft((current) => {
      if (!current || current.output === output) return current
      return { ...current, output, manualEdited: true }
    })
  }

  async function saveDraft(): Promise<void> {
    if (!file || !draft || draft.loading || draft.file !== file) return
    const validation = validateConflictResolution(draft.segments, draft.choices, draft.output)
    if (!validation.ok) {
      pushToast(
        validation.reason === 'unresolved'
          ? t('merge.resolveAllBeforeSave')
          : t('merge.conflictMarkersRemain')
      )
      return
    }
    const saveFile = draft.file
    const saveOutput = draft.output
    await run(async () => {
      await window.api.saveResolved(saveFile, saveOutput)
      openConflict(null)
    }, 'toast.resolvedSaved')
  }

  if (!file || !draft) return null
  const currentDraft = draft

  // 한쪽 컬럼 렌더링: context는 흐리게, 충돌 블록은 체크박스 헤더와 함께
  function column(side: 'ours' | 'theirs') {
    let ci = -1
    return (
      <div className="min-h-0 flex-1 overflow-auto border-r border-zinc-700 last:border-r-0">
        {currentDraft.segments.map((seg, si) => {
          if (seg.type === 'context') {
            return (
              <pre key={si} className="whitespace-pre px-2 font-mono text-xs leading-5 text-zinc-600">
                {seg.lines.join('\n')}
              </pre>
            )
          }
          ci++
          const index = ci
          const checked = isSideSelected(currentDraft.choices[index] ?? 'unresolved', side)
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
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={currentDraft.loading}
                  onChange={() => toggle(index, side)}
                />
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
        {currentDraft.loading ? <span className="text-xs text-zinc-500">{t('merge.loadingFile')}</span> : null}
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
            disabled={!canSave}
            onClick={() => void saveDraft()}
            className="rounded bg-emerald-700 px-3 py-1 text-sm font-semibold hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
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
        <CodeEditor value={currentDraft.output} onChange={setOutput} />
      </div>
    </div>
  )
}

function isSideSelected(choice: ConflictChoice, side: 'ours' | 'theirs'): boolean {
  return choice === side || choice === 'both'
}

function toggleChoice(choice: ConflictChoice, side: 'ours' | 'theirs'): ConflictChoice {
  if (choice === 'unresolved') return side
  if (choice === 'both') return side === 'ours' ? 'theirs' : 'ours'
  if (choice === side) return 'unresolved'
  return 'both'
}
