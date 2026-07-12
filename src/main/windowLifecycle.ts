import { BrowserWindow } from 'electron'

const confirmedWindowIds = new Set<number>()
let updateQuit = false

export function resetQuitConfirmation(): void {
  confirmedWindowIds.clear()
  updateQuit = false
}

export function allowUpdateQuit(): void {
  updateQuit = true
}

export function confirmWindowClose(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  confirmedWindowIds.add(win.webContents.id)
  win.close()
}

export function attachQuitConfirmation(win: BrowserWindow): void {
  const windowId = win.webContents.id
  let rendererReady = false
  win.webContents.once('did-finish-load', () => {
    rendererReady = true
  })
  win.on('close', (event) => {
    if (updateQuit || confirmedWindowIds.delete(windowId) || !isLastWindow(win)) return
    // renderer가 준비되기 전에는 아직 열린 저장소나 사용자 작업이 없다.
    if (!rendererReady || win.webContents.isDestroyed()) return
    event.preventDefault()
    win.webContents.send('app-close-requested')
  })
  win.once('closed', () => confirmedWindowIds.delete(windowId))
}

function isLastWindow(current: BrowserWindow): boolean {
  const openWindows = BrowserWindow.getAllWindows().filter((win) => !win.isDestroyed())
  return openWindows.length <= 1 || openWindows.every((win) => win === current || win.isDestroyed())
}
