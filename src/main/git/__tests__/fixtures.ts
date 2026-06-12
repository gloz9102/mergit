import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function gitIn(dir: string) {
  return (...args: string[]): string =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf-8' })
}

// 커밋 1개 있는 기본 저장소
export function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gkc-'))
  const git = gitIn(dir)
  git('init', '-b', 'main')
  git('config', 'user.email', 'test@test.com')
  git('config', 'user.name', 'Test')
  git('config', 'commit.gpgsign', 'false')
  writeFileSync(join(dir, 'a.txt'), 'line1\nline2\n')
  git('add', '.')
  git('commit', '-m', 'initial')
  return dir
}

// 연속 커밋 c1..cn이 있는 저장소 (페이징 테스트용)
export function makeRepoWithCommits(n: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'gkc-'))
  const git = gitIn(dir)
  git('init', '-b', 'main')
  git('config', 'user.email', 'test@test.com')
  git('config', 'user.name', 'Test')
  git('config', 'commit.gpgsign', 'false')
  for (let i = 1; i <= n; i++) {
    writeFileSync(join(dir, 'a.txt'), `v${i}\n`)
    git('add', '.')
    git('commit', '-m', `c${i}`)
  }
  return dir
}

// main과 feature가 같은 줄을 다르게 수정해 머지 시 충돌하는 저장소
export function makeConflictRepo(): string {
  const dir = makeRepo()
  const git = gitIn(dir)
  git('checkout', '-b', 'feature')
  writeFileSync(join(dir, 'a.txt'), 'feature change\nline2\n')
  git('commit', '-am', 'feature edit')
  git('checkout', 'main')
  writeFileSync(join(dir, 'a.txt'), 'main change\nline2\n')
  git('commit', '-am', 'main edit')
  return dir
}
