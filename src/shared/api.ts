import type {
  BranchDto,
  CommitDto,
  CommitFileDto,
  HistoryOptions,
  RepoInfoDto,
  StashDto,
  StatusDto
} from './types'

// IPC 응답 봉투 — main 핸들러와 preload unwrap이 공유
export type Envelope = { ok: true; data: unknown } | { ok: false; error: unknown }

// 업데이트 체크 결과
export interface UpdateCheckDto {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  releaseUrl: string
}

export interface GitApi {
  selectRepo(): Promise<string | null>
  openRepo(path: string): Promise<RepoInfoDto>
  openRepoWindow(path: string): Promise<void>
  initialRepoPath(): Promise<string | null>
  log(skip: number, maxCount: number, options?: HistoryOptions): Promise<CommitDto[]>
  searchCommits(text: string, options?: HistoryOptions): Promise<string[]>
  status(): Promise<StatusDto>
  branches(): Promise<BranchDto[]>
  commitFiles(hash: string): Promise<CommitFileDto[]>
  diffCommitFile(hash: string, path: string): Promise<string>
  diffWorkingFile(path: string, staged: boolean): Promise<string>
  stage(paths: string[]): Promise<void>
  unstage(paths: string[]): Promise<void>
  discard(paths: string[]): Promise<void>
  commit(message: string, amend?: boolean): Promise<void>
  lastCommitMessage(): Promise<string>
  undoLastCommit(): Promise<void>
  createBranch(name: string, checkout: boolean): Promise<void>
  checkoutBranch(name: string): Promise<void>
  deleteBranch(name: string, force: boolean): Promise<void>
  renameBranch(oldName: string, newName: string): Promise<void>
  merge(branch: string): Promise<{ conflicts: boolean }>
  cherryPick(hash: string): Promise<{ conflicts: boolean }>
  revertCommit(hash: string): Promise<{ conflicts: boolean }>
  continueOperation(): Promise<void>
  abortOperation(): Promise<void>
  push(): Promise<void>
  pull(): Promise<void>
  fetch(): Promise<void>
  stashSave(message: string, paths?: string[]): Promise<void>
  stashList(): Promise<StashDto[]>
  stashApply(index: number): Promise<void>
  stashPop(index: number): Promise<void>
  stashDrop(index: number): Promise<void>
  readWorkingFile(path: string): Promise<string>
  saveResolved(path: string, content: string): Promise<void>
  onRepoChanged(cb: () => void): () => void
  // app:* 채널 — git 세션 불필요, preload에서 수동 노출(GIT_API_METHODS 미포함)
  getAppVersion(): Promise<string>
  checkForUpdates(): Promise<UpdateCheckDto>
  openExternal(url: string): Promise<void>
}

// preload가 IPC 채널을 자동 생성할 때 쓰는 메서드 목록 (onRepoChanged 제외)
export const GIT_API_METHODS = [
  'selectRepo',
  'openRepo',
  'openRepoWindow',
  'initialRepoPath',
  'log',
  'searchCommits',
  'status',
  'branches',
  'commitFiles',
  'diffCommitFile',
  'diffWorkingFile',
  'stage',
  'unstage',
  'discard',
  'commit',
  'lastCommitMessage',
  'undoLastCommit',
  'createBranch',
  'checkoutBranch',
  'deleteBranch',
  'renameBranch',
  'merge',
  'cherryPick',
  'revertCommit',
  'continueOperation',
  'abortOperation',
  'push',
  'pull',
  'fetch',
  'stashSave',
  'stashList',
  'stashApply',
  'stashPop',
  'stashDrop',
  'readWorkingFile',
  'saveResolved'
] as const

// GitApi(자동 매핑 제외 메서드 제외)와 GIT_API_METHODS의 불일치 시 컴파일 에러
type IpcMethods = Exclude<
  keyof GitApi,
  'onRepoChanged' | 'getAppVersion' | 'checkForUpdates' | 'openExternal'
>
type AssertSubset<T extends U, U> = T
type _MethodsCoverApi = AssertSubset<IpcMethods, (typeof GIT_API_METHODS)[number]>
type _MethodsOnlyApi = AssertSubset<(typeof GIT_API_METHODS)[number], IpcMethods>
