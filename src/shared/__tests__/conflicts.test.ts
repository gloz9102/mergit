import { describe, expect, it } from 'vitest'
import { buildOutput, parseConflicts } from '../conflicts'

const SIMPLE = `line1
<<<<<<< HEAD
ours line
=======
theirs line
>>>>>>> feature/api
line2
`

describe('parseConflicts', () => {
  it('단일 충돌 블록을 분해한다', () => {
    const segs = parseConflicts(SIMPLE)
    expect(segs).toEqual([
      { type: 'context', lines: ['line1'] },
      {
        type: 'conflict',
        ours: ['ours line'],
        theirs: ['theirs line'],
        oursLabel: 'HEAD',
        theirsLabel: 'feature/api'
      },
      { type: 'context', lines: ['line2', ''] }
    ])
  })

  it('충돌이 없으면 context 하나만 반환한다', () => {
    const segs = parseConflicts('a\nb\n')
    expect(segs).toEqual([{ type: 'context', lines: ['a', 'b', ''] }])
  })

  it('diff3 스타일의 base 섹션(|||||||)을 무시한다', () => {
    const content = `<<<<<<< HEAD
ours
||||||| merged common ancestors
base
=======
theirs
>>>>>>> feature
`
    const segs = parseConflicts(content)
    expect(segs[0]).toMatchObject({ type: 'conflict', ours: ['ours'], theirs: ['theirs'] })
  })

  it('여러 충돌 블록을 처리한다', () => {
    const content = `<<<<<<< HEAD
a1
=======
b1
>>>>>>> f
mid
<<<<<<< HEAD
a2
=======
b2
>>>>>>> f
`
    const segs = parseConflicts(content)
    const conflicts = segs.filter((s) => s.type === 'conflict')
    expect(conflicts).toHaveLength(2)
  })
})

describe('buildOutput', () => {
  const segs = parseConflicts(SIMPLE)

  it('ours만 선택', () => {
    expect(buildOutput(segs, [{ ours: true, theirs: false }])).toBe('line1\nours line\nline2\n')
  })

  it('둘 다 선택하면 ours → theirs 순서로 포함', () => {
    expect(buildOutput(segs, [{ ours: true, theirs: true }])).toBe(
      'line1\nours line\ntheirs line\nline2\n'
    )
  })

  it('미선택 블록은 비워 둔다', () => {
    expect(buildOutput(segs, [{ ours: false, theirs: false }])).toBe('line1\nline2\n')
  })
})
