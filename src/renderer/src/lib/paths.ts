// 파일 목록 표시용: 디렉토리와 파일명 분리
export function splitPath(path: string): { dir: string; base: string } {
  const i = path.lastIndexOf('/')
  if (i === -1) return { dir: '', base: path }
  return { dir: path.slice(0, i + 1), base: path.slice(i + 1) }
}
