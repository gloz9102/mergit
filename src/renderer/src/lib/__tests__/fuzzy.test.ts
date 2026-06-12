import { describe, expect, it } from 'vitest'
import { fuzzyMatch, substringMatch } from '../fuzzy'

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

describe('substringMatch', () => {
  it('연속 구간의 인덱스를 반환한다', () => {
    expect(substringMatch('eat', 'feature')).toEqual({ matched: true, indices: [1, 2, 3] })
  })

  it('대소문자를 무시한다', () => {
    expect(substringMatch('FIX', 'fix: 버그 수정').matched).toBe(true)
  })

  it('subsequence는 매칭하지 않는다 (연속 부분 문자열만)', () => {
    expect(substringMatch('ft', 'feature').matched).toBe(false)
  })

  it('미매칭이면 matched=false, 인덱스 없음', () => {
    expect(substringMatch('xyz', 'feature')).toEqual({ matched: false, indices: [] })
  })

  it('빈 query는 전체 통과', () => {
    expect(substringMatch('', 'anything')).toEqual({ matched: true, indices: [] })
  })

  it('한글 부분 문자열 매칭', () => {
    expect(substringMatch('버그', 'fix: 버그 수정').indices).toEqual([5, 6])
  })
})
