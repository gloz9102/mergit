import { BrowserWindow, dialog, ipcMain } from 'electron'
import { GIT_API_METHODS, type Envelope } from '../shared/api'
import { toGitError } from './git/errors'
import { GitService } from './git/gitService'
import { RepoWatcher } from './git/repoWatcher'

// 창(webContents)마다 독립된 git 세션 — 멀티 윈도우에서 서로 다른 저장소를 연다
interface Session {
  service: GitService
  watcher: RepoWatcher
}
const sessions = new Map<number, Session>()

// 새 창이 첫 로드 때 가져갈 저장소 경로 (openRepoWindow가 예약)
const pendingRepoPaths = new Map<number, string>()

// GitService 자동 매핑에서 제외하고 직접 구현하는 채널
const CUSTOM_CHANNELS: string[] = ['selectRepo', 'openRepo', 'openRepoWindow', 'initialRepoPath']

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
        session = { service: next, watcher: new RepoWatcher() }
        sessions.set(senderId, session)
        win?.once('closed', () => {
          sessions.get(senderId)?.watcher.stop()
          sessions.delete(senderId)
        })
      } else {
        session.service = next
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
