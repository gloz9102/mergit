import { BrowserWindow, dialog, ipcMain } from 'electron'
import { GIT_API_METHODS, type Envelope } from '../shared/api'
import { toGitError } from './git/errors'
import { GitService } from './git/gitService'
import { RepoWatcher } from './git/repoWatcher'

let service: GitService | null = null
const watcher = new RepoWatcher()

export function registerIpc(): void {
  ipcMain.handle('git:selectRepo', async (): Promise<Envelope> => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return { ok: true, data: result.canceled ? null : result.filePaths[0] }
  })

  ipcMain.handle('git:openRepo', async (event, path: string): Promise<Envelope> => {
    try {
      const next = new GitService(path)
      const info = await next.info()
      service = next
      const win = BrowserWindow.fromWebContents(event.sender)
      win?.once('closed', () => watcher.stop())
      watcher.start(path, () => {
        if (!win || win.isDestroyed()) return
        win.webContents.send('repo-changed')
      })
      return { ok: true, data: info }
    } catch (err) {
      return { ok: false, error: toGitError(err) }
    }
  })

  for (const method of GIT_API_METHODS) {
    if (method === 'selectRepo' || method === 'openRepo') continue
    ipcMain.handle(`git:${method}`, async (_event, ...args: unknown[]): Promise<Envelope> => {
      try {
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
