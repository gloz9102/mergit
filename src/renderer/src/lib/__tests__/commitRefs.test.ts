import { describe, expect, it } from 'vitest'
import { commitRefBadges } from '../commitRefs'

describe('commitRefBadges', () => {
  it('HEAD가 가리키는 브랜치도 HEAD badge를 별도로 노출한다', () => {
    expect(commitRefBadges(['HEAD -> main', 'origin/main'])).toEqual([
      { key: 'head', label: 'HEAD', kind: 'head' },
      { key: 'ref:main', label: 'main', kind: 'ref' },
      { key: 'ref:origin/main', label: 'origin/main', kind: 'ref' }
    ])
  })

  it('detached HEAD는 중복 없이 HEAD만 노출한다', () => {
    expect(commitRefBadges(['HEAD'])).toEqual([
      { key: 'head', label: 'HEAD', kind: 'head' }
    ])
  })
})
