import type { ConflictChoice, ConflictSegment } from './types'

// git marker는 정확히 7개 기호 뒤에 label 또는 줄 끝이 온다.
const isStart = (l: string): boolean => /^<<<<<<<(?:\s.*)?\r?$/.test(l)
const isSeparator = (l: string): boolean => /^=======\r?$/.test(l)
const isBase = (l: string): boolean => /^\|\|\|\|\|\|\|(?:\s.*)?\r?$/.test(l)
const isEnd = (l: string): boolean => /^>>>>>>>(?:\s.*)?\r?$/.test(l)

export function parseConflicts(content: string): ConflictSegment[] {
  const lines = content.split('\n')
  const segments: ConflictSegment[] = []
  let context: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (isStart(line)) {
      if (context.length) {
        segments.push({ type: 'context', lines: context })
        context = []
      }
      const oursLabel = line.slice(7).trim()
      const ours: string[] = []
      i++
      while (i < lines.length && !isSeparator(lines[i]) && !isBase(lines[i])) {
        ours.push(lines[i])
        i++
      }
      // diff3 스타일 base 섹션은 ======= 까지 건너뛴다
      // ours 수집 루프는 ||||||| 에서 멈추므로 여기서 base 섹션을 ======= 직전까지 소진한다
      if (i < lines.length && isBase(lines[i])) {
        while (i < lines.length && !isSeparator(lines[i])) i++
      }
      i++ // '=======' 건너뛰기
      const theirs: string[] = []
      while (i < lines.length && !isEnd(lines[i])) {
        theirs.push(lines[i])
        i++
      }
      const theirsLabel = lines[i]?.slice(7).trim() ?? ''
      i++ // '>>>>>>>' 건너뛰기
      segments.push({ type: 'conflict', ours, theirs, oursLabel, theirsLabel })
    } else {
      context.push(line)
      i++
    }
  }
  if (context.length) segments.push({ type: 'context', lines: context })
  return segments
}

// choices는 conflict 세그먼트 순서대로 대응한다
export function buildOutput(segments: ConflictSegment[], choices: ConflictChoice[]): string {
  const out: string[] = []
  let ci = 0
  for (const seg of segments) {
    if (seg.type === 'context') {
      out.push(...seg.lines)
    } else {
      const choice = choices[ci++] ?? 'unresolved'
      if (choice === 'unresolved') out.push(...conflictMarkerLines(seg))
      if (choice === 'ours' || choice === 'both') out.push(...seg.ours)
      if (choice === 'theirs' || choice === 'both') out.push(...seg.theirs)
    }
  }
  return out.join('\n')
}

export function countConflicts(segments: ConflictSegment[]): number {
  return segments.filter((s) => s.type === 'conflict').length
}

export function countResolved(choices: ConflictChoice[]): number {
  return choices.filter((choice) => choice !== 'unresolved').length
}

export type ConflictResolutionValidation =
  | { ok: true }
  | { ok: false; reason: 'unresolved' | 'markers' }

export function validateConflictResolution(
  segments: ConflictSegment[],
  choices: ConflictChoice[],
  output: string
): ConflictResolutionValidation {
  if (countResolved(choices) < countConflicts(segments)) return { ok: false, reason: 'unresolved' }
  if (hasConflictMarkers(output)) return { ok: false, reason: 'markers' }
  return { ok: true }
}

export function hasConflictMarkers(content: string): boolean {
  let state: 'context' | 'ours' | 'theirs' = 'context'
  for (const line of content.split('\n')) {
    if (isStart(line)) {
      if (state !== 'context') return true
      state = 'ours'
      continue
    }
    if (isSeparator(line) && state === 'ours') {
      state = 'theirs'
      continue
    }
    if (isEnd(line)) {
      return true
    }
  }
  return state !== 'context'
}

function conflictMarkerLines(seg: Extract<ConflictSegment, { type: 'conflict' }>): string[] {
  return [
    marker('<<<<<<<', seg.oursLabel),
    ...seg.ours,
    '=======',
    ...seg.theirs,
    marker('>>>>>>>', seg.theirsLabel)
  ]
}

function marker(prefix: string, label: string): string {
  return label ? `${prefix} ${label}` : prefix
}
