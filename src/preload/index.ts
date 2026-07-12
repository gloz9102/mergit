import { contextBridge, ipcRenderer } from 'electron'
import {
  GIT_API_METHODS,
  type Envelope,
  type RepoWatchErrorDto,
  type RefreshScope,
  type UpdateCheckOptions,
  type UpdateCheckSettings,
  type UpdateEventDto
} from '../shared/api'

function unwrap(res: Envelope): unknown {
  if (res.ok) return res.data
  throw res.error // GitErrorDto 그대로 reject
}

const api: Record<string, unknown> = {}
for (const method of GIT_API_METHODS) {
  api[method] = (...args: unknown[]) =>
    ipcRenderer.invoke(`git:${method}`, ...args).then((res: Envelope) => unwrap(res))
}
api['onRepoChanged'] = (cb: (scope?: RefreshScope) => void) => {
  const listener = (_event: Electron.IpcRendererEvent, scope?: RefreshScope): void => cb(scope)
  ipcRenderer.on('repo-changed', listener)
  return () => ipcRenderer.removeListener('repo-changed', listener)
}
api['onRepoWatchError'] = (cb: (error: RepoWatchErrorDto) => void) => {
  const listener = (_event: Electron.IpcRendererEvent, error: RepoWatchErrorDto): void => cb(error)
  ipcRenderer.on('repo-watch-error', listener)
  return () => ipcRenderer.removeListener('repo-watch-error', listener)
}
api['onAppCloseRequested'] = (cb: () => void) => {
  const listener = (): void => cb()
  ipcRenderer.on('app-close-requested', listener)
  return () => ipcRenderer.removeListener('app-close-requested', listener)
}
api['confirmWindowClose'] = () =>
  ipcRenderer.invoke('app:confirmWindowClose').then((res: Envelope) => unwrap(res))
api['focusOpenRepo'] = (path: string) =>
  ipcRenderer.invoke('git:focusOpenRepo', path).then((res: Envelope) => unwrap(res))

// app:* 채널 — GIT_API_METHODS 자동 매핑이 아니라 수동 노출
api['getAppVersion'] = () => ipcRenderer.invoke('app:getAppVersion').then((res: Envelope) => unwrap(res))
api['checkForUpdates'] = (options?: UpdateCheckOptions) =>
  ipcRenderer.invoke('app:checkForUpdates', options).then((res: Envelope) => unwrap(res))
api['configureUpdateChecks'] = (settings: UpdateCheckSettings) =>
  ipcRenderer.invoke('app:configureUpdateChecks', settings).then((res: Envelope) => unwrap(res))
api['getUpdateState'] = () =>
  ipcRenderer.invoke('app:getUpdateState').then((res: Envelope) => unwrap(res))
api['downloadUpdate'] = () =>
  ipcRenderer.invoke('app:downloadUpdate').then((res: Envelope) => unwrap(res))
api['installDownloadedUpdate'] = () =>
  ipcRenderer.invoke('app:installDownloadedUpdate').then((res: Envelope) => unwrap(res))
api['onUpdateEvent'] = (cb: (event: UpdateEventDto) => void) => {
  const listener = (_event: Electron.IpcRendererEvent, updateEvent: UpdateEventDto): void => cb(updateEvent)
  ipcRenderer.on('update-event', listener)
  return () => ipcRenderer.removeListener('update-event', listener)
}
api['openExternal'] = (url: string) =>
  ipcRenderer.invoke('app:openExternal', url).then((res: Envelope) => unwrap(res))

contextBridge.exposeInMainWorld('api', api)
