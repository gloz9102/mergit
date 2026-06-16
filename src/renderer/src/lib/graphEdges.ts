import type { CommitDto } from '../../../shared/types'

export interface GraphEdge {
  key: string
  fromRow: number
  toRow: number
  fromLane: number
  toLane: number
  minRow: number
  maxRow: number
  order: number
}

export interface GraphEdgeIndex {
  buckets: Map<number, GraphEdge[]>
}

export function buildGraphEdgeIndex(
  commits: CommitDto[],
  lanes: Map<string, number>,
  rowOffset: number,
  bucketSize: number
): GraphEdgeIndex {
  const rowOf = new Map<string, number>()
  commits.forEach((commit, i) => rowOf.set(commit.hash, i + rowOffset))

  const buckets = new Map<number, GraphEdge[]>()
  let order = 0
  for (const [i, commit] of commits.entries()) {
    const fromRow = i + rowOffset
    const fromLane = lanes.get(commit.hash) ?? 0
    for (const parent of commit.parents) {
      const toRow = rowOf.get(parent)
      if (toRow === undefined) continue
      const edge: GraphEdge = {
        key: `${commit.hash}-${parent}`,
        fromRow,
        toRow,
        fromLane,
        toLane: lanes.get(parent) ?? 0,
        minRow: Math.min(fromRow, toRow),
        maxRow: Math.max(fromRow, toRow),
        order: order++
      }
      const firstBucket = Math.floor(edge.minRow / bucketSize)
      const lastBucket = Math.floor(edge.maxRow / bucketSize)
      for (let bucket = firstBucket; bucket <= lastBucket; bucket++) {
        const list = buckets.get(bucket) ?? []
        list.push(edge)
        buckets.set(bucket, list)
      }
    }
  }
  return { buckets }
}

export function visibleGraphEdges(
  index: GraphEdgeIndex,
  startRow: number,
  endRow: number,
  bucketSize: number
): GraphEdge[] {
  if (endRow < startRow) return []
  const seen = new Map<string, GraphEdge>()
  const firstBucket = Math.floor(startRow / bucketSize)
  const lastBucket = Math.floor(endRow / bucketSize)
  for (let bucket = firstBucket; bucket <= lastBucket; bucket++) {
    for (const edge of index.buckets.get(bucket) ?? []) {
      if (edge.maxRow >= startRow && edge.minRow <= endRow) seen.set(edge.key, edge)
    }
  }
  return [...seen.values()].sort((a, b) => a.order - b.order)
}
