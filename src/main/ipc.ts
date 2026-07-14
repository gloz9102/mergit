import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  GIT_API_METHODS,
  type Envelope,
  type GitApi,
  type UpdateCheckOptions,
  type UpdateCheckSettings
} from '../shared/api'
import type { GitErrorDto } from '../shared/types'
import { GitServiceError, toGitError } from './git/errors'
import { GitService } from './git/gitService'
import { RepoWatcher } from './git/repoWatcher'
import { getUpdateService, UpdateServiceError } from './updateService'
import { confirmWindowClose } from './windowLifecycle'

// 창(webContents)마다 독립된 git 세션 — 멀티 윈도우에서 서로 다른 저장소를 연다
interface Session {
  service: GitService
  watcher: RepoWatcher
  win: BrowserWindow | null
  canonicalPath: string
}
const sessions = new Map<number, Session>()

// 새 창이 첫 로드 때 가져갈 저장소 경로 (openRepoWindow가 예약)
const pendingRepoPaths = new Map<number, string>()
const openRepoRequestSeq = new Map<number, number>()

// GitService 자동 매핑에서 제외하고 직접 구현하는 채널
const CUSTOM_CHANNELS = [
  'selectRepo',
  'openRepo',
  'openRepoWindow',
  'focusOpenRepo',
  'initialRepoPath'
] as const
type CustomChannel = (typeof CUSTOM_CHANNELS)[number]
type GitIpcMethod = (typeof GIT_API_METHODS)[number]
type ServiceChannel = Exclude<GitIpcMethod, CustomChannel>
type GitServiceHandlers = {
  [K in ServiceChannel]: (
    service: GitService,
    ...args: Parameters<GitApi[K]>
  ) => ReturnType<GitApi[K]>
}

const CUSTOM_CHANNEL_SET = new Set<string>(CUSTOM_CHANNELS)

const GIT_SERVICE_HANDLERS = {
  log: (service, ...args) => service.log(...args),
  searchCommits: (service, ...args) => service.searchCommits(...args),
  status: (service) => service.status(),
  branches: (service) => service.branches(),
  commitFiles: (service, ...args) => service.commitFiles(...args),
  diffCommitFile: (service, ...args) => service.diffCommitFile(...args),
  diffWorkingFile: (service, ...args) => service.diffWorkingFile(...args),
  stage: (service, ...args) => service.stage(...args),
  unstage: (service, ...args) => service.unstage(...args),
  discardUnstaged: (service, ...args) => service.discardUnstaged(...args),
  commit: (service, ...args) => service.commit(...args),
  lastCommitMessage: (service) => service.lastCommitMessage(),
  undoLastCommit: (service) => service.undoLastCommit(),
  createBranch: (service, ...args) => service.createBranch(...args),
  checkoutBranch: (service, ...args) => service.checkoutBranch(...args),
  stashAndCheckoutBranch: (service, ...args) => service.stashAndCheckoutBranch(...args),
  deleteBranch: (service, ...args) => service.deleteBranch(...args),
  renameBranch: (service, ...args) => service.renameBranch(...args),
  merge: (service, ...args) => service.merge(...args),
  cherryPick: (service, ...args) => service.cherryPick(...args),
  revertCommit: (service, ...args) => service.revertCommit(...args),
  continueOperation: (service) => service.continueOperation(),
  abortOperation: (service) => service.abortOperation(),
  push: (service) => service.push(),
  pull: (service) => service.pull(),
  fetch: (service) => service.fetch(),
  stashSave: (service, ...args) => service.stashSave(...args),
  stashList: (service) => service.stashList(),
  stashFiles: (service, ...args) => service.stashFiles(...args),
  stashApply: (service, ...args) => service.stashApply(...args),
  stashPop: (service, ...args) => service.stashPop(...args),
  stashDrop: (service, ...args) => service.stashDrop(...args),
  readWorkingFile: (service, ...args) => service.readWorkingFile(...args),
  readConflictFile: (service, ...args) => service.readConflictFile(...args),
  resolveConflictSide: (service, ...args) => service.resolveConflictSide(...args),
  saveResolved: (service, ...args) => service.saveResolved(...args)
} satisfies GitServiceHandlers

async function canonicalRepoPath(path: string): Promise<string> {
  const canonical = await realpath(resolve(path))
  return process.platform === 'win32' ? canonical.toLowerCase() : canonical
}

function focusWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

async function focusOpenRepo(path: string): Promise<boolean> {
  const canonical = await canonicalRepoPath(path).catch(() => null)
  if (!canonical) return false
  for (const session of sessions.values()) {
    const win = session.win
    if (!win || win.isDestroyed()) continue
    if (session.canonicalPath !== canonical) continue
    focusWindow(win)
    return true
  }
  return false
}

function isCustomChannel(method: GitIpcMethod): method is Extract<GitIpcMethod, CustomChannel> {
  return CUSTOM_CHANNEL_SET.has(method)
}

async function invokeServiceHandler<K extends ServiceChannel>(
  method: K,
  service: GitService,
  args: Parameters<GitApi[K]>
): Promise<Awaited<ReturnType<GitApi[K]>>> {
  const handler = GIT_SERVICE_HANDLERS[method] as GitServiceHandlers[K]
  return handler(service, ...args) as Promise<Awaited<ReturnType<GitApi[K]>>>
}

function validateServiceArgs(method: ServiceChannel, args: unknown[]): void {
  switch (method) {
    case 'status':
    case 'branches':
    case 'lastCommitMessage':
    case 'undoLastCommit':
    case 'continueOperation':
    case 'abortOperation':
    case 'push':
    case 'pull':
    case 'fetch':
    case 'stashList':
      assertArgCount(method, args, 0)
      return
    case 'log':
      assertArgCount(method, args, 2, 3)
      assertNonNegativeInteger(method, args[0])
      assertPositiveInteger(method, args[1])
      assertHistoryOptions(method, args[2])
      return
    case 'searchCommits':
      assertArgCount(method, args, 1, 2)
      assertString(method, args[0])
      assertHistoryOptions(method, args[1])
      return
    case 'stage':
    case 'unstage':
    case 'discardUnstaged':
      assertArgCount(method, args, 1)
      assertPathArray(method, args[0])
      return
    case 'commit':
      assertArgCount(method, args, 1, 2)
      assertString(method, args[0])
      assertOptionalBoolean(method, args[1])
      return
    case 'createBranch':
    case 'deleteBranch':
      assertArgCount(method, args, 2)
      assertString(method, args[0], false)
      assertBoolean(method, args[1])
      return
    case 'diffWorkingFile':
      assertArgCount(method, args, 2)
      assertString(method, args[0], false)
      assertBoolean(method, args[1])
      return
    case 'stashAndCheckoutBranch':
      assertArgCount(method, args, 1, 2)
      assertString(method, args[0], false)
      assertOptionalPathArray(method, args[1])
      return
    case 'stashSave':
      assertArgCount(method, args, 1, 2)
      assertString(method, args[0])
      assertOptionalPathArray(method, args[1])
      return
    case 'diffCommitFile':
    case 'renameBranch':
    case 'saveResolved':
      assertArgCount(method, args, 2)
      assertString(method, args[0], false)
      assertString(method, args[1])
      return
    case 'resolveConflictSide':
      assertArgCount(method, args, 2)
      assertString(method, args[0], false)
      if (args[1] !== 'ours' && args[1] !== 'theirs') invalidArgs(method)
      return
    case 'commitFiles':
    case 'checkoutBranch':
    case 'merge':
    case 'cherryPick':
    case 'revertCommit':
    case 'stashFiles':
    case 'stashApply':
    case 'stashPop':
    case 'stashDrop':
    case 'readWorkingFile':
    case 'readConflictFile':
      assertArgCount(method, args, 1)
      assertString(method, args[0], false)
      return
  }
}

function assertArgCount(method: string, args: unknown[], min: number, max = min): void {
  if (args.length < min || args.length > max) invalidArgs(method)
}

function assertString(method: string, value: unknown, allowEmpty = true): asserts value is string {
  if (typeof value !== 'string' || value.length > 16 * 1024 * 1024 || (!allowEmpty && value.length === 0)) {
    invalidArgs(method)
  }
}

function assertBoolean(method: string, value: unknown): asserts value is boolean {
  if (typeof value !== 'boolean') invalidArgs(method)
}

function assertOptionalBoolean(method: string, value: unknown): void {
  if (value !== undefined) assertBoolean(method, value)
}

function assertNonNegativeInteger(method: string, value: unknown): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) invalidArgs(method)
}

function assertPositiveInteger(method: string, value: unknown): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) invalidArgs(method)
}

function assertPathArray(method: string, value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || value.length > 10_000) invalidArgs(method)
  for (const path of value) assertString(method, path, false)
}

function assertOptionalPathArray(method: string, value: unknown): void {
  if (value !== undefined) assertPathArray(method, value)
}

function assertHistoryOptions(method: string, value: unknown): void {
  if (value === undefined) return
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidArgs(method)
  const options = value as Record<string, unknown>
  if (
    Object.keys(options).some((key) => key !== 'order' && key !== 'all') ||
    (options.order !== 'topo-order' && options.order !== 'date-order') ||
    typeof options.all !== 'boolean'
  ) {
    invalidArgs(method)
  }
}

function assertUpdateCheckOptions(value: unknown): asserts value is UpdateCheckOptions | undefined {
  if (value === undefined) return
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidArgs('checkForUpdates')
  const options = value as Record<string, unknown>
  if (Object.keys(options).some((key) => key !== 'autoDownload') || typeof options.autoDownload !== 'boolean') {
    invalidArgs('checkForUpdates')
  }
}

function assertUpdateCheckSettings(value: unknown): asserts value is UpdateCheckSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidArgs('configureUpdateChecks')
  const settings = value as Record<string, unknown>
  if (
    Object.keys(settings).some((key) => key !== 'autoCheck' && key !== 'autoDownload') ||
    typeof settings.autoCheck !== 'boolean' ||
    typeof settings.autoDownload !== 'boolean'
  ) {
    invalidArgs('configureUpdateChecks')
  }
}

function invalidArgs(method: string): never {
  throw new GitServiceError(`invalid IPC arguments for ${method}`, 'GIT_ERROR')
}

export function registerIpc(createWindow: () => BrowserWindow): void {
  ipcMain.handle('git:selectRepo', async (): Promise<Envelope> => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return { ok: true, data: result.canceled ? null : result.filePaths[0] }
  })

  ipcMain.handle('git:openRepo', async (event, path: unknown): Promise<Envelope> => {
    const senderId = event.sender.id
    const requestSeq = (openRepoRequestSeq.get(senderId) ?? 0) + 1
    openRepoRequestSeq.set(senderId, requestSeq)
    try {
      assertString('openRepo', path, false)
      const next = new GitService(path)
      const [info, watchPaths, canonicalPath] = await Promise.all([
        next.info(),
        next.watchPaths(),
        canonicalRepoPath(path)
      ])
      if (openRepoRequestSeq.get(senderId) !== requestSeq) {
        return { ok: true, data: info }
      }
      const win = BrowserWindow.fromWebContents(event.sender)
      let session = sessions.get(senderId)
      if (!session) {
        session = { service: next, watcher: new RepoWatcher(), win, canonicalPath }
        sessions.set(senderId, session)
        win?.once('closed', () => {
          sessions.get(senderId)?.watcher.stop()
          sessions.delete(senderId)
          openRepoRequestSeq.delete(senderId)
        })
      } else {
        session.service = next
        session.win = win
        session.canonicalPath = canonicalPath
      }
      session.watcher.start(watchPaths, (scope) => {
        if (!win || win.isDestroyed()) return
        win.webContents.send('repo-changed', scope)
      }, (watchError) => {
        if (!win || win.isDestroyed()) return
        win.webContents.send('repo-watch-error', watchError)
      })
      return { ok: true, data: info }
    } catch (err) {
      return { ok: false, error: toGitError(err) }
    }
  })

  // 새 창을 만들고, 그 창이 시작할 때 열 저장소 경로를 예약해 둔다
  ipcMain.handle('git:openRepoWindow', async (_event, path: unknown): Promise<Envelope> => {
    try {
      assertString('openRepoWindow', path, false)
      if (await focusOpenRepo(path)) return { ok: true, data: null }
      const win = createWindow()
      const id = win.webContents.id
      pendingRepoPaths.set(id, path)
      win.once('closed', () => pendingRepoPaths.delete(id))
      return { ok: true, data: null }
    } catch (err) {
      return { ok: false, error: toGitError(err) }
    }
  })

  ipcMain.handle('git:focusOpenRepo', async (_event, path: unknown): Promise<Envelope> => {
    try {
      assertString('focusOpenRepo', path, false)
      return { ok: true, data: await focusOpenRepo(path) }
    } catch (err) {
      return { ok: false, error: toGitError(err) }
    }
  })

  // 렌더러가 마운트 직후 호출 — 예약된 경로가 있으면 한 번만 넘겨준다
  ipcMain.handle('git:initialRepoPath', async (event): Promise<Envelope> => {
    const path = pendingRepoPaths.get(event.sender.id) ?? null
    pendingRepoPaths.delete(event.sender.id)
    return { ok: true, data: path }
  })

  // ── app:* 채널 (git 세션 불필요) ──
  ipcMain.handle('app:getAppVersion', async (): Promise<Envelope> => {
    return { ok: true, data: app.getVersion() }
  })

  ipcMain.handle('app:confirmWindowClose', async (event): Promise<Envelope> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) confirmWindowClose(win)
    return { ok: true, data: null }
  })

  ipcMain.handle('app:checkForUpdates', async (_event, options: unknown): Promise<Envelope> => {
    try {
      assertUpdateCheckOptions(options)
      return { ok: true, data: await getUpdateService().checkForUpdates(options) }
    } catch (err) {
      return { ok: false, error: toUpdateError(err) }
    }
  })

  ipcMain.handle('app:configureUpdateChecks', async (_event, settings: unknown): Promise<Envelope> => {
    try {
      assertUpdateCheckSettings(settings)
      return { ok: true, data: getUpdateService().configureUpdateChecks(settings) }
    } catch (err) {
      return { ok: false, error: toUpdateError(err) }
    }
  })

  ipcMain.handle('app:getUpdateState', async (): Promise<Envelope> => {
    try {
      return { ok: true, data: getUpdateService().getState() }
    } catch (err) {
      return { ok: false, error: toUpdateError(err) }
    }
  })

  ipcMain.handle('app:downloadUpdate', async (): Promise<Envelope> => {
    try {
      await getUpdateService().downloadUpdate()
      return { ok: true, data: null }
    } catch (err) {
      return { ok: false, error: toUpdateError(err) }
    }
  })

  ipcMain.handle('app:installDownloadedUpdate', async (): Promise<Envelope> => {
    try {
      getUpdateService().installDownloadedUpdate()
      return { ok: true, data: null }
    } catch (err) {
      return { ok: false, error: toUpdateError(err) }
    }
  })

  ipcMain.handle('app:copyToClipboard', async (_event, text: unknown): Promise<Envelope> => {
    try {
      assertString('copyToClipboard', text, false)
      clipboard.writeText(text)
      return { ok: true, data: null }
    } catch (err) {
      return { ok: false, error: toGitError(err) }
    }
  })

  // 외부 링크 열기 — github.com https URL만 허용(임의 URL 실행 차단)
  ipcMain.handle('app:openExternal', async (_event, url: unknown): Promise<Envelope> => {
    try {
      assertString('openExternal', url, false)
      const u = new URL(url)
      if (u.protocol !== 'https:' || u.hostname !== 'github.com') {
        throw new Error(`disallowed url: ${url}`)
      }
      await shell.openExternal(u.href)
      return { ok: true, data: null }
    } catch (err) {
      return { ok: false, error: toGitError(err) }
    }
  })

  for (const method of GIT_API_METHODS) {
    if (isCustomChannel(method)) continue
    ipcMain.handle(`git:${method}`, async (event, ...args: unknown[]): Promise<Envelope> => {
      try {
        const service = sessions.get(event.sender.id)?.service
        if (!service) throw new GitServiceError('no repository open', 'NO_REPO')
        validateServiceArgs(method, args)
        return {
          ok: true,
          data: await invokeServiceHandler(method, service, args as Parameters<GitApi[typeof method]>)
        }
      } catch (err) {
        return { ok: false, error: toGitError(err) }
      }
    })
  }
}

function toUpdateError(err: unknown): GitErrorDto {
  const detail = err instanceof Error ? err.message : String(err)
  const code = err instanceof UpdateServiceError ? err.code : 'UPDATE_FAILED'
  return { code, message: detail.split('\n')[0], detail }
}
