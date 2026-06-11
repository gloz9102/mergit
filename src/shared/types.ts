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
  refs: string[] // 예: ["HEAD -> main", "origin/main"]
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

export interface StatusDto {
  current: string | null
  files: FileStatusDto[]
  conflicted: string[]
  merging: boolean
  ahead: number
  behind: number
  tracking: string | null
}

export interface StashDto {
  index: number
  message: string
}

export interface CommitFileDto {
  path: string
  status: string // 'A' | 'M' | 'D' 등 name-status 첫 글자
}

export type GitErrorCode = 'GIT_ERROR' | 'CONFLICT' | 'AUTH' | 'NOT_A_REPO' | 'REMOTE' | 'NO_REPO'

export interface GitErrorDto {
  code: GitErrorCode
  message: string
  detail: string
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

export interface ConflictChoice {
  ours: boolean
  theirs: boolean
}
