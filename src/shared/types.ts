export interface RepoInfoDto {
  path: string
  name: string
}

export interface CommitDto {
  hash: string
  parents: string[]
  author: string
  email: string
  date: string // ISO 8601
  subject: string
  body: string
  refs: string[] // 예: ["HEAD -> main", "origin/main"]
}

export type HistoryOrder = 'topo-order' | 'date-order'

export interface HistoryOptions {
  order: HistoryOrder
  all: boolean
}

export interface BranchDto {
  name: string // 로컬: "main", 원격: "origin/main"
  isRemote: boolean
  current: boolean
}

export interface FileStatusDto {
  path: string
  index: string // git status 의 index 컬럼 ('M', 'A', 'D', '?', ' ' 등)
  workingDir: string // working tree 컬럼
  isConflicted: boolean
}

// 충돌 해결이 필요할 수 있는 진행 중 작업 (.git 상태 파일 기준)
export type RepoOperation = 'merge' | 'cherry-pick' | 'revert'

export interface StatusDto {
  current: string | null
  files: FileStatusDto[]
  conflicted: string[]
  operation: RepoOperation | null
  ahead: number
  behind: number
  tracking: string | null
}

export interface StashDto {
  index: number
  oid: string
  message: string
}

export type StashCheckoutResult =
  | { checkedOut: true; stash: StashDto | null }
  | { checkedOut: false; stash: StashDto | null; error: string }

export interface FileChangeDto {
  kind: string // 'A' | 'M' | 'D' | 'R' | 'C' 등 name-status 종류
  score?: number
  path: string
  oldPath?: string
}

export type CommitFileDto = FileChangeDto

export type GitErrorCode =
  | 'GIT_ERROR'
  | 'CHECKOUT_BLOCKED'
  | 'CONFLICT'
  | 'AUTH'
  | 'NOT_A_REPO'
  | 'REMOTE'
  | 'NO_REPO'
  | 'UPDATE_FAILED'
  | 'UPDATE_UNSUPPORTED'

export interface GitErrorDto {
  code: GitErrorCode
  message: string
  detail: string
  paths?: string[]
}

export type ConflictSegment =
  | { type: 'context'; lines: string[] }
  | {
      type: 'conflict'
      ours: string[]
      theirs: string[]
      oursLabel: string
      theirsLabel: string
    }

export type ConflictChoice = 'unresolved' | 'ours' | 'theirs' | 'both'
