import { contextBridge, ipcRenderer } from 'electron'
import { GIT_API_METHODS } from '../shared/api'

type Envelope = { ok: true; data: unknown } | { ok: false; error: unknown }

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

contextBridge.exposeInMainWorld('api', api)
