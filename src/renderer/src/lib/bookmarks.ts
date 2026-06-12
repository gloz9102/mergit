// 즐겨찾는 저장소 — localStorage에 보존 (recentRepos와 동일한 패턴)
export interface BookmarkedRepo {
  path: string
  name: string
}

const KEY = 'bookmarkedRepos'

export function getBookmarks(): BookmarkedRepo[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

// 있으면 제거, 없으면 추가 — 갱신된 목록을 반환한다
export function toggleBookmark(path: string, name: string): BookmarkedRepo[] {
  const cur = getBookmarks()
  const next = cur.some((b) => b.path === path)
    ? cur.filter((b) => b.path !== path)
    : [...cur, { path, name }]
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}

// 다른 창에서의 북마크 변경 구독 — storage 이벤트는 변경을 일으킨 창에서는
// 발생하지 않으므로 멀티 윈도우 동기화 용도다. 해제 함수를 반환한다.
export function onBookmarksChanged(cb: (list: BookmarkedRepo[]) => void): () => void {
  const listener = (e: StorageEvent): void => {
    if (e.key === KEY || e.key === null) cb(getBookmarks())
  }
  window.addEventListener('storage', listener)
  return () => window.removeEventListener('storage', listener)
}
