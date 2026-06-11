import { watch, type FSWatcher } from 'node:fs'

// 워킹 트리 + .git 변경을 감시해 debounce 후 콜백 호출.
// .git/objects, .git/logs, *.lock은 노이즈가 심해 무시한다.
export class RepoWatcher {
  private watcher: FSWatcher | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  start(repoPath: string, onChange: () => void): void {
    this.stop()
    this.watcher = watch(repoPath, { recursive: true }, (_event, filename) => {
      const f = filename?.toString() ?? ''
      // filename이 null(빈 문자열)이면 보수적으로 통과시켜 refresh를 유도한다
      if (f.startsWith('.git/objects') || f.startsWith('.git/logs') || f.endsWith('.lock')) return
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(onChange, 300)
    })
  }

  stop(): void {
    this.watcher?.close()
    this.watcher = null
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}
