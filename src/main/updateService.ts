import { app, BrowserWindow } from 'electron'
import electronUpdater, {
  type AppUpdater,
  type ProgressInfo,
  type UpdateCheckResult,
  type UpdateDownloadedEvent,
  type UpdateInfo
} from 'electron-updater'
import type {
  UpdateCheckDto,
  UpdateCheckOptions,
  UpdateEventDto,
  UpdateProgressDto,
  UpdateStatus
} from '../shared/api'
import type { GitErrorCode } from '../shared/types'
import { isNewer } from '../shared/version'

const { autoUpdater } = electronUpdater

export const UPDATE_EVENT_CHANNEL = 'update-event'
const GITHUB_OWNER = 'gloz9102'
const GITHUB_REPO = 'mergit'
const RELEASES_LATEST_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
const RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`
const REQUEST_TIMEOUT_MS = 8000

export class UpdateServiceError extends Error {
  constructor(
    message: string,
    readonly code: Extract<GitErrorCode, 'UPDATE_FAILED' | 'UPDATE_UNSUPPORTED'> = 'UPDATE_FAILED'
  ) {
    super(message)
    this.name = 'UpdateServiceError'
  }
}

interface UpdateServiceOptions {
  updater?: AppUpdater
  getWindows?: () => BrowserWindow[]
  getVersion?: () => string
  isPackaged?: () => boolean
  fetchImpl?: typeof fetch
  platform?: NodeJS.Platform
}

export class UpdateService {
  private readonly updater: AppUpdater
  private readonly getWindows: () => BrowserWindow[]
  private readonly getVersion: () => string
  private readonly isPackaged: () => boolean
  private readonly fetchImpl: typeof fetch
  private readonly platform: NodeJS.Platform
  private checkPromise: Promise<UpdateCheckDto> | null = null
  private downloadPromise: Promise<void> | null = null
  private latestInfo: UpdateInfo | null = null
  private downloaded = false

  constructor(options: UpdateServiceOptions = {}) {
    this.updater = options.updater ?? autoUpdater
    this.getWindows = options.getWindows ?? (() => BrowserWindow.getAllWindows())
    this.getVersion = options.getVersion ?? (() => app.getVersion())
    this.isPackaged = options.isPackaged ?? (() => app.isPackaged)
    this.fetchImpl = options.fetchImpl ?? fetch
    this.platform = options.platform ?? process.platform
    this.updater.autoInstallOnAppQuit = true
    this.attachUpdaterEvents()
  }

  checkForUpdates(options: UpdateCheckOptions = { autoDownload: false }): Promise<UpdateCheckDto> {
    if (this.checkPromise) return this.checkPromise
    this.checkPromise = this.doCheckForUpdates(options).finally(() => {
      this.checkPromise = null
    })
    return this.checkPromise
  }

  downloadUpdate(): Promise<void> {
    if (!this.canUseUpdater()) {
      throw new UpdateServiceError('Automatic update is unavailable in this build.', 'UPDATE_UNSUPPORTED')
    }
    if (this.downloaded) return Promise.resolve()
    if (this.downloadPromise) return this.downloadPromise
    if (!this.latestInfo) {
      throw new UpdateServiceError('No update is ready to download.')
    }
    this.broadcast({
      status: 'downloading',
      currentVersion: this.getVersion(),
      latestVersion: this.latestInfo.version,
      hasUpdate: true,
      releaseUrl: releaseUrlForVersion(this.latestInfo.version),
      canDownload: true
    })
    this.downloadPromise = this.updater
      .downloadUpdate()
      .then(() => undefined)
      .finally(() => {
        this.downloadPromise = null
      })
    return this.downloadPromise
  }

  installDownloadedUpdate(): void {
    if (!this.canUseUpdater()) {
      throw new UpdateServiceError('Automatic update is unavailable in this build.', 'UPDATE_UNSUPPORTED')
    }
    if (!this.downloaded) {
      throw new UpdateServiceError('No downloaded update is ready to install.')
    }
    this.updater.quitAndInstall(false, true)
  }

  private async doCheckForUpdates(options: UpdateCheckOptions): Promise<UpdateCheckDto> {
    const autoDownload = !!options.autoDownload
    this.downloaded = false
    this.broadcast({ status: 'checking', currentVersion: this.getVersion() })
    if (!this.canUseUpdater()) {
      return this.checkGitHubLatest('unsupported', 'Automatic update is unavailable in this build.')
    }
    try {
      this.updater.autoInstallOnAppQuit = true
      this.updater.autoDownload = autoDownload
      const result = await this.updater.checkForUpdates()
      if (!result) {
        return this.unsupportedDto('Updater is disabled for this build.')
      }
      this.trackAutoDownload(result)
      this.latestInfo = result.isUpdateAvailable ? result.updateInfo : null
      return this.toCheckDto(
        result.updateInfo,
        result.isUpdateAvailable,
        result.isUpdateAvailable ? 'available' : 'not-available',
        result.isUpdateAvailable
      )
    } catch (err) {
      this.broadcastError(err)
      throw err
    }
  }

  private trackAutoDownload(result: UpdateCheckResult): void {
    if (!result.downloadPromise) return
    this.downloadPromise = result.downloadPromise
      .then(() => undefined)
      .finally(() => {
        this.downloadPromise = null
      })
  }

  private attachUpdaterEvents(): void {
    this.updater.on('checking-for-update', () => {
      this.broadcast({ status: 'checking', currentVersion: this.getVersion() })
    })
    this.updater.on('update-available', (info) => {
      this.latestInfo = info
      this.downloaded = false
      this.broadcast(this.toEvent(info, 'available', true, true))
    })
    this.updater.on('update-not-available', (info) => {
      this.latestInfo = null
      this.broadcast(this.toEvent(info, 'not-available', false, false))
    })
    this.updater.on('download-progress', (progress) => {
      const latestVersion = this.latestInfo?.version
      this.broadcast({
        status: 'downloading',
        currentVersion: this.getVersion(),
        latestVersion,
        hasUpdate: true,
        releaseUrl: latestVersion ? releaseUrlForVersion(latestVersion) : RELEASES_URL,
        canDownload: true,
        progress: toProgressDto(progress)
      })
    })
    this.updater.on('update-downloaded', (event) => {
      this.latestInfo = event
      this.downloaded = true
      this.broadcast(this.toEvent(event, 'downloaded', true, true))
    })
    this.updater.on('error', (error, message) => {
      this.broadcastError(error, message)
    })
  }

  private async checkGitHubLatest(status: UpdateStatus, message: string): Promise<UpdateCheckDto> {
    try {
      const res = await this.fetchImpl(RELEASES_LATEST_URL, {
        headers: { 'User-Agent': 'Mergit', Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
      if (!res.ok) throw new Error(`GitHub API ${res.status}`)
      const json = (await res.json()) as { tag_name?: string; html_url?: string }
      const latestTag = json.tag_name ?? ''
      const currentVersion = this.getVersion()
      const hasUpdate = isNewer(latestTag, currentVersion)
      const dto: UpdateCheckDto = {
        currentVersion,
        latestVersion: latestTag.replace(/^v/i, ''),
        hasUpdate,
        releaseUrl: json.html_url ?? RELEASES_URL,
        canDownload: false,
        status: hasUpdate ? 'available' : status,
        message
      }
      this.broadcast({
        status: dto.status,
        currentVersion: dto.currentVersion,
        latestVersion: dto.latestVersion,
        hasUpdate: dto.hasUpdate,
        releaseUrl: dto.releaseUrl,
        canDownload: dto.canDownload,
        message: dto.message
      })
      return dto
    } catch (err) {
      this.broadcastError(err)
      throw err
    }
  }

  private unsupportedDto(message: string): UpdateCheckDto {
    const dto: UpdateCheckDto = {
      currentVersion: this.getVersion(),
      latestVersion: this.getVersion(),
      hasUpdate: false,
      releaseUrl: RELEASES_URL,
      canDownload: false,
      status: 'unsupported',
      message
    }
    this.broadcast({
      status: dto.status,
      currentVersion: dto.currentVersion,
      latestVersion: dto.latestVersion,
      hasUpdate: dto.hasUpdate,
      releaseUrl: dto.releaseUrl,
      canDownload: dto.canDownload,
      message: dto.message
    })
    return dto
  }

  private toCheckDto(
    info: UpdateInfo,
    hasUpdate: boolean,
    status: UpdateStatus,
    canDownload: boolean
  ): UpdateCheckDto {
    return {
      currentVersion: this.getVersion(),
      latestVersion: info.version,
      hasUpdate,
      releaseUrl: hasUpdate ? releaseUrlForVersion(info.version) : RELEASES_URL,
      canDownload,
      status
    }
  }

  private toEvent(
    info: UpdateInfo | UpdateDownloadedEvent,
    status: UpdateStatus,
    hasUpdate: boolean,
    canDownload: boolean
  ): UpdateEventDto {
    return {
      status,
      currentVersion: this.getVersion(),
      latestVersion: info.version,
      hasUpdate,
      releaseUrl: hasUpdate ? releaseUrlForVersion(info.version) : RELEASES_URL,
      canDownload
    }
  }

  private canUseUpdater(): boolean {
    return this.isPackaged() && (this.platform === 'win32' || this.platform === 'darwin')
  }

  private broadcastError(err: unknown, message?: string): void {
    const detail = err instanceof Error ? err.message : String(err)
    this.broadcast({
      status: 'error',
      currentVersion: this.getVersion(),
      message: message ?? detail.split('\n')[0],
      detail
    })
  }

  private broadcast(event: UpdateEventDto): void {
    for (const win of this.getWindows()) {
      if (win.isDestroyed()) continue
      win.webContents.send(UPDATE_EVENT_CHANNEL, event)
    }
  }
}

let updateService: UpdateService | null = null

export function getUpdateService(): UpdateService {
  updateService ??= new UpdateService()
  return updateService
}

function releaseUrlForVersion(version: string): string {
  const tag = version.startsWith('v') ? version : `v${version}`
  return `${RELEASES_URL}/tag/${tag}`
}

function toProgressDto(progress: ProgressInfo): UpdateProgressDto {
  return {
    percent: progress.percent,
    transferred: progress.transferred,
    total: progress.total,
    bytesPerSecond: progress.bytesPerSecond
  }
}
