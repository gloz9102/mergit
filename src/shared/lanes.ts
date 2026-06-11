import type { CommitDto } from './types'

// commits는 git log 순서(최신 → 과거). lanes[i]에는 그 레인이 다음에
// 기다리는 커밋 해시가 들어 있고, null이면 빈 레인이다.
export function assignLanes(commits: CommitDto[]): Map<string, number> {
  const lanes: (string | null)[] = []
  const result = new Map<string, number>()

  for (const c of commits) {
    let lane = lanes.indexOf(c.hash)
    if (lane === -1) {
      lane = lanes.indexOf(null)
      if (lane === -1) {
        lane = lanes.length
        lanes.push(null)
      }
    }
    result.set(c.hash, lane)

    // 같은 커밋을 기다리던 다른 레인(머지된 브랜치)을 닫는다
    for (let i = 0; i < lanes.length; i++) {
      if (i !== lane && lanes[i] === c.hash) lanes[i] = null
    }

    // 첫 부모는 현재 레인을 잇고, 나머지 부모는 새 레인을 예약한다
    const [first, ...rest] = c.parents
    lanes[lane] = first ?? null
    for (const p of rest) {
      if (!lanes.includes(p)) {
        const free = lanes.indexOf(null)
        if (free === -1) lanes.push(p)
        else lanes[free] = p
      }
    }
  }
  return result
}
