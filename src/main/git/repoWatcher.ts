import { watch, type FSWatcher } from 'node:fs'
import type { RefreshScope, RepoWatchErrorDto } from '../../shared/api'

// 워킹 트리 + .git 변경을 감시해 debounce 후 콜백 호출.
// .git/objects, .git/logs, *.lock은 노이즈가 심해 무시한다.
export class RepoWatcher {
  private watchers: FSWatcher[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private pendingScope: RefreshScope | null = null

  start(
    paths: RepoWatchPaths,
    onChange: (scope: RefreshScope) => void,
    onError: (error: RepoWatchErrorDto) => void = () => {}
  ): void {
    this.stop()
    for (const target of watchTargets(paths)) {
      try {
        const watcher = watch(target.path, { recursive: true }, (_event, filename) => {
          const rawPath = filename?.toString() ?? ''
          const watchPath = target.metadata && rawPath ? `.git/${rawPath}` : rawPath
          const scope = scopeForWatchPath(watchPath)
          if (!scope) return
          this.pendingScope = mergeScope(this.pendingScope, scope)
          if (this.timer) clearTimeout(this.timer)
          this.timer = setTimeout(() => {
            const nextScope = this.pendingScope ?? FULL_REFRESH
            this.pendingScope = null
            onChange(nextScope)
          }, 300)
        })
        watcher.on('error', (err) => onError(toWatchError(err)))
        this.watchers.push(watcher)
      } catch (err) {
        onError(toWatchError(err))
      }
    }
  }

  stop(): void {
    for (const watcher of this.watchers) watcher.close()
    this.watchers = []
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.pendingScope = null
  }
}

export interface RepoWatchPaths {
  worktreePath: string
  gitDir: string
  gitCommonDir: string
}

interface WatchTarget {
  path: string
  metadata: boolean
}

export function watchTargets(paths: RepoWatchPaths): WatchTarget[] {
  const result: WatchTarget[] = []
  const seen = new Set<string>()
  for (const target of [
    { path: paths.worktreePath, metadata: false },
    { path: paths.gitDir, metadata: true },
    { path: paths.gitCommonDir, metadata: true }
  ]) {
    const key = process.platform === 'win32' ? target.path.toLowerCase() : target.path
    if (seen.has(key)) continue
    seen.add(key)
    result.push(target)
  }
  return result
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
