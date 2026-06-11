import { describe, expect, it } from 'vitest'
import { parseLog } from '../logParser'

const F = '\x1f'
const R = '\x1e'

describe('parseLog', () => {
  it('단일 커밋을 파싱한다', () => {
    const raw = `abc123${F}${F}Kim${F}kim@test.com${F}2026-06-11T10:00:00+09:00${F}initial commit${F}HEAD -> main${R}\n`
    const commits = parseLog(raw)
    expect(commits).toHaveLength(1)
    expect(commits[0]).toEqual({
      hash: 'abc123',
      parents: [],
      author: 'Kim',
      email: 'kim@test.com',
      date: '2026-06-11T10:00:00+09:00',
      subject: 'initial commit',
      refs: ['HEAD -> main']
    })
  })

  it('부모가 여러 개인 머지 커밋을 파싱한다', () => {
    const raw = `m1${F}p1 p2${F}Kim${F}k@t.com${F}2026-06-11T10:00:00+09:00${F}Merge branch 'feature'${F}${R}\n`
    const commits = parseLog(raw)
    expect(commits[0].parents).toEqual(['p1', 'p2'])
    expect(commits[0].refs).toEqual([])
  })

  it('여러 레코드를 파싱하고 빈 레코드는 무시한다', () => {
    const raw = [
      `c2${F}c1${F}A${F}a@t.com${F}2026-06-11T11:00:00+09:00${F}second${F}HEAD -> main, origin/main`,
      `c1${F}${F}A${F}a@t.com${F}2026-06-11T10:00:00+09:00${F}first${F}`
    ].join(R + '\n') + R + '\n'
    const commits = parseLog(raw)
    expect(commits.map((c) => c.hash)).toEqual(['c2', 'c1'])
    expect(commits[0].refs).toEqual(['HEAD -> main', 'origin/main'])
  })

  it('빈 입력이면 빈 배열을 반환한다', () => {
    expect(parseLog('')).toEqual([])
    expect(parseLog('\n')).toEqual([])
  })
})
