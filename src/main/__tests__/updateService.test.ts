import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppUpdater, UpdateInfo } from 'electron-updater'
import {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_EVENT_CHANNEL,
  UpdateService,
  UpdateServiceError
} from '../updateService'

vi.mock('electron', () => ({
  app: { getVersion: vi.fn(() => '0.4.0'), isPackaged: true },
  BrowserWindow: { getAllWindows: vi.fn(() => []) }
}))

vi.mock('electron-updater', () => ({
  default: {
    autoUpdater: {
      autoDownload: false,
      autoInstallOnAppQuit: false,
      on: vi.fn(),
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      quitAndInstall: vi.fn()
    }
  }
}))

const updateInfo: UpdateInfo = {
  version: '0.4.1',
  files: [],
  path: 'Mergit-Setup-0.4.1.exe',
  sha512: 'sha512',
  releaseDate: '2026-06-17T00:00:00.000Z'
}

class FakeUpdater extends EventEmitter {
  autoDownload = false
  autoInstallOnAppQuit = false
  checkForUpdates = vi.fn()
  downloadUpdate = vi.fn()
  quitAndInstall = vi.fn()
}

function makeService() {
  const updater = new FakeUpdater()
  updater.checkForUpdates.mockResolvedValue({
    isUpdateAvailable: true,
    updateInfo,
    versionInfo: updateInfo
  })
  updater.downloadUpdate.mockResolvedValue(['/tmp/update.exe'])
  const send = vi.fn()
  const service = new UpdateService({
    updater: updater as unknown as AppUpdater,
    getVersion: () => '0.4.0',
    isPackaged: () => true,
    platform: 'win32',
    getWindows: () =>
      [
        {
          isDestroyed: () => false,
          webContents: { send }
        }
      ] as never
  })
  return { service, updater, send }
}

describe('UpdateService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('초기화 시 종료 시 자동 설치를 켠다', () => {
    const { updater } = makeService()

    expect(updater.autoInstallOnAppQuit).toBe(true)
  })

  it('checkForUpdates: 자동 다운로드 옵션을 updater에 반영한다', async () => {
    const { service, updater } = makeService()

    await service.checkForUpdates({ autoDownload: true })

    expect(updater.autoDownload).toBe(true)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('checkForUpdates: 수동 다운로드 옵션이면 자동 다운로드를 끈다', async () => {
    const { service, updater } = makeService()

    await service.checkForUpdates({ autoDownload: false })

    expect(updater.autoDownload).toBe(false)
  })

  it('downloadUpdate: 확인된 업데이트를 수동 다운로드한다', async () => {
    const { service, updater } = makeService()

    await service.checkForUpdates({ autoDownload: false })
    await service.downloadUpdate()

    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1)
  })

  it('macOS 빌드는 자동 다운로드를 지원하지 않고 릴리스 페이지 확인만 제공한다', async () => {
    const updater = new FakeUpdater()
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ tag_name: 'v0.4.1', html_url: 'https://github.com/gloz9102/mergit/releases/tag/v0.4.1' }))
    )
    const service = new UpdateService({
      updater: updater as unknown as AppUpdater,
      getVersion: () => '0.4.0',
      isPackaged: () => true,
      platform: 'darwin',
      fetchImpl,
      getWindows: () => []
    })

    const result = await service.checkForUpdates({ autoDownload: true })

    expect(result).toMatchObject({
      hasUpdate: true,
      canDownload: false,
      status: 'available'
    })
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(() => service.downloadUpdate()).toThrow(UpdateServiceError)
  })

  it('installDownloadedUpdate: 다운로드 완료 전에는 설치하지 않는다', () => {
    const { service, updater } = makeService()

    expect(() => service.installDownloadedUpdate()).toThrow(UpdateServiceError)
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('installDownloadedUpdate: 다운로드 완료 후 재시작 설치를 호출한다', () => {
    const { service, updater } = makeService()

    updater.emit('update-downloaded', { ...updateInfo, downloadedFile: '/tmp/update.exe' })
    service.installDownloadedUpdate()

    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  it('나중에 설치 경로는 다운로드 완료 이벤트만으로 quitAndInstall을 호출하지 않는다', () => {
    const { updater } = makeService()

    updater.emit('update-downloaded', { ...updateInfo, downloadedFile: '/tmp/update.exe' })

    expect(updater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('updater 이벤트를 renderer DTO로 브로드캐스트한다', () => {
    const { updater, send } = makeService()

    updater.emit('download-progress', {
      percent: 50,
      transferred: 10,
      total: 20,
      bytesPerSecond: 5,
      delta: 10
    })

    expect(send).toHaveBeenCalledWith(
      UPDATE_EVENT_CHANNEL,
      expect.objectContaining({
        status: 'downloading',
        progress: { percent: 50, transferred: 10, total: 20, bytesPerSecond: 5 }
      })
    )
  })

  it('configureUpdateChecks: main scheduler가 자동 확인을 단일 interval로 소유한다', async () => {
    vi.useFakeTimers()
    const { service, updater } = makeService()

    service.configureUpdateChecks({ autoCheck: true, autoDownload: true })
    await Promise.resolve()
    service.configureUpdateChecks({ autoCheck: true, autoDownload: true })
    await Promise.resolve()

    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS)
    await Promise.resolve()

    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2)
    expect(updater.autoDownload).toBe(true)
  })

  it('getState: late subscriber가 현재 update 상태를 조회한다', () => {
    const { service, updater } = makeService()

    updater.emit('update-downloaded', { ...updateInfo, downloadedFile: '/tmp/update.exe' })

    expect(service.getState()).toMatchObject({
      status: 'downloaded',
      latestVersion: '0.4.1',
      canDownload: true
    })
  })

  it('checkForUpdates: 이미 다운로드된 같은 버전을 불필요하게 설치 불가 상태로 되돌리지 않는다', async () => {
    const { service, updater } = makeService()
    updater.emit('update-downloaded', { ...updateInfo, downloadedFile: '/tmp/update.exe' })

    await service.checkForUpdates({ autoDownload: false })

    expect(() => service.installDownloadedUpdate()).not.toThrow()
  })
})
