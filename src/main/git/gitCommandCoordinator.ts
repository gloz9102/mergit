import { AsyncLocalStorage } from 'node:async_hooks'
import { resolve } from 'node:path'
import type { SimpleGitOptions } from 'simple-git'

export type GitCommandKind = 'query' | 'mutation' | 'network'

export const DEFAULT_QUERY_CONCURRENCY = 4
export const DEFAULT_QUERY_TIMEOUT_MS = 30_000
export const DEFAULT_NETWORK_TIMEOUT_MS = 120_000
export const DEFAULT_GIT_PROCESS_IDLE_TIMEOUT_MS = 120_000

interface ActiveCommandContext {
  coordinator: GitCommandCoordinator
  kind: GitCommandKind
  label: string
}

interface GitCommandCoordinatorOptions {
  queryConcurrency?: number
  queryTimeoutMs?: number
  networkTimeoutMs?: number
}

interface QueueItem {
  kind: GitCommandKind
  label: string
  task: () => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (err: unknown) => void
}

interface GitCommandExecutionErrorOptions {
  kind: GitCommandKind
  label: string
  message: string
  stdout: string
  stderr: string
  exitCode: number
  cause?: Error
}

const activeCommand = new AsyncLocalStorage<ActiveCommandContext>()
const coordinators = new Map<string, GitCommandCoordinator>()

export class GitCommandTimeoutError extends Error {
  constructor(
    readonly kind: GitCommandKind,
    readonly label: string,
    readonly timeoutMs: number
  ) {
    super(`Git ${kind} command timed out: ${label}`)
    this.name = 'GitCommandTimeoutError'
  }
}

export class GitCommandExecutionError extends Error {
  readonly kind: GitCommandKind
  readonly label: string
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number

  constructor(options: GitCommandExecutionErrorOptions) {
    super(options.message, options.cause ? { cause: options.cause } : undefined)
    this.name = 'GitCommandExecutionError'
    this.kind = options.kind
    this.label = options.label
    this.stdout = options.stdout
    this.stderr = options.stderr
    this.exitCode = options.exitCode
  }
}

export class GitCommandCoordinator {
  private readonly queryConcurrency: number
  private readonly queryTimeoutMs: number
  private readonly networkTimeoutMs: number
  private queue: QueueItem[] = []
  private runningQueries = 0
  private exclusiveRunning = false

  constructor(
    readonly repoPath: string,
    options: GitCommandCoordinatorOptions = {}
  ) {
    this.queryConcurrency = options.queryConcurrency ?? DEFAULT_QUERY_CONCURRENCY
    this.queryTimeoutMs = options.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS
    this.networkTimeoutMs = options.networkTimeoutMs ?? DEFAULT_NETWORK_TIMEOUT_MS
  }

  query<T>(label: string, task: () => Promise<T>): Promise<T> {
    return this.enqueue('query', label, task)
  }

  mutation<T>(label: string, task: () => Promise<T>): Promise<T> {
    return this.enqueue('mutation', label, task)
  }

  network<T>(label: string, task: () => Promise<T>): Promise<T> {
    return this.enqueue('network', label, task)
  }

  private enqueue<T>(kind: GitCommandKind, label: string, task: () => Promise<T>): Promise<T> {
    if (activeCommand.getStore()?.coordinator === this) return task()
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        kind,
        label,
        task,
        resolve: (value) => resolve(value as T),
        reject
      })
      this.schedule()
    })
  }

  private schedule(): void {
    if (this.exclusiveRunning) return
    while (this.runningQueries < this.queryConcurrency && this.queue[0]?.kind === 'query') {
      const next = this.queue.shift()
      if (next) this.start(next)
    }
    const next = this.queue[0]
    if (!next || next.kind === 'query' || this.runningQueries > 0) return
    this.queue.shift()
    this.start(next)
  }

  private start(item: QueueItem): void {
    if (item.kind === 'query') this.runningQueries += 1
    else this.exclusiveRunning = true

    const taskPromise = activeCommand.run(
      { coordinator: this, kind: item.kind, label: item.label },
      () => Promise.resolve().then(item.task)
    )
    const visiblePromise = this.withTimeout(item, taskPromise)
    visiblePromise.then(item.resolve, item.reject)
    taskPromise
      .catch(() => undefined)
      .finally(() => {
        if (item.kind === 'query') this.runningQueries -= 1
        else this.exclusiveRunning = false
        this.schedule()
      })
  }

  private withTimeout(item: QueueItem, taskPromise: Promise<unknown>): Promise<unknown> {
    const timeoutMs = item.kind === 'query'
      ? this.queryTimeoutMs
      : item.kind === 'network'
        ? this.networkTimeoutMs
        : 0
    if (timeoutMs <= 0) return taskPromise
    let timer: ReturnType<typeof setTimeout> | null = null
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new GitCommandTimeoutError(item.kind, item.label, timeoutMs))
      }, timeoutMs)
    })
    return Promise.race([taskPromise, timeoutPromise]).finally(() => {
      if (timer) clearTimeout(timer)
    })
  }
}

export function getGitCommandCoordinator(repoPath: string): GitCommandCoordinator {
  const key = coordinatorKey(repoPath)
  let coordinator = coordinators.get(key)
  if (!coordinator) {
    coordinator = new GitCommandCoordinator(repoPath)
    coordinators.set(key, coordinator)
  }
  return coordinator
}

export function resetGitCommandCoordinatorsForTests(): void {
  coordinators.clear()
}

export function createGitErrorHandler(): NonNullable<SimpleGitOptions['errors']> {
  return (error, result) => {
    if (!error) return error
    const context = activeCommand.getStore()
    const stdout = Buffer.concat(result.stdOut).toString('utf-8')
    const stderr = Buffer.concat(result.stdErr).toString('utf-8')
    const detail = error instanceof Error ? error.message : error.toString('utf-8')
    const message = detail || stderr || stdout || `Git command failed: ${context?.label ?? 'unknown'}`
    return new GitCommandExecutionError({
      kind: context?.kind ?? 'query',
      label: context?.label ?? 'unknown',
      message,
      stdout,
      stderr,
      exitCode: result.exitCode,
      cause: error instanceof Error ? error : undefined
    })
  }
}

function coordinatorKey(repoPath: string): string {
  const normalized = resolve(repoPath)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}
