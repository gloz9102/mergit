export interface FuzzyMatch {
  matched: boolean
  indices: number[] // target 기준 매칭 문자 인덱스 (하이라이트용)
}

// query 문자가 target에 순서대로(subsequence) 등장하면 매칭.
// 대소문자 무시, 빈 query는 전체 통과. greedy 1-패스 — 점수/랭킹 없음.
export function fuzzyMatch(query: string, target: string): FuzzyMatch {
  if (!query) return { matched: true, indices: [] }
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  const indices: number[] = []
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      indices.push(ti)
      qi++
    }
  }
  if (qi !== q.length) return { matched: false, indices: [] }
  return { matched: true, indices }
}
