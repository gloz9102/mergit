import { existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GitService, MAX_UNTRACKED_DIFF_BYTES } from '../gitService'
import { gitIn, makeConflictRepo, makeRepo, makeRepoWithCommits } from './fixtures'

function makeCheckoutBlockedRepo(): string {
  const dir = makeRepo()
  const git = gitIn(dir)
  writeFileSync(join(dir, 'pnpm-lock.yaml'), 'main lock\n')
  git('add', '.')
  git('commit', '-m', 'add lock')
  git('checkout', '-b', 'feature')
  writeFileSync(join(dir, 'pnpm-lock.yaml'), 'feature lock\n')
  git('commit', '-am', 'feature lock')
  git('checkout', 'main')
  writeFileSync(join(dir, 'pnpm-lock.yaml'), 'local lock\n')
  writeFileSync(join(dir, 'local-only.txt'), 'keep me\n')
  return dir
}

describe('GitService', () => {
  it('info: git 저장소가 아니면 throw', async () => {
    const svc = new GitService(mkdtempSync(join(tmpdir(), 'gkc-not-repo-')))
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

  it('log 옵션: --all을 끄면 현재 브랜치 범위만 반환한다', async () => {
    const dir = makeRepo()
    const git = gitIn(dir)
    git('checkout', '-b', 'feature')
    writeFileSync(join(dir, 'feature.txt'), 'feature\n')
    git('add', '.')
    git('commit', '-m', 'feature only')
    git('checkout', 'main')
    const svc = new GitService(dir)

    const currentOnly = await svc.log(0, 100, { order: 'topo-order', all: false })
    const allBranches = await svc.log(0, 100, { order: 'topo-order', all: true })

    expect(currentOnly.map((c) => c.subject)).toEqual(['initial'])
    expect(allBranches.map((c) => c.subject)).toContain('feature only')
  })

  it('log 전체 범위는 stash 내부 커밋을 히스토리에 포함하지 않는다', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'stashed content\n')
    const svc = new GitService(dir)

    await svc.stashSave('hidden stash subject')

    const commits = await svc.log(0, 100, { order: 'topo-order', all: true })
    expect(commits.map((commit) => commit.subject)).toEqual(['initial'])
    expect(await svc.searchCommits('hidden stash', { order: 'topo-order', all: true })).toEqual([])
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

  it('searchCommits 옵션: --all을 끄면 현재 브랜치 범위에서만 찾는다', async () => {
    const dir = makeRepo()
    const git = gitIn(dir)
    git('checkout', '-b', 'feature')
    writeFileSync(join(dir, 'feature.txt'), 'feature\n')
    git('add', '.')
    git('commit', '-m', 'hidden feature')
    git('checkout', 'main')
    const svc = new GitService(dir)

    expect(await svc.searchCommits('hidden', { order: 'topo-order', all: false })).toEqual([])
    expect(await svc.searchCommits('hidden', { order: 'topo-order', all: true })).toHaveLength(1)
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

  it('log: 커밋 본문 description을 subject와 함께 반환한다', async () => {
    const dir = makeRepo()
    const git = gitIn(dir)
    writeFileSync(join(dir, 'b.txt'), 'body\n')
    git('add', '.')
    git('commit', '-m', 'title', '-m', 'body line 1\nbody line 2')
    const svc = new GitService(dir)

    const [commit] = await svc.log(0, 1)

    expect(commit.subject).toBe('title')
    expect(commit.body).toBe('body line 1\nbody line 2')
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

  it('stage: 옵션처럼 생긴 파일명만 정확히 스테이징한다', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'other change\n')
    writeFileSync(join(dir, '--all'), 'all file\n')
    writeFileSync(join(dir, '-n'), 'dry-run file\n')
    const svc = new GitService(dir)

    await svc.stage(['--all'])
    await svc.stage(['-n'])

    const files = await svc.status()
    expect(files.files.find((file) => file.path === '--all')?.index).toBe('A')
    expect(files.files.find((file) => file.path === '-n')?.index).toBe('A')
    expect(files.files.find((file) => file.path === 'a.txt')).toMatchObject({
      index: ' ',
      workingDir: 'M'
    })
  })

  it('unstage: 최초 커밋 전에도 working tree를 보존한다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gkc-unborn-'))
    const git = gitIn(dir)
    git('init', '-b', 'main')
    git('config', 'user.email', 'test@test.com')
    git('config', 'user.name', 'Test')
    writeFileSync(join(dir, 'new.txt'), 'staged\n')
    const svc = new GitService(dir)
    await svc.stage(['new.txt'])
    writeFileSync(join(dir, 'new.txt'), 'working\n')

    await svc.unstage(['new.txt'])

    expect((await svc.status()).files).toEqual([
      expect.objectContaining({ path: 'new.txt', index: '?', workingDir: '?' })
    ])
    expect(readFileSync(join(dir, 'new.txt'), 'utf-8')).toBe('working\n')
  })

  it('checkoutBranch: 원격 브랜치는 명시적인 tracking branch로 체크아웃한다', async () => {
    const dir = makeRepo()
    const remoteDir = mkdtempSync(join(tmpdir(), 'gkc-remote-'))
    const git = gitIn(dir)
    gitIn(remoteDir)('init', '--bare', '-b', 'main')
    git('remote', 'add', 'origin', remoteDir)
    git('push', '-u', 'origin', 'main')
    git('checkout', '-b', 'feature')
    writeFileSync(join(dir, 'feature.txt'), 'feature\n')
    git('add', '.')
    git('commit', '-m', 'feature')
    git('push', 'origin', 'feature')
    git('checkout', 'main')
    git('branch', '-D', 'feature')
    git('fetch', 'origin')
    const svc = new GitService(dir)

    await svc.checkoutBranch('origin/feature')

    const status = await svc.status()
    expect(status.current).toBe('feature')
    expect(status.tracking).toBe('origin/feature')
  })

  it('checkoutBranch: 같은 이름의 로컬 브랜치가 다른 upstream이면 원격 선택을 거부한다', async () => {
    const dir = makeRepo()
    const remoteDir = mkdtempSync(join(tmpdir(), 'gkc-remote-'))
    const git = gitIn(dir)
    gitIn(remoteDir)('init', '--bare', '-b', 'main')
    git('remote', 'add', 'origin', remoteDir)
    git('push', 'origin', 'main')
    git('push', 'origin', 'main:feature')
    git('branch', 'feature', 'main')
    git('fetch', 'origin')
    const svc = new GitService(dir)

    await expect(svc.checkoutBranch('origin/feature')).rejects.toMatchObject({ code: 'BRANCH_COLLISION' })
    expect((await svc.status()).current).toBe('main')
  })

  it('checkoutBranch: 대상 브랜치가 로컬 변경을 덮어쓰면 실패한다', async () => {
    const dir = makeCheckoutBlockedRepo()
    const svc = new GitService(dir)

    await expect(svc.checkoutBranch('feature')).rejects.toThrow(/overwritten by checkout/)
    expect((await svc.status()).current).toBe('main')
  })

  it('stashAndCheckoutBranch: 지정한 blocked 파일만 스태시하고 체크아웃한다', async () => {
    const dir = makeCheckoutBlockedRepo()
    const svc = new GitService(dir)

    const result = await svc.stashAndCheckoutBranch('feature', ['pnpm-lock.yaml'])

    expect(result.checkedOut).toBe(true)
    expect(result.stash?.oid).toBeDefined()
    const status = await svc.status()
    expect(status.current).toBe('feature')
    expect(status.files.map((f) => f.path)).toEqual(['local-only.txt'])
    expect(await svc.readWorkingFile('pnpm-lock.yaml')).toBe('feature lock\n')
    expect((await svc.stashList())[0].message).toContain('Mergit checkout: main -> feature')
  })

  it('stashAndCheckoutBranch: paths가 없으면 전체 변경을 스태시하고 체크아웃한다', async () => {
    const dir = makeCheckoutBlockedRepo()
    const svc = new GitService(dir)

    const result = await svc.stashAndCheckoutBranch('feature')

    expect(result.checkedOut).toBe(true)
    const status = await svc.status()
    expect(status.current).toBe('feature')
    expect(status.files).toEqual([])
    expect((await svc.stashList())[0].message).toContain('Mergit checkout: main -> feature')
  })

  it('stashAndCheckoutBranch: stash 성공 후 checkout 실패를 부분 성공으로 반환한다', async () => {
    const dir = makeRepo()
    const git = gitIn(dir)
    git('checkout', '-b', 'feature')
    writeFileSync(join(dir, 'blocked.txt'), 'feature file\n')
    git('add', '.')
    git('commit', '-m', 'feature file')
    git('checkout', 'main')
    writeFileSync(join(dir, 'a.txt'), 'stashed change\n')
    writeFileSync(join(dir, 'blocked.txt'), 'untracked blocks checkout\n')
    const svc = new GitService(dir)

    const result = await svc.stashAndCheckoutBranch('feature', ['a.txt'])

    expect(result.checkedOut).toBe(false)
    if (result.checkedOut) throw new Error('expected checkout to fail after stash')
    expect(result.stash?.message).toContain('Mergit checkout: main -> feature')
    expect(result.error).toContain('blocked.txt')
    expect((await svc.status()).current).toBe('main')
    const stashes = await svc.stashList()
    expect(stashes.map((stash) => stash.oid)).toContain(result.stash?.oid)
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

  it('status: linked worktree의 Git metadata 경로로 진행 중 작업을 감지한다', async () => {
    const dir = makeConflictRepo()
    const linked = mkdtempSync(join(tmpdir(), 'gkc-worktree-'))
    gitIn(dir)('worktree', 'add', '-b', 'linked-main', linked, 'main')
    const svc = new GitService(linked)

    const result = await svc.merge('feature')

    expect(result.conflicts).toBe(true)
    expect((await svc.status()).operation).toBe('merge')
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

  it('바이너리 충돌은 텍스트로 읽거나 저장하지 않고 선택한 원본 바이트로 해결한다', async () => {
    const dir = makeRepo()
    const git = gitIn(dir)
    writeFileSync(join(dir, 'image.bin'), Buffer.from([0, 1, 2]))
    git('add', 'image.bin')
    git('commit', '-m', 'add binary')
    git('checkout', '-b', 'feature')
    writeFileSync(join(dir, 'image.bin'), Buffer.from([0, 3, 4]))
    git('commit', '-am', 'feature binary')
    git('checkout', 'main')
    writeFileSync(join(dir, 'image.bin'), Buffer.from([0, 5, 6]))
    git('commit', '-am', 'main binary')
    const svc = new GitService(dir)
    await svc.merge('feature')

    const conflict = await svc.readConflictFile('image.bin')
    expect(conflict).toEqual({
      path: 'image.bin',
      kind: 'binary',
      content: null,
      oursExists: true,
      theirsExists: true
    })
    await expect(svc.saveResolved('image.bin', 'corrupted\n')).rejects.toThrow(/binary|UTF-8/i)

    await svc.resolveConflictSide('image.bin', 'theirs')

    expect((await svc.status()).conflicted).toEqual([])
    expect(readFileSync(join(dir, 'image.bin'))).toEqual(Buffer.from([0, 3, 4]))
  })

  it('NUL이 없는 비 UTF-8 충돌도 텍스트 저장을 차단하고 원본 바이트를 보존한다', async () => {
    const dir = makeRepo()
    const git = gitIn(dir)
    writeFileSync(join(dir, 'legacy.txt'), Buffer.from([0x61, 0xff, 0x0a]))
    git('add', 'legacy.txt')
    git('commit', '-m', 'add legacy encoding')
    git('checkout', '-b', 'feature')
    writeFileSync(join(dir, 'legacy.txt'), Buffer.from([0x62, 0xff, 0x0a]))
    git('commit', '-am', 'feature legacy')
    git('checkout', 'main')
    const ours = Buffer.from([0x63, 0xff, 0x0a])
    writeFileSync(join(dir, 'legacy.txt'), ours)
    git('commit', '-am', 'main legacy')
    const svc = new GitService(dir)
    await svc.merge('feature')

    expect(await svc.readConflictFile('legacy.txt')).toMatchObject({ kind: 'binary', content: null })
    await expect(svc.saveResolved('legacy.txt', 'corrupted\n')).rejects.toThrow(/binary|UTF-8/i)

    await svc.resolveConflictSide('legacy.txt', 'ours')

    expect(readFileSync(join(dir, 'legacy.txt'))).toEqual(ours)
    expect((await svc.status()).conflicted).toEqual([])
  })

  it('modify/delete 충돌은 marker 없이도 삭제 쪽 전체 버전으로 해결한다', async () => {
    const dir = makeRepo()
    const git = gitIn(dir)
    git('checkout', '-b', 'feature')
    git('rm', 'a.txt')
    git('commit', '-m', 'delete file')
    git('checkout', 'main')
    writeFileSync(join(dir, 'a.txt'), 'main changed\n')
    git('commit', '-am', 'main changes file')
    const svc = new GitService(dir)
    await svc.merge('feature')

    expect(await svc.readConflictFile('a.txt')).toMatchObject({
      kind: 'text',
      content: 'main changed\n',
      oursExists: true,
      theirsExists: false
    })

    await svc.resolveConflictSide('a.txt', 'theirs')

    expect(existsSync(join(dir, 'a.txt'))).toBe(false)
    expect((await svc.status()).conflicted).toEqual([])
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
    await svc.stashApply(list[0].oid)
    expect((await svc.status()).files).toHaveLength(1)
    await svc.stashDrop(list[0].oid)
    expect(await svc.stashList()).toEqual([])
  })

  it('saveResolved: 옵션처럼 생긴 충돌 파일명 외의 변경은 스테이징하지 않는다', async () => {
    const dir = makeRepo()
    const git = gitIn(dir)
    writeFileSync(join(dir, '--all'), 'base\n')
    git('add', '--', '--all')
    git('commit', '-m', 'add option-like path')
    git('checkout', '-b', 'feature')
    writeFileSync(join(dir, '--all'), 'feature\n')
    git('commit', '-am', 'feature change')
    git('checkout', 'main')
    writeFileSync(join(dir, '--all'), 'main\n')
    git('commit', '-am', 'main change')
    const svc = new GitService(dir)
    await svc.merge('feature')
    writeFileSync(join(dir, 'a.txt'), 'other change\n')

    await svc.saveResolved('--all', 'resolved\n')

    const status = await svc.status()
    expect(status.files.find((file) => file.path === '--all')).toMatchObject({ index: 'M', workingDir: ' ' })
    expect(status.files.find((file) => file.path === 'a.txt')).toMatchObject({ index: ' ', workingDir: 'M' })
  })

  it('stashList: Git 실패를 빈 목록으로 숨기지 않는다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gkc-not-repo-'))
    const svc = new GitService(dir)

    await expect(svc.stashList()).rejects.toThrow()
  })

  it('stashFiles: 스태시에 포함된 파일 목록을 반환한다', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'tracked change\n')
    writeFileSync(join(dir, 'new.txt'), 'new\n')
    const svc = new GitService(dir)

    await svc.stashSave('with files')
    const [stash] = await svc.stashList()
    const files = await svc.stashFiles(stash.oid)

    expect(files).toEqual(
      expect.arrayContaining([
        { path: 'a.txt', kind: 'M' },
        { path: 'new.txt', kind: 'A' }
      ])
    )
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
    const [stash] = await svc.stashList()
    await svc.stashPop(stash.oid)
    expect((await svc.status()).files.map((f) => f.path)).toEqual(['new.txt'])
  })

  it('stashPop: 변경을 복원하고 목록에서 제거한다', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'wip\n')
    const svc = new GitService(dir)
    await svc.stashSave('wip')
    const [stash] = await svc.stashList()
    await svc.stashPop(stash.oid)
    expect((await svc.status()).files).toHaveLength(1)
    expect(await svc.stashList()).toEqual([])
  })

  it('stashPop 충돌: 실패해도 스태시 항목이 보존된다', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'stashed version\n')
    const svc = new GitService(dir)
    await svc.stashSave('conflicting')
    const [stash] = await svc.stashList()
    writeFileSync(join(dir, 'a.txt'), 'working version\n')
    await svc.stage(['a.txt'])
    await expect(svc.stashPop(stash.oid)).rejects.toThrow()
    expect(await svc.stashList()).toHaveLength(1)
    // 충돌 파일이 status에 노출돼 배너로 해결 경로가 열린다
    expect((await svc.status()).conflicted).toContain('a.txt')
  })

  it('stashPop: index가 바뀌어도 선택한 OID의 스태시만 적용하고 제거한다', async () => {
    const dir = makeRepo()
    const svc = new GitService(dir)
    writeFileSync(join(dir, 'a.txt'), 'older stash\n')
    await svc.stashSave('older')
    const older = (await svc.stashList())[0]

    writeFileSync(join(dir, 'newer.txt'), 'newer stash\n')
    await svc.stashSave('newer')

    await svc.stashPop(older.oid)

    expect(await svc.readWorkingFile('a.txt')).toBe('older stash\n')
    const remaining = await svc.stashList()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].message).toContain('newer')
    expect(remaining[0].oid).not.toBe(older.oid)
  })

  it('stashDrop: index가 바뀌어도 선택한 OID의 스태시만 제거한다', async () => {
    const dir = makeRepo()
    const svc = new GitService(dir)
    writeFileSync(join(dir, 'a.txt'), 'drop older\n')
    await svc.stashSave('drop older')
    const older = (await svc.stashList())[0]

    writeFileSync(join(dir, 'newer.txt'), 'keep newer\n')
    await svc.stashSave('keep newer')

    await svc.stashDrop(older.oid)

    const remaining = await svc.stashList()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].message).toContain('keep newer')
    expect(remaining[0].oid).not.toBe(older.oid)
  })

  it('push: upstream이 없으면 origin을 임의로 선택하지 않는다', async () => {
    const dir = makeRepo()
    const remoteDir = mkdtempSync(join(tmpdir(), 'gkc-remote-'))
    gitIn(remoteDir)('init', '--bare', '-b', 'main')
    gitIn(dir)('remote', 'add', 'origin', remoteDir)
    const svc = new GitService(dir)

    await expect(svc.push()).rejects.toThrow(/upstream/i)
  })

  it('push/pull: tracking 원격 저장소와 동기화한다', async () => {
    const dir = makeRepo()
    const remoteDir = mkdtempSync(join(tmpdir(), 'gkc-remote-'))
    gitIn(remoteDir)('init', '--bare', '-b', 'main')
    const git = gitIn(dir)
    git('remote', 'add', 'origin', remoteDir)
    git('push', '-u', 'origin', 'main')
    writeFileSync(join(dir, 'a.txt'), 'pushed change\n')
    git('add', '.')
    git('commit', '-m', 'pushed change')
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
    expect(files).toEqual([{ path: 'a.txt', kind: 'A' }])
    const diff = await svc.diffCommitFile(head.hash, 'a.txt')
    expect(diff).toContain('+line1')
    writeFileSync(join(dir, 'a.txt'), 'line1\nline2\nline3\n')
    const wdiff = await svc.diffWorkingFile('a.txt', false)
    expect(wdiff).toContain('+line3')
  })

  it('diffWorkingFile: 큰 untracked 파일은 전체 내용을 읽어 diff로 만들지 않는다', async () => {
    const dir = makeRepo()
    const svc = new GitService(dir)
    writeFileSync(join(dir, 'big.txt'), 'x'.repeat(MAX_UNTRACKED_DIFF_BYTES + 1))

    const diff = await svc.diffWorkingFile('big.txt', false)

    expect(diff).toContain('Diff omitted: untracked file is too large')
    expect(diff.length).toBeLessThan(300)
  })

  it('file API: 저장소 밖 상대 경로와 .git metadata 접근을 거부한다', async () => {
    const dir = makeRepo()
    const outside = join(dir, '..', 'outside.txt')
    writeFileSync(outside, 'outside\n')
    const svc = new GitService(dir)

    await expect(svc.readWorkingFile('../outside.txt')).rejects.toThrow(/repository/i)
    await expect(svc.saveResolved('../outside.txt', 'changed\n')).rejects.toThrow(/repository/i)
    await expect(svc.diffWorkingFile('../outside.txt', false)).rejects.toThrow(/repository/i)
    await expect(svc.readWorkingFile('.git/config')).rejects.toThrow(/repository/i)
    if (process.platform === 'win32') {
      await expect(svc.readWorkingFile('.GIT/config')).rejects.toThrow(/repository/i)
    }
    expect(readFileSync(outside, 'utf-8')).toBe('outside\n')
  })

  it('file API: 저장소 밖을 가리키는 symlink는 거부한다', async () => {
    const dir = makeRepo()
    const outside = join(dir, '..', 'outside-symlink.txt')
    const link = join(dir, 'linked-outside.txt')
    writeFileSync(outside, 'outside\n')
    try {
      symlinkSync(outside, link, 'file')
    } catch {
      return
    }
    const svc = new GitService(dir)

    await expect(svc.readWorkingFile('linked-outside.txt')).rejects.toThrow(/repository/i)
    await expect(svc.saveResolved('linked-outside.txt', 'changed\n')).rejects.toThrow(/repository/i)
    expect(readFileSync(outside, 'utf-8')).toBe('outside\n')
  })

  it('discardUnstaged: 수정을 index 상태로 되돌리고 untracked는 삭제한다', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'changed\n')
    writeFileSync(join(dir, 'junk.txt'), 'junk\n')
    const svc = new GitService(dir)
    await svc.discardUnstaged(['a.txt', 'junk.txt'])
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

  it('discardUnstaged: 부분 스테이징된 변경을 보존한다', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'staged change\n')
    const svc = new GitService(dir)
    await svc.stage(['a.txt'])
    writeFileSync(join(dir, 'a.txt'), 'unstaged change\n')

    await svc.discardUnstaged(['a.txt'])

    expect((await svc.status()).files).toEqual([
      expect.objectContaining({ path: 'a.txt', index: 'M', workingDir: ' ' })
    ])
    expect(readFileSync(join(dir, 'a.txt'), 'utf-8')).toBe('staged change\n')
  })
})
