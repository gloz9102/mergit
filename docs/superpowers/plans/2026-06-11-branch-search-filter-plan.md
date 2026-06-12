# 브랜치 검색/필터 기능 구현 플랜

## 요구사항

1. 포커스 없는 상태에서 타이핑 → 좌측 브랜치 목록(LOCAL/REMOTE) **fuzzy 필터링** (스태시 제외)
2. Ctrl/Cmd+F → 좌측에 **검색 input** 표시. 필터링 중이었으면 필터 중지 후 검색 모드로 전환. 검색은 목록을 숨기지 않음
3. 매칭된 문자 **하이라이트** (필터/검색 모두)

## 설계 결정

- **단일 상태** `branchQuery: { mode: 'filter' | 'search'; text: string } | null` 을 **uiStore**에 둔다 — 전역 keydown(App)과 LeftPanel UI가 함께 사용.
- **필터 모드도 input을 띄운다**: 전역 핸들러는 첫 글자로 진입만 시키고, 이후 입력(Backspace, 한글 IME 포함)은 autoFocus된 input이 받는다. 가장 견고하고 단순.
- fuzzy 매칭은 **greedy subsequence 1-패스** 순수 함수 (점수/랭킹 없음, 원래 순서 유지). 매칭 인덱스를 반환해 하이라이트에 사용.

## 변경 파일

### 신규: `src/renderer/src/lib/fuzzy.ts`

```ts
export interface FuzzyMatch {
  matched: boolean
  indices: number[] // target 기준 매칭 문자 인덱스 (하이라이트용)
}

// query 문자가 target에 순서대로 등장하면 매칭. 대소문자 무시. 빈 query는 전체 통과.
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
  return qi === q.length ? { matched: true, indices } : { matched: false, indices: [] }
}
```

### 신규: `src/renderer/src/lib/__tests__/fuzzy.test.ts`

TDD로 먼저 작성. 케이스: 완전 일치 인덱스 `[0..n]` / subsequence `('ft','feature')→[0,3]` / 불일치 `('xyz','feature')` / 대소문자 무시 `('MAIN','main')` / 빈 query / `('omn','origin/main')` 슬래시 건너뛰기 / query가 더 긴 경우 false / 한글 `('기능','기능브랜치')→[0,1]` / 인덱스 오름차순.

### 수정: `src/renderer/src/stores/uiStore.ts`

```ts
export interface BranchQuery {
  mode: 'filter' | 'search'
  text: string
}
// state: branchQuery: BranchQuery | null (초기 null)
// actions:
startFilter: (initial) => set({ branchQuery: { mode: 'filter', text: initial } }),
startSearch: () => set({ branchQuery: { mode: 'search', text: '' } }), // 필터 중이어도 비우고 전환 (요구사항 2)
setBranchQueryText: (text) => set((s) => (s.branchQuery ? { branchQuery: { ...s.branchQuery, text } } : {})),
closeBranchQuery: () => set({ branchQuery: null }),
```

### 수정: `src/renderer/src/App.tsx` — 전역 keydown

`useEffect(() => {...}, [])` 1회 등록, 상태는 핸들러 내부에서 `getState()` 조회 (재등록 churn 방지):

```ts
useEffect(() => {
  function onKey(e: KeyboardEvent): void {
    const ui = useUiStore.getState()
    if (!useRepoStore.getState().repo) return
    if (ui.showSettings || ui.conflictFile !== null || ui.confirm !== null) return // 모달 열림
    const el = e.target as HTMLElement | null
    // Ctrl/Cmd+F: 다른 input에 있어도 가로채서 검색 진입 (자체 query input은 onKeyDown이 처리)
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
      if (el?.closest?.('[data-branch-query]')) return
      e.preventDefault()
      ui.startSearch()
      return
    }
    // 입력 요소 포커스 중에는 타이핑 필터 금지 (커밋 textarea, rename, CodeMirror 등)
    if (
      el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' ||
      el?.isContentEditable || el?.closest?.('.cm-content')
    ) return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (e.isComposing || e.keyCode === 229) return // 한글 IME 조합 중
    if (e.key.length !== 1) return // printable 문자만
    e.preventDefault()
    ui.startFilter(e.key)
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [])
```

알려진 한계(수용): 한글로 필터를 "시작"하는 것은 IME 조합 특성상 불가 — Ctrl+F로 input을 띄우거나 영문 시작 후 한글 입력. input이 뜬 뒤에는 한글 정상 동작.

### 수정: `src/renderer/src/components/LeftPanel.tsx`

1. **상단 query 바** (LOCAL 섹션 위, `branchQuery != null`일 때):
```tsx
<div className="mb-2 flex items-center gap-1 rounded bg-zinc-900 px-1.5 py-0.5 ring-1 ring-emerald-500">
  <span className="shrink-0 text-xs text-zinc-500">
    {t(branchQuery.mode === 'search' ? 'branchSearch.searchLabel' : 'branchSearch.filterLabel')}
  </span>
  <input data-branch-query autoFocus value={branchQuery.text}
    onChange={(e) => setBranchQueryText(e.target.value)}
    onKeyDown={(e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeBranchQuery() }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        if (branchQuery.mode === 'filter') startSearch() // 필터 → 검색 전환
      }
    }}
    placeholder={t('branchSearch.placeholder')}
    className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-600" />
</div>
```

2. **목록 필터링/매칭** (useMemo):
```ts
// filter 모드: 비매칭 제거 / search 모드 또는 비활성: 전부 표시
const withMatch = (list: BranchDto[]) =>
  list
    .map((b) => ({ branch: b, m: fuzzyMatch(branchQuery?.text ?? '', b.name) }))
    .filter(({ m }) => branchQuery?.mode !== 'filter' || m.matched)
```
`locals`/`remotes` 렌더를 `withMatch(...)` 결과로 교체, `branchRow(branch, indices)` 시그니처 확장.

3. **Highlight 헬퍼** (파일 하단 MenuItem 옆):
```tsx
function Highlight({ text, indices }: { text: string; indices: number[] }) {
  if (indices.length === 0) return <>{text}</>
  const set = new Set(indices)
  return (
    <>{[...text].map((ch, i) =>
      set.has(i)
        ? <span key={i} className="rounded-sm bg-emerald-500/30 font-semibold text-emerald-300">{ch}</span>
        : <span key={i}>{ch}</span>
    )}</>
  )
}
```
branchRow의 `{branch.name}` → `<Highlight text={branch.name} indices={indices} />`.

4. **필터 결과 0건**: locals+remotes 매칭 합계 0이고 filter 모드면 `t('branchSearch.noMatch')` 회색 한 줄.

5. **rename 충돌 방지**: 컨텍스트 메뉴의 rename 항목 onClick에서 `setRenaming(...)` 직전에 `closeBranchQuery()` 호출 (autoFocus 경쟁 제거).

### 수정: `src/renderer/src/locales/ko.json` / `en.json`

```json
"branchSearch": {
  "filterLabel": "필터",  // en: "Filter"
  "searchLabel": "검색",  // en: "Search"
  "placeholder": "브랜치 검색...",  // en: "Search branches..."
  "noMatch": "일치하는 브랜치가 없습니다"  // en: "No matching branches"
}
```
(ASCII straight quote만 사용, ko/en 키 대칭 유지)

## 모드 전환 규칙 요약

| 트리거 | 비활성 | filter 활성 | search 활성 |
|---|---|---|---|
| printable 타이핑(포커스 없음) | filter 진입 | (input이 받음) | (input이 받음) |
| Ctrl/Cmd+F | search 진입 | **filter 중지 → search** | 유지 |
| Escape | — | 종료 | 종료 |

## 구현 순서

1. fuzzy.test.ts 작성 → 실패 확인 → fuzzy.ts 구현 → 통과 (TDD)
2. uiStore 확장 → typecheck
3. locales 키 추가
4. App.tsx 전역 keydown
5. LeftPanel 통합 (query 바 + 필터링 + 하이라이트 + rename 가드)
6. 커밋은 단계별 (fuzzy / store+keydown / LeftPanel UI)

## 검증

- `npx vitest run src/renderer/src/lib/__tests__/fuzzy.test.ts` + `npm test` 전체 + `npm run typecheck`
- `npm run dev` 수동 시나리오:
  1. 포커스 없이 `ma` 타이핑 → "필터: ma" 바 + 목록 좁혀짐 + 하이라이트
  2. Backspace로 줄이기, Escape로 해제
  3. 필터 중 Cmd+F → 필터 해제 + 검색 모드(빈 input), 목록 전체 유지
  4. 검색어 입력 → 목록 유지된 채 매칭 하이라이트
  5. 커밋 메시지 textarea 포커스 중 타이핑 → 필터 미발동, 그 상태에서 Cmd+F → 검색 진입(브라우저 find 안 뜸)
  6. Cmd+F 후 한글 "기능" 입력 → 정상 입력·하이라이트
  7. 필터 0건 → noMatch 메시지
  8. rename 진입 → query 바 닫힘
