import type { BrowserWindow } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Envelope, UpdateCheckDto } from '../../shared/api'
import { makeRepo } from '../git/__tests__/fixtures'
import { registerIpc } from '../ipc'

const electronMock = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handlers,
    app: { getVersion: vi.fn(() => '0.3.2') },
    browserWindow: { fromWebContents: vi.fn() },
    dialog: { showOpenDialog: vi.fn() },
    ipcMain: {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler)
      })
    },
    shell: { openExternal: vi.fn(() => Promise.resolve()) }
  }
})

const repoWatcherMock = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn()
}))

vi.mock('electron', () => ({
  app: electronMock.app,
  BrowserWindow: electronMock.browserWindow,
  dialog: electronMock.dialog,
  ipcMain: electronMock.ipcMain,
  shell: electronMock.shell
}))

vi.mock('../git/repoWatcher', () => ({
  RepoWatcher: vi.fn(function RepoWatcher() {
    return repoWatcherMock
  })
}))

function registerHandlers(): void {
  registerIpc(() => ({ webContents: { id: 1 }, once: vi.fn() }) as unknown as BrowserWindow)
}

function handler(name: string): (...args: unknown[]) => unknown {
  const h = electronMock.handlers.get(name)
  expect(h).toBeDefined()
  return h!
}

describe('app IPC', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    electronMock.handlers.clear()
    electronMock.app.getVersion.mockReturnValue('0.3.2')
    electronMock.shell.openExternal.mockClear()
    electronMock.ipcMain.handle.mockClear()
    electronMock.browserWindow.fromWebContents.mockReset()
    repoWatcherMock.start.mockClear()
    repoWatcherMock.stop.mockClear()
    registerHandlers()
  })

  it('checkForUpdates: GitHub 최신 릴리스가 현재보다 높으면 업데이트 있음으로 반환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ tag_name: 'v0.4.0', html_url: 'https://github.com/gloz9102/mergit/releases/tag/v0.4.0' }))
      )
    )

    const res = (await handler('app:checkForUpdates')()) as Envelope

    expect(res.ok).toBe(true)
    const data = (res as { ok: true; data: UpdateCheckDto }).data
    expect(data).toEqual({
      currentVersion: '0.3.2',
      latestVersion: '0.4.0',
      hasUpdate: true,
      releaseUrl: 'https://github.com/gloz9102/mergit/releases/tag/v0.4.0'
    })
  })

  it('checkForUpdates: GitHub 오류를 UPDATE_FAILED envelope로 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })))

    const res = (await handler('app:checkForUpdates')()) as Envelope

    expect(res.ok).toBe(false)
    expect((res as { ok: false; error: { code: string } }).error.code).toBe('UPDATE_FAILED')
  })

  it('openExternal: github.com https URL만 연다', async () => {
    const url = 'https://github.com/gloz9102/mergit/releases/tag/v0.4.0'

    const res = (await handler('app:openExternal')({}, url)) as Envelope

    expect(res.ok).toBe(true)
    expect(electronMock.shell.openExternal).toHaveBeenCalledWith(url)
  })

  it('openExternal: github.com 이외 URL은 차단한다', async () => {
    const res = (await handler('app:openExternal')({}, 'https://example.com/release')) as Envelope

    expect(res.ok).toBe(false)
    expect(electronMock.shell.openExternal).not.toHaveBeenCalled()
  })

  it('openRepoWindow: 이미 열린 저장소는 새 창 대신 기존 창을 포커스한다', async () => {
    const dir = makeRepo()
    const existingWindow = {
      webContents: { id: 10 },
      once: vi.fn(),
      isDestroyed: vi.fn(() => false),
      isMinimized: vi.fn(() => true),
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn()
    } as unknown as BrowserWindow
    electronMock.browserWindow.fromWebContents.mockReturnValue(existingWindow)

    const openRes = (await handler('git:openRepo')({ sender: { id: 10 } }, dir)) as Envelope
    expect(openRes.ok).toBe(true)

    const createWindow = vi.fn(
      () => ({ webContents: { id: 11 }, once: vi.fn() }) as unknown as BrowserWindow
    )
    registerIpc(createWindow)
    const newWindowRes = (await handler('git:openRepoWindow')({}, `${dir}/.`)) as Envelope

    expect(newWindowRes.ok).toBe(true)
    expect(createWindow).not.toHaveBeenCalled()
    expect(existingWindow.restore).toHaveBeenCalled()
    expect(existingWindow.show).toHaveBeenCalled()
    expect(existingWindow.focus).toHaveBeenCalled()
  })
})
