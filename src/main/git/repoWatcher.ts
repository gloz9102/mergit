import { watch, type FSWatcher } from 'node:fs'
import type { RefreshScope, RepoWatchErrorDto } from '../../shared/api'

// 워킹 트리 + .git 변경을 감시해 debounce 후 콜백 호출.
// .git/objects, .git/logs, *.lock은 노이즈가 심해 무시한다.
export class RepoWatcher {
  private watcher: FSWatcher | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private pendingScope: RefreshScope | null = null

  start(
    repoPath: string,
    onChange: (scope: RefreshScope) => void,
    onError: (error: RepoWatchErrorDto) => void = () => {}
  ): void {
    this.stop()
    try {
      this.watcher = watch(repoPath, { recursive: true }, (_event, filename) => {
        const scope = scopeForWatchPath(filename?.toString() ?? '')
        if (!scope) return
        this.pendingScope = mergeScope(this.pendingScope, scope)
        if (this.timer) clearTimeout(this.timer)
        this.timer = setTimeout(() => {
          const nextScope = this.pendingScope ?? FULL_REFRESH
          this.pendingScope = null
          onChange(nextScope)
        }, 300)
      })
      this.watcher.on('error', (err) => onError(toWatchError(err)))
    } catch (err) {
      this.watcher = null
      onError(toWatchError(err))
    }
  }

  stop(): void {
    this.watcher?.close()
    this.watcher = null
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.pendingScope = null
  }
}

const FULL_REFRESH: Required<RefreshScope> = {
  history: true,
  branches: true,
  status: true,
  stashes: true
}

export function scopeForWatchPath(path: string): RefreshScope | null {
  const f = path.replace(/\\/g, '/')
  if (!f) return { ...FULL_REFRESH }
  if (f.endsWith('.lock') || f.startsWith('.git/objects/')) return null
  if (f === '.git/logs/refs/stash' || f === '.git/refs/stash') return { status: true, stashes: true }
  if (
    f === '.git/HEAD' ||
    f === '.git/packed-refs' ||
    f.startsWith('.git/refs/') ||
    f.startsWith('.git/logs/refs/heads/') ||
    f.startsWith('.git/logs/refs/remotes/')
  ) {
    return { history: true, branches: true, status: true }
  }
  if (
    f === '.git/index' ||
    f === '.git/MERGE_HEAD' ||
    f === '.git/CHERRY_PICK_HEAD' ||
    f === '.git/REVERT_HEAD' ||
    f === '.git/MERGE_MSG'
  ) {
    return { status: true }
  }
  if (f.startsWith('.git/logs/')) return null
  return { status: true }
}

function mergeScope(a: RefreshScope | null, b: RefreshScope): RefreshScope {
  const next: RefreshScope = {}
  if ((a?.history ?? false) || (b.history ?? false)) next.history = true
  if ((a?.branches ?? false) || (b.branches ?? false)) next.branches = true
  if ((a?.status ?? false) || (b.status ?? false)) next.status = true
  if ((a?.stashes ?? false) || (b.stashes ?? false)) next.stashes = true
  return next
}

function toWatchError(err: unknown): RepoWatchErrorDto {
  const detail = err instanceof Error ? err.message : String(err)
  return {
    message: `Failed to watch repository changes: ${detail.split('\n')[0]}`,
    detail
  }
}
