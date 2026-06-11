import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GitService } from '../gitService'
import { gitIn, makeConflictRepo, makeRepo } from './fixtures'

describe('GitService', () => {
  it('info: git 저장소가 아니면 throw', async () => {
    const svc = new GitService('/tmp')
    await expect(svc.info()).rejects.toThrow()
  })

  it('log: 커밋 목록을 최신순으로 반환한다', async () => {
    const dir = makeRepo()
    const svc = new GitService(dir)
    const commits = await svc.log()
    expect(commits).toHaveLength(1)
    expect(commits[0].subject).toBe('initial')
    expect(commits[0].parents).toEqual([])
  })

  it('status: 수정 파일과 staged 파일을 구분한다', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'changed\n')
    writeFileSync(join(dir, 'new.txt'), 'new\n')
    const svc = new GitService(dir)
    let status = await svc.status()
    expect(status.files.map((f) => f.path).sort()).toEqual(['a.txt', 'new.txt'])
    expect(status.merging).toBe(false)

    await svc.stage(['a.txt'])
    status = await svc.status()
    const a = status.files.find((f) => f.path === 'a.txt')!
    expect(a.index).toBe('M')
  })

  it('stage → commit → log 에 반영된다', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'changed\n')
    const svc = new GitService(dir)
    await svc.stage(['a.txt'])
    await svc.commit('second')
    const commits = await svc.log()
    expect(commits[0].subject).toBe('second')
    expect(commits[0].parents).toHaveLength(1)
  })

  it('branches: 로컬 브랜치와 current 플래그', async () => {
    const dir = makeConflictRepo()
    const svc = new GitService(dir)
    const branches = await svc.branches()
    const names = branches.filter((b) => !b.isRemote).map((b) => b.name).sort()
    expect(names).toEqual(['feature', 'main'])
    expect(branches.find((b) => b.name === 'main')?.current).toBe(true)
  })

  it('createBranch / checkoutBranch / renameBranch / deleteBranch', async () => {
    const dir = makeRepo()
    const svc = new GitService(dir)
    await svc.createBranch('work', false)
    await svc.checkoutBranch('work')
    expect((await svc.status()).current).toBe('work')
    await svc.checkoutBranch('main')
    await svc.renameBranch('work', 'work2')
    await svc.deleteBranch('work2', false)
    const names = (await svc.branches()).map((b) => b.name)
    expect(names).not.toContain('work')
    expect(names).not.toContain('work2')
  })

  it('merge 충돌: conflicts=true, status에 충돌 파일과 merging 플래그', async () => {
    const dir = makeConflictRepo()
    const svc = new GitService(dir)
    const result = await svc.merge('feature')
    expect(result.conflicts).toBe(true)
    const status = await svc.status()
    expect(status.conflicted).toContain('a.txt')
    expect(status.merging).toBe(true)
  })

  it('충돌 해결: saveResolved → commitMerge 로 머지를 끝낸다', async () => {
    const dir = makeConflictRepo()
    const svc = new GitService(dir)
    await svc.merge('feature')
    const content = await svc.readWorkingFile('a.txt')
    expect(content).toContain('<<<<<<<')
    await svc.saveResolved('a.txt', 'resolved\nline2\n')
    const status = await svc.status()
    expect(status.conflicted).toEqual([])
    await svc.commitMerge()
    const after = await svc.status()
    expect(after.merging).toBe(false)
    const commits = await svc.log()
    expect(commits[0].parents).toHaveLength(2)
  })

  it('abortMerge: 머지 전 상태로 돌아간다', async () => {
    const dir = makeConflictRepo()
    const svc = new GitService(dir)
    await svc.merge('feature')
    await svc.abortMerge()
    const status = await svc.status()
    expect(status.merging).toBe(false)
    expect(status.conflicted).toEqual([])
  })

  it('stash save/list/apply/drop', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'wip\n')
    const svc = new GitService(dir)
    await svc.stashSave('my wip')
    expect((await svc.status()).files).toHaveLength(0)
    const list = await svc.stashList()
    expect(list).toHaveLength(1)
    expect(list[0].message).toContain('my wip')
    await svc.stashApply(0)
    expect((await svc.status()).files).toHaveLength(1)
    await svc.stashDrop(0)
    expect(await svc.stashList()).toEqual([])
  })

  it('push/pull: bare 원격 저장소와 동기화한다', async () => {
    const dir = makeRepo()
    const remoteDir = makeRepo()
    gitIn(remoteDir)('config', 'receive.denyCurrentBranch', 'ignore')
    gitIn(dir)('remote', 'add', 'origin', remoteDir)
    const svc = new GitService(dir)
    await svc.push()
    await svc.fetch()
    const branches = await svc.branches()
    expect(branches.some((b) => b.isRemote && b.name === 'origin/main')).toBe(true)
  })

  it('commitFiles / diffCommitFile / diffWorkingFile', async () => {
    const dir = makeRepo()
    const svc = new GitService(dir)
    const [head] = await svc.log()
    const files = await svc.commitFiles(head.hash)
    expect(files).toEqual([{ path: 'a.txt', status: 'A' }])
    const diff = await svc.diffCommitFile(head.hash, 'a.txt')
    expect(diff).toContain('+line1')
    writeFileSync(join(dir, 'a.txt'), 'line1\nline2\nline3\n')
    const wdiff = await svc.diffWorkingFile('a.txt', false)
    expect(wdiff).toContain('+line3')
  })

  it('discard: 수정을 되돌리고 untracked는 삭제한다', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'changed\n')
    writeFileSync(join(dir, 'junk.txt'), 'junk\n')
    const svc = new GitService(dir)
    await svc.discard(['a.txt', 'junk.txt'])
    expect((await svc.status()).files).toHaveLength(0)
  })
})
