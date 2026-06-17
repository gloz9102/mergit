import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { resolve } from 'node:path'
import { GIT_API_METHODS, type Envelope, type UpdateCheckOptions } from '../shared/api'
import type { GitErrorDto } from '../shared/types'
import { toGitError } from './git/errors'
import { GitService } from './git/gitService'
import { RepoWatcher } from './git/repoWatcher'
import { getUpdateService, UpdateServiceError } from './updateService'

// 창(webContents)마다 독립된 git 세션 — 멀티 윈도우에서 서로 다른 저장소를 연다
interface Session {
  service: GitService
  watcher: RepoWatcher
  win: BrowserWindow | null
}
const sessions = new Map<number, Session>()

// 새 창이 첫 로드 때 가져갈 저장소 경로 (openRepoWindow가 예약)
const pendingRepoPaths = new Map<number, string>()

// GitService 자동 매핑에서 제외하고 직접 구현하는 채널
const CUSTOM_CHANNELS: string[] = ['selectRepo', 'openRepo', 'openRepoWindow', 'initialRepoPath']

function normalizeRepoPath(path: string): string {
  return resolve(path)
}

function focusWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function focusOpenRepo(path: string): boolean {
  const normalized = normalizeRepoPath(path)
  for (const session of sessions.values()) {
    const win = session.win
    if (!win || win.isDestroyed()) continue
    if (normalizeRepoPath(session.service.repoPath) !== normalized) continue
    focusWindow(win)
    return true
  }
  return false
}

export function registerIpc(createWindow: () => BrowserWindow): void {
  ipcMain.handle('git:selectRepo', async (): Promise<Envelope> => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return { ok: true, data: result.canceled ? null : result.filePaths[0] }
  })

  ipcMain.handle('git:openRepo', async (event, path: string): Promise<Envelope> => {
    try {
      const senderId = event.sender.id
      const next = new GitService(path)
      const info = await next.info()
      const win = BrowserWindow.fromWebContents(event.sender)
      let session = sessions.get(senderId)
      if (!session) {
        session = { service: next, watcher: new RepoWatcher(), win }
        sessions.set(senderId, session)
        win?.once('closed', () => {
          sessions.get(senderId)?.watcher.stop()
          sessions.delete(senderId)
        })
      } else {
        session.service = next
        session.win = win
      }
      session.watcher.start(path, () => {
        if (!win || win.isDestroyed()) return
        win.webContents.send('repo-changed')
      })
      return { ok: true, data: info }
    } catch (err) {
      return { ok: false, error: toGitError(err) }
    }
  })

  // 새 창을 만들고, 그 창이 시작할 때 열 저장소 경로를 예약해 둔다
  ipcMain.handle('git:openRepoWindow', async (_event, path: string): Promise<Envelope> => {
    try {
      if (focusOpenRepo(path)) return { ok: true, data: null }
      const win = createWindow()
      const id = win.webContents.id
      pendingRepoPaths.set(id, path)
      win.once('closed', () => pendingRepoPaths.delete(id))
      return { ok: true, data: null }
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

  ipcMain.handle('app:checkForUpdates', async (_event, options?: UpdateCheckOptions): Promise<Envelope> => {
    try {
      return { ok: true, data: await getUpdateService().checkForUpdates(options) }
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

  // 외부 링크 열기 — github.com https URL만 허용(임의 URL 실행 차단)
  ipcMain.handle('app:openExternal', async (_event, url: string): Promise<Envelope> => {
    try {
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
    if (CUSTOM_CHANNELS.includes(method)) continue
    ipcMain.handle(`git:${method}`, async (event, ...args: unknown[]): Promise<Envelope> => {
      try {
        const service = sessions.get(event.sender.id)?.service
        if (!service) throw new Error('no repository open')
        const fn = (service as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[method]
        if (typeof fn !== 'function') throw new Error(`no such git method: ${method}`)
        return { ok: true, data: await fn.apply(service, args) }
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
