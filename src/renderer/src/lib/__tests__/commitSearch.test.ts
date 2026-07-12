import { describe, expect, it } from 'vitest'
import { commitSearchCacheKey } from '../commitSearch'

describe('commitSearchCacheKey', () => {
  it('같은 경로를 다시 열면 repository generation으로 이전 캐시와 구분한다', () => {
    const options = { order: 'topo-order', all: false } as const
    const first = commitSearchCacheKey('C:/repo', 1, 1, options, 'fix')
    const reopened = commitSearchCacheKey('C:/repo', 2, 1, options, 'fix')

    expect(reopened).not.toBe(first)
  })
})
