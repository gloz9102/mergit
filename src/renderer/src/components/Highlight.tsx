// 매칭 인덱스 위치의 문자를 강조해 텍스트를 렌더 (브랜치/커밋 검색 공용)
export function Highlight({ text, indices }: { text: string; indices: number[] }) {
  if (indices.length === 0) return <>{text}</>
  const set = new Set(indices)
  return (
    <>
      {[...text].map((ch, i) =>
        set.has(i) ? (
          <span key={i} className="rounded-sm bg-emerald-500/30 font-semibold text-emerald-300">
            {ch}
          </span>
        ) : (
          <span key={i}>{ch}</span>
        )
      )}
    </>
  )
}
