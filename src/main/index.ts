import { app, BrowserWindow, Menu } from 'electron'
import { join } from 'node:path'
import icon from '../../resources/icon.png?asset'
import { registerIpc } from './ipc'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    // 창/작업표시줄 아이콘 (Windows·Linux, dev 포함 — macOS는 무시)
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  // Windows/Linux는 창 안에 메뉴바(File/Edit/View...)가 박히므로 제거한다.
  // macOS는 앱 메뉴를 없애면 Cmd+C/V 등 Edit 단축키가 깨질 수 있어 유지.
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null)
  registerIpc(createWindow)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
