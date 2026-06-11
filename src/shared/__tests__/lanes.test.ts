import { describe, expect, it } from 'vitest'
import { assignLanes } from '../lanes'
import type { CommitDto } from '../types'

function commit(hash: string, parents: string[]): CommitDto {
  return { hash, parents, author: 'A', email: 'a@t.com', date: '', subject: hash, refs: [] }
}

describe('assignLanes', () => {
  it('선형 히스토리는 모두 레인 0', () => {
    const lanes = assignLanes([commit('c3', ['c2']), commit('c2', ['c1']), commit('c1', [])])
    expect(lanes.get('c3')).toBe(0)
    expect(lanes.get('c2')).toBe(0)
    expect(lanes.get('c1')).toBe(0)
  })

  it('브랜치 분기/머지: 머지 커밋의 두 번째 부모 쪽이 새 레인을 받는다', () => {
    // m(merge) -> a(main), b(feature) -> r(root)
    const lanes = assignLanes([
      commit('m', ['a', 'b']),
      commit('a', ['r']),
      commit('b', ['r']),
      commit('r', [])
    ])
    expect(lanes.get('m')).toBe(0)
    expect(lanes.get('a')).toBe(0)
    expect(lanes.get('b')).toBe(1)
    expect(lanes.get('r')).toBe(0) // 머지 후 레인 1은 닫힌다
  })

  it('독립 루트(고아 브랜치)는 별도 레인을 받는다', () => {
    const lanes = assignLanes([commit('x1', []), commit('y1', [])])
    expect(lanes.get('x1')).toBe(0)
    expect(lanes.get('y1')).toBe(0) // x1 레인이 닫혔으므로 재사용
  })

  it('빈 입력은 빈 맵', () => {
    expect(assignLanes([]).size).toBe(0)
  })
})
