import type { BrowserWindow } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  allowUpdateQuit,
  attachQuitConfirmation,
  confirmWindowClose,
  resetQuitConfirmation
} from '../windowLifecycle'

const electronMock = vi.hoisted(() => ({ getAllWindows: vi.fn() }))

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: electronMock.getAllWindows } }))

interface FakeWindow {
  isDestroyed: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  webContents: {
    id: number
    once: ReturnType<typeof vi.fn>
    isDestroyed: ReturnType<typeof vi.fn>
    send: ReturnType<typeof vi.fn>
  }
}

let nextId = 0

function makeWindow(): FakeWindow {
  return {
    isDestroyed: vi.fn(() => false),
    on: vi.fn(),
    once: vi.fn(),
    close: vi.fn(),
    webContents: {
      id: ++nextId,
      once: vi.fn(),
      isDestroyed: vi.fn(() => false),
      send: vi.fn()
    }
  }
}

function closeHandler(win: FakeWindow): (event: { preventDefault: () => void }) => void {
  const handler = win.on.mock.calls.find(([event]) => event === 'close')?.[1]
  if (!handler) throw new Error('close handler not registered')
  return handler as (event: { preventDefault: () => void }) => void
}

function markRendererReady(win: FakeWindow): void {
  const handler = win.webContents.once.mock.calls.find(([event]) => event === 'did-finish-load')?.[1]
  if (!handler) throw new Error('did-finish-load handler not registered')
  handler()
}

describe('window lifecycle', () => {
  beforeEach(() => {
    resetQuitConfirmation()
    electronMock.getAllWindows.mockReset()
  })

  it('마지막 창 close는 renderer 확인을 요청하고 우선 막는다', () => {
    const win = makeWindow()
    electronMock.getAllWindows.mockReturnValue([win])
    const event = { preventDefault: vi.fn() }
    attachQuitConfirmation(win as unknown as BrowserWindow)
    markRendererReady(win)

    closeHandler(win)(event)

    expect(event.preventDefault).toHaveBeenCalled()
    expect(win.webContents.send).toHaveBeenCalledWith('app-close-requested')
  })

  it('renderer 확인 후에는 해당 창을 한 번 닫는다', () => {
    const win = makeWindow()
    electronMock.getAllWindows.mockReturnValue([win])
    const event = { preventDefault: vi.fn() }
    attachQuitConfirmation(win as unknown as BrowserWindow)
    markRendererReady(win)

    confirmWindowClose(win as unknown as BrowserWindow)
    closeHandler(win)(event)

    expect(win.close).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(win.webContents.send).not.toHaveBeenCalled()
  })

  it('여러 창 중 하나만 닫을 때는 확인을 요청하지 않는다', () => {
    const win = makeWindow()
    const other = makeWindow()
    electronMock.getAllWindows.mockReturnValue([win, other])
    const event = { preventDefault: vi.fn() }
    attachQuitConfirmation(win as unknown as BrowserWindow)
    markRendererReady(win)

    closeHandler(win)(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(win.webContents.send).not.toHaveBeenCalled()
  })

  it('renderer 준비 전과 update quit은 확인을 우회한다', () => {
    const loadingWin = makeWindow()
    electronMock.getAllWindows.mockReturnValue([loadingWin])
    attachQuitConfirmation(loadingWin as unknown as BrowserWindow)
    const loadingEvent = { preventDefault: vi.fn() }
    closeHandler(loadingWin)(loadingEvent)
    expect(loadingEvent.preventDefault).not.toHaveBeenCalled()

    const updateWin = makeWindow()
    electronMock.getAllWindows.mockReturnValue([updateWin])
    attachQuitConfirmation(updateWin as unknown as BrowserWindow)
    markRendererReady(updateWin)
    allowUpdateQuit()
    const updateEvent = { preventDefault: vi.fn() }
    closeHandler(updateWin)(updateEvent)
    expect(updateEvent.preventDefault).not.toHaveBeenCalled()
  })
})
