import { describe, expect, it } from 'vitest'
import { diffLineClass } from '../diffLines'

describe('diffLineClass', () => {
  it('파일 헤더 라인은 흐리게 표시한다', () => {
    expect(diffLineClass('--- a/file.ts')).toBe('text-zinc-500')
    expect(diffLineClass('+++ b/file.ts')).toBe('text-zinc-500')
  })

  it('추가/삭제/hunk 라인을 기존 색상으로 분류한다', () => {
    expect(diffLineClass('+added')).toBe('bg-emerald-950 text-emerald-300')
    expect(diffLineClass('-removed')).toBe('bg-red-950 text-red-300')
    expect(diffLineClass('@@ -1 +1 @@')).toBe('text-sky-400')
  })

  it('기본 context 라인은 중립 색상이다', () => {
    expect(diffLineClass(' unchanged')).toBe('text-zinc-400')
  })
})
