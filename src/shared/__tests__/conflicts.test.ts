import { describe, expect, it } from 'vitest'
import {
  buildOutput,
  hasConflictMarkers,
  parseConflicts,
  validateConflictResolution
} from '../conflicts'

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

  it('내용 라인이 =======로 시작해도 8자 이상이면 구분자로 취급하지 않는다', () => {
    const content = `<<<<<<< HEAD
=======text
=======
theirs
>>>>>>> f
`
    const segs = parseConflicts(content)
    expect(segs[0]).toMatchObject({ type: 'conflict', ours: ['=======text'], theirs: ['theirs'] })
  })

  it('>>>>>>>가 누락된 비정상 파일도 크래시 없이 파싱한다', () => {
    const content = `<<<<<<< HEAD
ours
=======
theirs`
    const segs = parseConflicts(content)
    expect(segs[0]).toMatchObject({ type: 'conflict', ours: ['ours'], theirs: ['theirs'], theirsLabel: '' })
  })
})

describe('buildOutput', () => {
  const segs = parseConflicts(SIMPLE)

  it('ours만 선택', () => {
    expect(buildOutput(segs, ['ours'])).toBe('line1\nours line\nline2\n')
  })

  it('둘 다 선택하면 ours → theirs 순서로 포함', () => {
    expect(buildOutput(segs, ['both'])).toBe(
      'line1\nours line\ntheirs line\nline2\n'
    )
  })

  it('미해결 블록은 삭제하지 않고 conflict marker를 보존한다', () => {
    expect(buildOutput(segs, ['unresolved'])).toBe(SIMPLE)
  })
})

describe('validateConflictResolution', () => {
  const segs = parseConflicts(SIMPLE)

  it('미해결 block은 저장할 수 없다', () => {
    const output = buildOutput(segs, ['unresolved'])
    expect(validateConflictResolution(segs, ['unresolved'], output)).toEqual({
      ok: false,
      reason: 'unresolved'
    })
  })

  it('conflict marker가 남은 output은 저장할 수 없다', () => {
    expect(validateConflictResolution(segs, ['ours'], SIMPLE)).toEqual({
      ok: false,
      reason: 'markers'
    })
  })

  it('모든 block이 해결되고 marker가 없으면 저장할 수 있다', () => {
    expect(validateConflictResolution(segs, ['ours'], buildOutput(segs, ['ours']))).toEqual({
      ok: true
    })
  })

  it('conflict marker를 감지한다', () => {
    expect(hasConflictMarkers(SIMPLE)).toBe(true)
    expect(hasConflictMarkers('line1\nours line\nline2\n')).toBe(false)
  })
})
