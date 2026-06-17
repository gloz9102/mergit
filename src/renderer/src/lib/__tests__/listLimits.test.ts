import { describe, expect, it } from 'vitest'
import type { BranchDto } from '../../../../shared/types'
import { limitBranches, limitList } from '../listLimits'

function branch(name: string, current = false): BranchDto {
  return { name, current, isRemote: false }
}

describe('listLimits', () => {
  it('limitList: 지정 개수까지만 보여주고 숨김 개수를 계산한다', () => {
    const result = limitList([1, 2, 3, 4], 2, false)

    expect(result.visible).toEqual([1, 2])
    expect(result.hiddenCount).toBe(2)
  })

  it('limitList: 검색/필터 중이면 제한 없이 모두 보여준다', () => {
    const result = limitList([1, 2, 3, 4], 2, true)

    expect(result.visible).toEqual([1, 2, 3, 4])
    expect(result.hiddenCount).toBe(0)
  })

  it('limitBranches: 현재 브랜치 항상 보임이면 제한 밖 current도 포함한다', () => {
    const result = limitBranches(
      [branch('a'), branch('b'), branch('current', true), branch('d')],
      2,
      false,
      true
    )

    expect(result.visible.map((item) => item.name)).toEqual(['current', 'a'])
    expect(result.hiddenCount).toBe(2)
  })

  it('limitBranches: 현재 브랜치 항상 보임을 끄면 일반 제한만 적용한다', () => {
    const result = limitBranches(
      [branch('a'), branch('b'), branch('current', true), branch('d')],
      2,
      false,
      false
    )

    expect(result.visible.map((item) => item.name)).toEqual(['a', 'b'])
  })
})
