import { BrowserWindow, dialog } from 'electron'

let confirmedQuit = false

export function resetQuitConfirmation(): void {
  confirmedQuit = false
}

export function attachQuitConfirmation(win: BrowserWindow): void {
  win.on('close', (event) => {
    if (confirmedQuit || !isLastWindow(win)) return
    const result = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['종료', '취소'],
      defaultId: 1,
      cancelId: 1,
      title: 'Mergit 종료',
      message: 'Mergit을 종료할까요?'
    })
    if (result === 0) {
      confirmedQuit = true
      return
    }
    event.preventDefault()
  })
}

function isLastWindow(current: BrowserWindow): boolean {
  const openWindows = BrowserWindow.getAllWindows().filter((win) => !win.isDestroyed())
  return openWindows.length <= 1 || openWindows.every((win) => win === current || win.isDestroyed())
}
