import { describe, expect, it } from 'vitest'
import { fuzzyMatch } from '../fuzzy'

describe('fuzzyMatch', () => {
  it('완전 일치는 모든 인덱스를 반환한다', () => {
    expect(fuzzyMatch('main', 'main')).toEqual({ matched: true, indices: [0, 1, 2, 3] })
  })

  it('subsequence 매칭과 인덱스', () => {
    expect(fuzzyMatch('ft', 'feature')).toEqual({ matched: true, indices: [0, 3] })
  })

  it('순서가 어긋나거나 없는 문자는 불일치', () => {
    expect(fuzzyMatch('xyz', 'feature').matched).toBe(false)
    expect(fuzzyMatch('ef', 'fe').matched).toBe(false)
  })

  it('대소문자를 무시한다', () => {
    expect(fuzzyMatch('MAIN', 'main').matched).toBe(true)
    expect(fuzzyMatch('rel', 'Release').matched).toBe(true)
  })

  it('빈 query는 전체 통과', () => {
    expect(fuzzyMatch('', 'anything')).toEqual({ matched: true, indices: [] })
  })

  it('슬래시를 건너뛰며 매칭한다', () => {
    expect(fuzzyMatch('omn', 'origin/main').matched).toBe(true)
  })

  it('query가 target보다 길면 불일치', () => {
    expect(fuzzyMatch('mains', 'main').matched).toBe(false)
  })

  it('한글 음절 매칭', () => {
    expect(fuzzyMatch('기능', '기능브랜치')).toEqual({ matched: true, indices: [0, 1] })
  })

  it('인덱스는 오름차순이고 중복이 없다', () => {
    const { indices } = fuzzyMatch('on', 'origin/main')
    expect(indices).toEqual([...new Set(indices)].sort((a, b) => a - b))
  })
})
