import type { BrowserWindow } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { attachQuitConfirmation, resetQuitConfirmation } from '../windowLifecycle'

const electronMock = vi.hoisted(() => ({
  getAllWindows: vi.fn(),
  showMessageBoxSync: vi.fn()
}))

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: electronMock.getAllWindows },
  dialog: { showMessageBoxSync: electronMock.showMessageBoxSync }
}))

interface FakeWindow {
  isDestroyed: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
}

function makeWindow(): FakeWindow {
  return {
    isDestroyed: vi.fn(() => false),
    on: vi.fn()
  }
}

function closeHandler(win: FakeWindow): (event: { preventDefault: () => void }) => void {
  const handler = win.on.mock.calls.find(([event]) => event === 'close')?.[1]
  if (!handler) throw new Error('close handler not registered')
  return handler as (event: { preventDefault: () => void }) => void
}

describe('window lifecycle', () => {
  beforeEach(() => {
    resetQuitConfirmation()
    electronMock.getAllWindows.mockReset()
    electronMock.showMessageBoxSync.mockReset()
  })

  it('마지막 창 종료는 확인 후 취소하면 close를 막는다', () => {
    const win = makeWindow()
    electronMock.getAllWindows.mockReturnValue([win])
    electronMock.showMessageBoxSync.mockReturnValue(1)
    const event = { preventDefault: vi.fn() }

    attachQuitConfirmation(win as unknown as BrowserWindow)
    closeHandler(win)(event)

    expect(electronMock.showMessageBoxSync).toHaveBeenCalled()
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('마지막 창 종료 확인 후 종료를 선택하면 이후 close를 다시 묻지 않는다', () => {
    const win = makeWindow()
    electronMock.getAllWindows.mockReturnValue([win])
    electronMock.showMessageBoxSync.mockReturnValue(0)
    const event = { preventDefault: vi.fn() }

    attachQuitConfirmation(win as unknown as BrowserWindow)
    closeHandler(win)(event)
    closeHandler(win)(event)

    expect(electronMock.showMessageBoxSync).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('여러 창 중 하나만 닫을 때는 프로그램 종료 확인을 띄우지 않는다', () => {
    const win = makeWindow()
    const other = makeWindow()
    electronMock.getAllWindows.mockReturnValue([win, other])
    const event = { preventDefault: vi.fn() }

    attachQuitConfirmation(win as unknown as BrowserWindow)
    closeHandler(win)(event)

    expect(electronMock.showMessageBoxSync).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })
})
