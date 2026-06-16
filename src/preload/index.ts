import { contextBridge, ipcRenderer } from 'electron'
import { GIT_API_METHODS, type Envelope } from '../shared/api'

function unwrap(res: Envelope): unknown {
  if (res.ok) return res.data
  throw res.error // GitErrorDto 그대로 reject
}

const api: Record<string, unknown> = {}
for (const method of GIT_API_METHODS) {
  api[method] = (...args: unknown[]) =>
    ipcRenderer.invoke(`git:${method}`, ...args).then((res: Envelope) => unwrap(res))
}
api['onRepoChanged'] = (cb: () => void) => {
  const listener = (): void => cb()
  ipcRenderer.on('repo-changed', listener)
  return () => ipcRenderer.removeListener('repo-changed', listener)
}

// app:* 채널 — GIT_API_METHODS 자동 매핑이 아니라 수동 노출
api['getAppVersion'] = () => ipcRenderer.invoke('app:getAppVersion').then((res: Envelope) => unwrap(res))
api['checkForUpdates'] = () =>
  ipcRenderer.invoke('app:checkForUpdates').then((res: Envelope) => unwrap(res))
api['openExternal'] = (url: string) =>
  ipcRenderer.invoke('app:openExternal', url).then((res: Envelope) => unwrap(res))

contextBridge.exposeInMainWorld('api', api)
