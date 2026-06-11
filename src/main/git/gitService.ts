import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { simpleGit, type SimpleGit } from 'simple-git'
import { LOG_FORMAT, parseLog } from '../../shared/logParser'
import type {
  BranchDto,
  CommitDto,
  CommitFileDto,
  RepoInfoDto,
  StashDto,
  StatusDto
} from '../../shared/types'

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

  async log(): Promise<CommitDto[]> {
    const head = await this.git.raw(['rev-list', '-n', '1', '--all']).catch(() => '')
    if (!head.trim()) return [] // 커밋 0개인 저장소
    const raw = await this.git.raw(['log', '--all', '--date-order', `--format=${LOG_FORMAT}`])
    return parseLog(raw)
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
      merging: existsSync(join(this.repoPath, '.git', 'MERGE_HEAD')),
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
    const raw = await this.git.raw(['diff-tree', '--no-commit-id', '--name-status', '-r', '--root', hash])
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
    const content = await readFile(join(this.repoPath, path), 'utf-8').catch(() => '')
    return content
      .split('\n')
      .map((l) => `+${l}`)
      .join('\n')
  }

  async stage(paths: string[]): Promise<void> {
    await this.git.add(paths)
  }

  async unstage(paths: string[]): Promise<void> {
    await this.git.raw(['restore', '--staged', '--', ...paths])
  }

  async discard(paths: string[]): Promise<void> {
    const s = await this.git.status()
    const untracked = paths.filter((p) => s.not_added.includes(p))
    const tracked = paths.filter((p) => !s.not_added.includes(p))
    if (tracked.length) await this.git.raw(['checkout', '--', ...tracked])
    if (untracked.length) await this.git.raw(['clean', '-f', '--', ...untracked])
  }

  async commit(message: string): Promise<void> {
    await this.git.commit(message)
  }

  // 머지 커밋: .git/MERGE_MSG의 기본 메시지를 그대로 사용
  async commitMerge(): Promise<void> {
    await this.git.raw(['commit', '--no-edit'])
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

  async deleteBranch(name: string, force: boolean): Promise<void> {
    await this.git.deleteLocalBranch(name, force)
  }

  async renameBranch(oldName: string, newName: string): Promise<void> {
    await this.git.branch(['-m', oldName, newName])
  }

  async merge(branch: string): Promise<{ conflicts: boolean }> {
    try {
      await this.git.merge([branch])
    } catch {
      // simple-git may throw on conflict (English locale) — fall through to check status
    }
    // Always check actual state: MERGE_HEAD or conflicted files indicate a conflict
    const merging = existsSync(join(this.repoPath, '.git', 'MERGE_HEAD'))
    if (merging) {
      const s = await this.git.status()
      if (s.conflicted.length > 0) return { conflicts: true }
    }
    return { conflicts: false }
  }

  async abortMerge(): Promise<void> {
    await this.git.merge(['--abort'])
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

  async stashSave(message: string): Promise<void> {
    await this.git.stash(['push', '-m', message || 'WIP'])
  }

  async stashList(): Promise<StashDto[]> {
    const raw = await this.git.raw(['stash', 'list']).catch(() => '')
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line, i) => ({ index: i, message: line.replace(/^stash@\{\d+\}:\s*/, '') }))
  }

  async stashApply(index: number): Promise<void> {
    await this.git.stash(['apply', `stash@{${index}}`])
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
