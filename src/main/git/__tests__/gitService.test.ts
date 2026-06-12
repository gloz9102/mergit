import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GitService } from '../gitService'
import { gitIn, makeConflictRepo, makeRepo, makeRepoWithCommits } from './fixtures'

describe('GitService', () => {
  it('info: git 저장소가 아니면 throw', async () => {
    const svc = new GitService('/tmp')
    await expect(svc.info()).rejects.toThrow()
  })

  it('log: 커밋 목록을 최신순으로 반환한다', async () => {
    const dir = makeRepo()
    const svc = new GitService(dir)
    const commits = await svc.log(0, 100)
    expect(commits).toHaveLength(1)
    expect(commits[0].subject).toBe('initial')
    expect(commits[0].parents).toEqual([])
  })

  it('log 페이징: 분할 조회 결과를 합치면 전체 조회와 같다', async () => {
    const dir = makeRepoWithCommits(5)
    const svc = new GitService(dir)
    const all = await svc.log(0, 100)
    expect(all).toHaveLength(5)
    const pages = [...(await svc.log(0, 2)), ...(await svc.log(2, 2)), ...(await svc.log(4, 2))]
    expect(pages.map((c) => c.hash)).toEqual(all.map((c) => c.hash))
  })

  it('searchCommits: 메시지를 대소문자 무시 부분 일치로 찾는다', async () => {
    const dir = makeRepo()
    const svc = new GitService(dir)
    expect(await svc.searchCommits('NITI')).toHaveLength(1)
    expect(await svc.searchCommits('없는내용')).toEqual([])
  })

  it('searchCommits: 작성자 이름으로도 찾는다 (메시지와 합집합)', async () => {
    const dir = makeRepo() // author: Test, subject: initial
    const svc = new GitService(dir)
    expect(await svc.searchCommits('Test')).toHaveLength(1)
  })

  it('searchCommits: 정규식 특수문자를 리터럴로 취급한다', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'x\n')
    const svc = new GitService(dir)
    await svc.stage(['a.txt'])
    await svc.commit('fix(scope): dots.and[brackets]')
    expect(await svc.searchCommits('dots.and[brackets]')).toHaveLength(1)
    expect(await svc.searchCommits('dotsXand')).toEqual([])
  })

  it('searchCommits: 빈 질의는 빈 배열', async () => {
    const dir = makeRepo()
    const svc = new GitService(dir)
    expect(await svc.searchCommits('')).toEqual([])
  })

  it('status: 수정 파일과 staged 파일을 구분한다', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'changed\n')
    writeFileSync(join(dir, 'new.txt'), 'new\n')
    const svc = new GitService(dir)
    let status = await svc.status()
    expect(status.files.map((f) => f.path).sort()).toEqual(['a.txt', 'new.txt'])
    expect(status.operation).toBe(null)

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
    const commits = await svc.log(0, 100)
    expect(commits[0].subject).toBe('second')
    expect(commits[0].parents).toHaveLength(1)
  })

  it('commit amend: 커밋 수는 그대로, 메시지와 내용이 바뀐다', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'amended content\n')
    const svc = new GitService(dir)
    await svc.stage(['a.txt'])
    await svc.commit('better message', true)
    const commits = await svc.log(0, 100)
    expect(commits).toHaveLength(1)
    expect(commits[0].subject).toBe('better message')
  })

  it('lastCommitMessage: 여러 줄 본문을 전부 반환한다', async () => {
    const dir = makeRepo()
    const git = gitIn(dir)
    writeFileSync(join(dir, 'b.txt'), 'x\n')
    git('add', '.')
    git('commit', '-m', 'title', '-m', 'body line')
    const svc = new GitService(dir)
    expect(await svc.lastCommitMessage()).toBe('title\n\nbody line')
  })

  it('undoLastCommit: HEAD가 한 단계 내려가고 변경은 staged로 남는다', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'second\n')
    const svc = new GitService(dir)
    await svc.stage(['a.txt'])
    await svc.commit('second')
    await svc.undoLastCommit()
    const commits = await svc.log(0, 100)
    expect(commits).toHaveLength(1)
    expect(commits[0].subject).toBe('initial')
    const status = await svc.status()
    expect(status.files.find((f) => f.path === 'a.txt')?.index).toBe('M')
  })

  it('undoLastCommit: 부모 없는 최초 커밋은 거부한다', async () => {
    const dir = makeRepo()
    const svc = new GitService(dir)
    await expect(svc.undoLastCommit()).rejects.toThrow()
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

  it('merge 충돌: conflicts=true, status에 충돌 파일과 operation=merge', async () => {
    const dir = makeConflictRepo()
    const svc = new GitService(dir)
    const result = await svc.merge('feature')
    expect(result.conflicts).toBe(true)
    const status = await svc.status()
    expect(status.conflicted).toContain('a.txt')
    expect(status.operation).toBe('merge')
  })

  it('충돌 해결: saveResolved → continueOperation 으로 머지를 끝낸다', async () => {
    const dir = makeConflictRepo()
    const svc = new GitService(dir)
    await svc.merge('feature')
    const content = await svc.readWorkingFile('a.txt')
    expect(content).toContain('<<<<<<<')
    await svc.saveResolved('a.txt', 'resolved\nline2\n')
    const status = await svc.status()
    expect(status.conflicted).toEqual([])
    await svc.continueOperation()
    const after = await svc.status()
    expect(after.operation).toBe(null)
    const commits = await svc.log(0, 100)
    expect(commits[0].parents).toHaveLength(2)
  })

  it('abortOperation: 머지 전 상태로 돌아간다', async () => {
    const dir = makeConflictRepo()
    const svc = new GitService(dir)
    await svc.merge('feature')
    await svc.abortOperation()
    const status = await svc.status()
    expect(status.operation).toBe(null)
    expect(status.conflicted).toEqual([])
  })

  it('cherryPick: 다른 브랜치의 커밋을 현재 브랜치로 복제한다', async () => {
    const dir = makeRepo()
    const git = gitIn(dir)
    git('checkout', '-b', 'feature')
    writeFileSync(join(dir, 'b.txt'), 'feature\n')
    git('add', '.')
    git('commit', '-m', 'feature work')
    git('checkout', 'main')
    // main에 커밋을 하나 더 만들어 부모를 다르게 한다
    // (부모·트리·타임스탬프가 모두 같으면 복제 커밋이 원본과 동일 해시가 된다)
    writeFileSync(join(dir, 'c.txt'), 'main\n')
    git('add', '.')
    git('commit', '-m', 'main work')
    const svc = new GitService(dir)
    const featureHash = (await svc.log(0, 100)).find((c) => c.subject === 'feature work')!.hash
    const result = await svc.cherryPick(featureHash)
    expect(result.conflicts).toBe(false)
    const commits = await svc.log(0, 100)
    // 원본(feature) + 복제(main) 두 개가 같은 subject를 가진다
    expect(commits.filter((c) => c.subject === 'feature work')).toHaveLength(2)
  })

  it('cherryPick 충돌: operation=cherry-pick, continueOperation으로 종결된다', async () => {
    const dir = makeConflictRepo()
    const svc = new GitService(dir)
    const feature = (await svc.log(0, 100)).find((c) => c.subject === 'feature edit')!
    const result = await svc.cherryPick(feature.hash)
    expect(result.conflicts).toBe(true)
    expect((await svc.status()).operation).toBe('cherry-pick')
    await svc.saveResolved('a.txt', 'resolved\nline2\n')
    await svc.continueOperation()
    const after = await svc.status()
    expect(after.operation).toBe(null)
    expect(existsSync(join(dir, '.git', 'CHERRY_PICK_HEAD'))).toBe(false)
  })

  it('abortOperation: cherry-pick 충돌을 중단하고 원상 복구한다', async () => {
    const dir = makeConflictRepo()
    const svc = new GitService(dir)
    const feature = (await svc.log(0, 100)).find((c) => c.subject === 'feature edit')!
    await svc.cherryPick(feature.hash)
    expect((await svc.status()).operation).toBe('cherry-pick')
    await svc.abortOperation()
    const status = await svc.status()
    expect(status.operation).toBe(null)
    expect(status.conflicted).toEqual([])
  })

  it('revertCommit: 변경을 되돌리는 Revert 커밋을 만든다', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'second\n')
    const svc = new GitService(dir)
    await svc.stage(['a.txt'])
    await svc.commit('second')
    const head = (await svc.log(0, 100))[0]
    const result = await svc.revertCommit(head.hash)
    expect(result.conflicts).toBe(false)
    const commits = await svc.log(0, 100)
    expect(commits[0].subject).toContain('Revert')
    expect(await svc.readWorkingFile('a.txt')).toBe('line1\nline2\n')
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

  it('stashSave: 지정한 파일만 스태시하고 나머지는 남긴다', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'change a\n')
    writeFileSync(join(dir, 'b.txt'), 'new b\n')
    const svc = new GitService(dir)
    await svc.stashSave('only a', ['a.txt'])
    const status = await svc.status()
    expect(status.files.map((f) => f.path)).toEqual(['b.txt'])
    expect(await svc.stashList()).toHaveLength(1)
  })

  it('stashSave: untracked 파일도 -u로 포함한다', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'new.txt'), 'new\n')
    const svc = new GitService(dir)
    await svc.stashSave('untracked')
    expect((await svc.status()).files).toHaveLength(0)
    await svc.stashPop(0)
    expect((await svc.status()).files.map((f) => f.path)).toEqual(['new.txt'])
  })

  it('stashPop: 변경을 복원하고 목록에서 제거한다', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'wip\n')
    const svc = new GitService(dir)
    await svc.stashSave('wip')
    await svc.stashPop(0)
    expect((await svc.status()).files).toHaveLength(1)
    expect(await svc.stashList()).toEqual([])
  })

  it('stashPop 충돌: 실패해도 스태시 항목이 보존된다', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'stashed version\n')
    const svc = new GitService(dir)
    await svc.stashSave('conflicting')
    writeFileSync(join(dir, 'a.txt'), 'working version\n')
    await svc.stage(['a.txt'])
    await expect(svc.stashPop(0)).rejects.toThrow()
    expect(await svc.stashList()).toHaveLength(1)
    // 충돌 파일이 status에 노출돼 배너로 해결 경로가 열린다
    expect((await svc.status()).conflicted).toContain('a.txt')
  })

  it('push/pull: bare 원격 저장소와 동기화한다', async () => {
    const dir = makeRepo()
    const remoteDir = mkdtempSync(join(tmpdir(), 'gkc-remote-'))
    gitIn(remoteDir)('init', '--bare', '-b', 'main')
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
    const [head] = await svc.log(0, 100)
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

  it('merge: 존재하지 않는 브랜치는 throw 한다', async () => {
    const dir = makeRepo()
    const svc = new GitService(dir)
    await expect(svc.merge('nonexistent')).rejects.toThrow()
  })

  it('merge: 로컬 변경과 충돌하는 머지는 throw 한다', async () => {
    const dir = makeConflictRepo()
    writeFileSync(join(dir, 'a.txt'), 'dirty\n')
    const svc = new GitService(dir)
    await expect(svc.merge('feature')).rejects.toThrow()
    expect((await svc.status()).operation).toBe(null)
  })

  it('discard: staged 변경도 되돌린다', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'staged change\n')
    const svc = new GitService(dir)
    await svc.stage(['a.txt'])
    await svc.discard(['a.txt'])
    expect((await svc.status()).files).toHaveLength(0)
  })
})
