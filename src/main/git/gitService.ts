import { existsSync } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { simpleGit, type SimpleGit } from 'simple-git'
import { LOG_FORMAT, parseLog } from '../../shared/logParser'
import type {
  BranchDto,
  CommitDto,
  CommitFileDto,
  HistoryOptions,
  RepoInfoDto,
  StashDto,
  StatusDto
} from '../../shared/types'

export const MAX_UNTRACKED_DIFF_BYTES = 512 * 1024

const DEFAULT_HISTORY_OPTIONS: HistoryOptions = {
  order: 'date-order',
  all: true
}

export class GitService {
  private git: SimpleGit

  constructor(readonly repoPath: string) {
    this.git = simpleGit(repoPath)
  }

  async info(): Promise<RepoInfoDto> {
    const isRepo = await this.git.checkIsRepo()
    if (!isRepo) throw new Error(`not a git repository: ${this.repoPath}`)
    return { path: this.repoPath, name: basename(this.repoPath) }
  }

  // .git 디렉토리 안의 상태 파일 존재 여부 (MERGE_HEAD 등)
  private hasGitFile(name: string): boolean {
    return existsSync(join(this.repoPath, '.git', name))
  }

  async log(skip: number, maxCount: number, options: HistoryOptions = DEFAULT_HISTORY_OPTIONS): Promise<CommitDto[]> {
    const scopeArgs = options.all ? ['--all'] : ['HEAD']
    const head = await this.git.raw(['rev-list', '-n', '1', ...scopeArgs]).catch(() => '')
    if (!head.trim()) return [] // 커밋 0개인 저장소
    const raw = await this.git.raw([
      'log',
      ...scopeArgs,
      `--${options.order}`,
      `--skip=${skip}`,
      `--max-count=${maxCount}`,
      `--format=${LOG_FORMAT}`
    ])
    return parseLog(raw)
  }

  // 메시지 또는 작성자가 text와 부분 일치(대소문자 무시)하는 커밋 해시 목록.
  // --grep과 --author를 한 호출에 넣으면 AND가 되므로 따로 실행해 합집합(OR)을 만든다.
  // -F: 사용자가 입력한 '.', '[' 등을 정규식이 아닌 리터럴로 취급
  async searchCommits(text: string, options: HistoryOptions = DEFAULT_HISTORY_OPTIONS): Promise<string[]> {
    if (!text) return []
    const scopeArgs = options.all ? ['--all'] : ['HEAD']
    const head = await this.git.raw(['rev-list', '-n', '1', ...scopeArgs]).catch(() => '')
    if (!head.trim()) return []
    const [byMessage, byAuthor] = await Promise.all([
      this.git.raw(['log', ...scopeArgs, '-i', '-F', `--grep=${text}`, '--format=%H']),
      this.git.raw(['log', ...scopeArgs, '-i', '-F', `--author=${text}`, '--format=%H'])
    ])
    const seen = new Set<string>()
    for (const line of `${byMessage}\n${byAuthor}`.split('\n')) {
      const hash = line.trim()
      if (hash) seen.add(hash)
    }
    return [...seen]
  }

  async status(): Promise<StatusDto> {
    const s = await this.git.status()
    return {
      current: s.current ?? null,
      files: s.files.map((f) => ({
        path: f.path,
        index: f.index,
        workingDir: f.working_dir,
        isConflicted: s.conflicted.includes(f.path)
      })),
      conflicted: s.conflicted,
      // cherry-pick/revert 충돌 중에는 MERGE_HEAD가 없으므로 우선순위 판정이 안전하다
      operation: this.hasGitFile('CHERRY_PICK_HEAD')
        ? 'cherry-pick'
        : this.hasGitFile('REVERT_HEAD')
          ? 'revert'
          : this.hasGitFile('MERGE_HEAD')
            ? 'merge'
            : null,
      ahead: s.ahead,
      behind: s.behind,
      tracking: s.tracking ?? null
    }
  }

  async branches(): Promise<BranchDto[]> {
    const all = await this.git.branch(['-a'])
    const result: BranchDto[] = []
    for (const name of all.all) {
      if (name.startsWith('remotes/')) {
        const remoteName = name.slice('remotes/'.length)
        if (!remoteName.endsWith('/HEAD')) {
          result.push({ name: remoteName, isRemote: true, current: false })
        }
      } else {
        result.push({ name, isRemote: false, current: name === all.current })
      }
    }
    return result
  }

  async commitFiles(hash: string): Promise<CommitFileDto[]> {
    // -m --first-parent: 머지 커밋도 첫 부모 기준 변경 파일을 보여준다
    const raw = await this.git.raw([
      'diff-tree', '--no-commit-id', '--name-status', '-r', '--root', '-m', '--first-parent', hash
    ])
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [status, ...rest] = line.split('\t')
        return { path: rest.join('\t'), status: status[0] }
      })
  }

  async diffCommitFile(hash: string, path: string): Promise<string> {
    return this.git.raw(['show', '--format=', hash, '--', path])
  }

  async diffWorkingFile(path: string, staged: boolean): Promise<string> {
    const args = staged ? ['diff', '--cached', '--', path] : ['diff', '--', path]
    const diff = await this.git.raw(args)
    if (diff.trim()) return diff
    // untracked 파일은 diff가 비므로 전체 내용을 추가 라인으로 표시
    const filePath = join(this.repoPath, path)
    const info = await stat(filePath).catch(() => null)
    if (info && info.size > MAX_UNTRACKED_DIFF_BYTES) {
      return [
        `diff --git a/${path} b/${path}`,
        '--- /dev/null',
        `+++ b/${path}`,
        '@@',
        `+Diff omitted: untracked file is too large (${info.size} bytes).`
      ].join('\n')
    }
    const content = await readFile(filePath, 'utf-8').catch(() => '')
    return content
      .split('\n')
      .map((l) => `+${l}`)
      .join('\n')
  }

  async stage(paths: string[]): Promise<void> {
    if (paths.length === 0) return
    await this.git.add(paths)
  }

  async unstage(paths: string[]): Promise<void> {
    if (paths.length === 0) return
    await this.git.raw(['restore', '--staged', '--', ...paths])
  }

  async discard(paths: string[]): Promise<void> {
    if (paths.length === 0) return
    const s = await this.git.status()
    const untracked = paths.filter((p) => s.not_added.includes(p))
    const tracked = paths.filter((p) => !s.not_added.includes(p))
    if (tracked.length) await this.git.raw(['restore', '--source=HEAD', '--staged', '--worktree', '--', ...tracked])
    if (untracked.length) await this.git.raw(['clean', '-f', '--', ...untracked])
  }

  async commit(message: string, amend = false): Promise<void> {
    if (amend) await this.git.raw(['commit', '--amend', '-m', message])
    else await this.git.commit(message)
  }

  // amend 입력창 prefill용 — subject만 쓰면 본문이 유실되므로 %B(전체 메시지)를 쓴다
  async lastCommitMessage(): Promise<string> {
    const head = await this.git.raw(['rev-parse', '--verify', 'HEAD']).catch(() => '')
    if (!head.trim()) return ''
    const msg = await this.git.raw(['log', '-1', '--format=%B'])
    return msg.trimEnd()
  }

  // 변경 내용을 스테이지에 남긴 채 HEAD만 한 단계 되돌린다
  async undoLastCommit(): Promise<void> {
    // 부모 없는 최초 커밋은 되돌릴 대상이 없으므로 거부
    await this.git.raw(['rev-parse', '--verify', 'HEAD~1']).catch(() => {
      throw new Error('cannot undo the initial commit (no parent)')
    })
    await this.git.raw(['reset', '--soft', 'HEAD~1'])
  }

  async createBranch(name: string, checkout: boolean): Promise<void> {
    if (checkout) await this.git.checkoutLocalBranch(name)
    else await this.git.branch([name])
  }

  // 원격 브랜치는 UI에서 "origin/" 프리픽스를 뗀 이름으로 호출한다
  // (git checkout의 DWIM이 추적 브랜치를 자동 생성)
  async checkoutBranch(name: string): Promise<void> {
    await this.git.checkout(name)
  }

  async stashAndCheckoutBranch(name: string, paths?: string[]): Promise<void> {
    const current = (await this.git.status()).current || 'unknown'
    const message = `Mergit checkout: ${current} -> ${name}`
    await this.stashSave(message, paths && paths.length > 0 ? paths : undefined)
    await this.checkoutBranch(name)
  }

  async deleteBranch(name: string, force: boolean): Promise<void> {
    await this.git.deleteLocalBranch(name, force)
  }

  async renameBranch(oldName: string, newName: string): Promise<void> {
    await this.git.branch(['-m', oldName, newName])
  }

  // 충돌이 생길 수 있는 명령의 공통 실행기.
  // 충돌(상태 파일 생성)이면 conflicts로 보고, 그 외 진짜 실패는 재throw.
  // 예외 없이 끝났어도 한국어 로케일에서는 충돌 시 throw가 없을 수 있어 후검사한다.
  private async runConflictable(
    args: string[],
    stateFile: string
  ): Promise<{ conflicts: boolean }> {
    const conflicted = async (): Promise<boolean> => {
      if (!this.hasGitFile(stateFile)) return false
      const s = await this.git.status()
      return s.conflicted.length > 0
    }
    try {
      await this.git.raw(args)
    } catch (err) {
      if (await conflicted()) return { conflicts: true }
      throw err
    }
    if (await conflicted()) return { conflicts: true }
    return { conflicts: false }
  }

  async merge(branch: string): Promise<{ conflicts: boolean }> {
    return this.runConflictable(['merge', branch], 'MERGE_HEAD')
  }

  async cherryPick(hash: string): Promise<{ conflicts: boolean }> {
    return this.runConflictable(['cherry-pick', hash], 'CHERRY_PICK_HEAD')
  }

  async revertCommit(hash: string): Promise<{ conflicts: boolean }> {
    return this.runConflictable(['revert', '--no-edit', hash], 'REVERT_HEAD')
  }

  // merge/cherry-pick/revert 공통 — 준비된 메시지(.git/MERGE_MSG)로 커밋해 작업을 종결한다.
  // 단일 커밋 작업이므로 git commit이 상태 파일(CHERRY_PICK_HEAD 등)까지 정리한다.
  async continueOperation(): Promise<void> {
    await this.git.raw(['commit', '--no-edit'])
  }

  async abortOperation(): Promise<void> {
    if (this.hasGitFile('CHERRY_PICK_HEAD')) await this.git.raw(['cherry-pick', '--abort'])
    else if (this.hasGitFile('REVERT_HEAD')) await this.git.raw(['revert', '--abort'])
    else await this.git.merge(['--abort'])
  }

  async push(): Promise<void> {
    await this.git.push(['-u', 'origin', 'HEAD'])
  }

  async pull(): Promise<void> {
    await this.git.pull()
  }

  async fetch(): Promise<void> {
    await this.git.fetch(['--all', '--prune'])
  }

  // paths를 주면 해당 파일만 스태시한다. -u: untracked 파일 포함
  async stashSave(message: string, paths?: string[]): Promise<void> {
    const args = ['push', '-u', '-m', message || 'WIP']
    if (paths && paths.length > 0) args.push('--', ...paths)
    await this.git.stash(args)
  }

  async stashList(): Promise<StashDto[]> {
    const raw = await this.git.raw(['stash', 'list']).catch(() => '')
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line, i) => ({ index: i, message: line.replace(/^stash@\{\d+\}:\s*/, '') }))
  }

  async stashFiles(index: number): Promise<CommitFileDto[]> {
    const raw = await this.git
      .raw(['stash', 'show', '--include-untracked', '--name-status', `stash@{${index}}`])
      .catch(() => '')
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [status, ...rest] = line.split('\t')
        return { path: rest.join('\t'), status: status[0] }
      })
  }

  // stash apply/pop은 충돌 시 git이 종료 코드 1을 반환하지만 메시지가 stdout으로
  // 나가 simple-git이 성공으로 처리한다 → 직접 충돌을 검사해 에러로 승격한다
  private async stashRun(args: string[]): Promise<void> {
    await this.git.stash(args)
    const s = await this.git.status()
    if (s.conflicted.length > 0) throw new Error(`stash resulted in conflicts: ${args[0]}`)
  }

  async stashApply(index: number): Promise<void> {
    await this.stashRun(['apply', `stash@{${index}}`])
  }

  // 적용 + 목록에서 제거. 충돌로 실패하면 git이 항목을 보존한다
  async stashPop(index: number): Promise<void> {
    await this.stashRun(['pop', `stash@{${index}}`])
  }

  async stashDrop(index: number): Promise<void> {
    await this.git.stash(['drop', `stash@{${index}}`])
  }

  async readWorkingFile(path: string): Promise<string> {
    return readFile(join(this.repoPath, path), 'utf-8')
  }

  async saveResolved(path: string, content: string): Promise<void> {
    await writeFile(join(this.repoPath, path), content, 'utf-8')
    await this.git.add([path])
  }
}
