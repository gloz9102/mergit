import type {
  BranchDto,
  CommitDto,
  CommitFileDto,
  RepoInfoDto,
  StashDto,
  StatusDto
} from './types'

// IPC 응답 봉투 — main 핸들러와 preload unwrap이 공유
export type Envelope = { ok: true; data: unknown } | { ok: false; error: unknown }

export interface GitApi {
  selectRepo(): Promise<string | null>
  openRepo(path: string): Promise<RepoInfoDto>
  log(): Promise<CommitDto[]>
  status(): Promise<StatusDto>
  branches(): Promise<BranchDto[]>
  commitFiles(hash: string): Promise<CommitFileDto[]>
  diffCommitFile(hash: string, path: string): Promise<string>
  diffWorkingFile(path: string, staged: boolean): Promise<string>
  stage(paths: string[]): Promise<void>
  unstage(paths: string[]): Promise<void>
  discard(paths: string[]): Promise<void>
  commit(message: string): Promise<void>
  commitMerge(): Promise<void>
  createBranch(name: string, checkout: boolean): Promise<void>
  checkoutBranch(name: string): Promise<void>
  deleteBranch(name: string, force: boolean): Promise<void>
  renameBranch(oldName: string, newName: string): Promise<void>
  merge(branch: string): Promise<{ conflicts: boolean }>
  abortMerge(): Promise<void>
  push(): Promise<void>
  pull(): Promise<void>
  fetch(): Promise<void>
  stashSave(message: string): Promise<void>
  stashList(): Promise<StashDto[]>
  stashApply(index: number): Promise<void>
  stashDrop(index: number): Promise<void>
  readWorkingFile(path: string): Promise<string>
  saveResolved(path: string, content: string): Promise<void>
  onRepoChanged(cb: () => void): () => void
}

// preload가 IPC 채널을 자동 생성할 때 쓰는 메서드 목록 (onRepoChanged 제외)
export const GIT_API_METHODS = [
  'selectRepo',
  'openRepo',
  'log',
  'status',
  'branches',
  'commitFiles',
  'diffCommitFile',
  'diffWorkingFile',
  'stage',
  'unstage',
  'discard',
  'commit',
  'commitMerge',
  'createBranch',
  'checkoutBranch',
  'deleteBranch',
  'renameBranch',
  'merge',
  'abortMerge',
  'push',
  'pull',
  'fetch',
  'stashSave',
  'stashList',
  'stashApply',
  'stashDrop',
  'readWorkingFile',
  'saveResolved'
] as const

// GitApi(onRepoChanged 제외)와 GIT_API_METHODS의 불일치 시 컴파일 에러
type IpcMethods = Exclude<keyof GitApi, 'onRepoChanged'>
type AssertSubset<T extends U, U> = T
type _MethodsCoverApi = AssertSubset<IpcMethods, (typeof GIT_API_METHODS)[number]>
type _MethodsOnlyApi = AssertSubset<(typeof GIT_API_METHODS)[number], IpcMethods>
