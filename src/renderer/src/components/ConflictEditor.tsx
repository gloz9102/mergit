import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
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
import { useDialogA11y } from '../lib/useDialogA11y'
import { useUiStore } from '../stores/uiStore'

const CodeEditor = lazy(() =>
  import('./CodeEditor').then((module) => ({ default: module.CodeEditor }))
)

const SIDE_CLS = {
  ours: { header: 'bg-emerald-950 text-emerald-300', body: 'bg-emerald-950/50', border: 'border-emerald-400' },
  theirs: { header: 'bg-red-950 text-red-300', body: 'bg-red-950/50', border: 'border-red-400' }
} as const

interface ConflictDraft {
  file: string
  requestId: number
  loading: boolean
  kind: 'text' | 'binary'
  oursExists: boolean
  theirsExists: boolean
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
  const ask = useUiStore((s) => s.ask)
  const gitBusy = useUiStore((s) => s.gitMutation !== null)
  const [draft, setDraft] = useState<ConflictDraft | null>(null)
  const [focus, setFocus] = useState(0) // 현재 충돌 블록 인덱스
  const blockRefs = useRef<(HTMLDivElement | null)[]>([])
  const requestIdRef = useRef(0)
  const dialogRef = useDialogA11y(!!file && !!draft, requestClose)

  useEffect(() => {
    if (!file) {
      setDraft(null)
      return
    }
    const requestId = ++requestIdRef.current
    let active = true
    setFocus(0)
    setDraft({
      file,
      requestId,
      loading: true,
      kind: 'text',
      oursExists: false,
      theirsExists: false,
      segments: [],
      choices: [],
      output: '',
      manualEdited: false
    })
    window.api
      .readConflictFile(file)
      .then((conflictFile) => {
        if (!active || requestId !== requestIdRef.current || useUiStore.getState().conflictFile !== file) return
        const content = conflictFile.content ?? ''
        const segs = parseConflicts(content)
        const init = segs.filter((s) => s.type === 'conflict').map((): ConflictChoice => 'unresolved')
        setDraft({
          file,
          requestId,
          loading: false,
          kind: conflictFile.kind,
          oursExists: conflictFile.oursExists,
          theirsExists: conflictFile.theirsExists,
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
  const wholeFile = !!draft && !draft.loading && (draft.kind === 'binary' || total === 0)
  const textEditor = !!draft && !draft.loading && !wholeFile
  const canSave =
    !!file &&
    !!draft &&
    !draft.loading &&
    draft.file === file &&
    draft.kind === 'text' &&
    total > 0 &&
    validateConflictResolution(draft.segments, draft.choices, draft.output).ok

  function toggle(index: number, side: 'ours' | 'theirs'): void {
    if (!draft || draft.loading) return
    if (draft.manualEdited) {
      ask(t('merge.discardManualConfirm'), () => applyChoice(index, side))
      return
    }
    applyChoice(index, side)
  }

  function applyChoice(index: number, side: 'ours' | 'theirs'): void {
    if (!draft || draft.loading) return
    const next = draft.choices.map((choice, i) => (i === index ? toggleChoice(choice, side) : choice))
    setDraft({
      ...draft,
      choices: next,
      output: buildOutput(draft.segments, next),
      manualEdited: false
    })
  }

  function requestClose(): void {
    const dirty = !!draft && !draft.loading && (
      draft.manualEdited || draft.choices.some((choice) => choice !== 'unresolved')
    )
    if (dirty) {
      ask(t('merge.discardDraftConfirm'), () => openConflict(null))
      return
    }
    openConflict(null)
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
    if (!file || !draft || draft.loading || draft.file !== file || draft.kind !== 'text' || total === 0) return
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

  async function resolveWholeFile(side: 'ours' | 'theirs'): Promise<void> {
    if (!file || !draft || draft.loading || draft.file !== file) return
    const resolveFile = draft.file
    await run(async () => {
      await window.api.resolveConflictSide(resolveFile, side)
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
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-editor-title"
      tabIndex={-1}
      className="fixed inset-0 z-30 flex flex-col bg-zinc-900 p-3"
    >
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <span id="conflict-editor-title" className="font-mono text-sm font-semibold">{file}</span>
        {textEditor ? <span className="text-sm text-amber-300">{t('merge.resolved', { resolved, total })}</span> : null}
        {currentDraft.loading ? <span className="text-xs text-zinc-500">{t('merge.loadingFile')}</span> : null}
        {textEditor ? (
          <>
            <button onClick={() => jump(-1)} className="rounded px-2 py-1 text-xs hover:bg-zinc-700">
              ↑ {t('merge.prev')}
            </button>
            <button onClick={() => jump(1)} className="rounded px-2 py-1 text-xs hover:bg-zinc-700">
              ↓ {t('merge.next')}
            </button>
          </>
        ) : null}
        <div className="ml-auto flex gap-2">
          <button
            data-dialog-initial-focus
            onClick={requestClose}
            className="rounded px-3 py-1 text-sm hover:bg-zinc-700"
          >
            {t('common.close')}
          </button>
          {textEditor ? (
            <button
              disabled={gitBusy || !canSave}
              onClick={() => void saveDraft()}
              className="rounded bg-emerald-700 px-3 py-1 text-sm font-semibold hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              {t('merge.save')}
            </button>
          ) : null}
        </div>
      </div>
      {currentDraft.loading ? (
        <div role="status" className="flex flex-1 items-center justify-center text-sm text-zinc-500">
          {t('merge.loadingFile')}
        </div>
      ) : wholeFile ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-2xl rounded border border-zinc-700 bg-zinc-800 p-6">
            <p className="mb-5 text-sm text-zinc-300">
              {t(currentDraft.kind === 'binary' ? 'merge.binaryFile' : 'merge.wholeFileConflict')}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(['ours', 'theirs'] as const).map((side) => {
                const exists = side === 'ours' ? currentDraft.oursExists : currentDraft.theirsExists
                return (
                  <button
                    key={side}
                    disabled={gitBusy}
                    onClick={() => void resolveWholeFile(side)}
                    className={`rounded border p-4 text-left disabled:cursor-not-allowed disabled:opacity-50 ${SIDE_CLS[side].border} ${SIDE_CLS[side].body}`}
                  >
                    <span className="block font-semibold">{t(`merge.use${side === 'ours' ? 'Ours' : 'Theirs'}`)}</span>
                    <span className="mt-1 block text-xs text-zinc-400">
                      {t(exists ? 'merge.keepWholeFile' : 'merge.deleteWholeFile')}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-[3] rounded border border-zinc-700">
            {column('ours')}
            {column('theirs')}
          </div>
          <p className="mt-2 text-xs uppercase text-zinc-500">{t('merge.output')}</p>
          <div className="min-h-0 flex-[2] rounded border border-zinc-700">
            <Suspense fallback={<div className="p-3 text-xs text-zinc-500">{t('merge.loadingFile')}</div>}>
              <CodeEditor value={currentDraft.output} onChange={setOutput} />
            </Suspense>
          </div>
        </>
      )}
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
