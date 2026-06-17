import { describe, expect, it } from 'vitest'
import { assignLanes } from '../../../../shared/lanes'
import type { CommitDto } from '../../../../shared/types'
import { buildGraphEdgeIndex, visibleGraphEdges } from '../graphEdges'

function commit(hash: string, parents: string[]): CommitDto {
  return { hash, parents, author: 'A', email: 'a@t.com', date: '', subject: hash, body: '', refs: [] }
}

describe('graphEdges', () => {
  it('viewport와 교차하는 edge만 반환한다', () => {
    const commits = [
      commit('m', ['a', 'b']),
      commit('a', ['r']),
      commit('b', ['r']),
      commit('r', [])
    ]
    const lanes = assignLanes(commits)
    const index = buildGraphEdgeIndex(commits, lanes, 0, 2)

    const keys = visibleGraphEdges(index, 2, 2, 2).map((edge) => edge.key)

    expect(keys).toContain('m-b')
    expect(keys).toContain('a-r')
    expect(keys).toContain('b-r')
    expect(keys).not.toContain('m-a')
  })

  it('WIP row offset을 edge row에 반영한다', () => {
    const commits = [commit('c2', ['c1']), commit('c1', [])]
    const lanes = assignLanes(commits)
    const [edge] = visibleGraphEdges(buildGraphEdgeIndex(commits, lanes, 1, 64), 0, 3, 64)

    expect(edge.fromRow).toBe(1)
    expect(edge.toRow).toBe(2)
  })
})
