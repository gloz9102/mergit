import type { ConflictChoice, ConflictSegment } from './types'

export function parseConflicts(content: string): ConflictSegment[] {
  const lines = content.split('\n')
  const segments: ConflictSegment[] = []
  let context: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('<<<<<<<')) {
      if (context.length) {
        segments.push({ type: 'context', lines: context })
        context = []
      }
      const oursLabel = line.slice(7).trim()
      const ours: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('=======') && !lines[i].startsWith('|||||||')) {
        ours.push(lines[i])
        i++
      }
      // diff3 스타일 base 섹션은 ======= 까지 건너뛴다
      if (i < lines.length && lines[i].startsWith('|||||||')) {
        while (i < lines.length && !lines[i].startsWith('=======')) i++
      }
      i++ // '=======' 건너뛰기
      const theirs: string[] = []
      while (i < lines.length && !lines[i].startsWith('>>>>>>>')) {
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
      const choice = choices[ci++] ?? { ours: false, theirs: false }
      if (choice.ours) out.push(...seg.ours)
      if (choice.theirs) out.push(...seg.theirs)
    }
  }
  return out.join('\n')
}

export function countConflicts(segments: ConflictSegment[]): number {
  return segments.filter((s) => s.type === 'conflict').length
}

export function countResolved(choices: ConflictChoice[]): number {
  return choices.filter((c) => c.ours || c.theirs).length
}
