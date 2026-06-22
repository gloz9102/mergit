import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { RepoWatcher, scopeForWatchPath } from '../repoWatcher'

describe('scopeForWatchPath', () => {
  it('working tree 파일 변경은 status만 갱신한다', () => {
    expect(scopeForWatchPath('src/app.ts')).toEqual({ status: true })
  })

  it('index와 진행 중 작업 metadata는 status만 갱신한다', () => {
    expect(scopeForWatchPath('.git/index')).toEqual({ status: true })
    expect(scopeForWatchPath('.git/MERGE_HEAD')).toEqual({ status: true })
  })

  it('ref 변경은 history와 branch 상태를 갱신한다', () => {
    expect(scopeForWatchPath('.git/refs/heads/main')).toEqual({
      history: true,
      branches: true,
      status: true
    })
  })

  it('stash ref log 변경은 stash 목록과 status를 갱신한다', () => {
    expect(scopeForWatchPath('.git/logs/refs/stash')).toEqual({ status: true, stashes: true })
  })

  it('객체와 lock 파일 noise는 무시한다', () => {
    expect(scopeForWatchPath('.git/objects/01/abcdef')).toBe(null)
    expect(scopeForWatchPath('.git/index.lock')).toBe(null)
  })

  it('filename이 없으면 보수적으로 전체 refresh를 요청한다', () => {
    expect(scopeForWatchPath('')).toEqual({
      history: true,
      branches: true,
      status: true,
      stashes: true
    })
  })

  it('watch 시작 실패는 throw하지 않고 진단 callback으로 전달한다', () => {
    const watcher = new RepoWatcher()
    const onError = vi.fn()

    expect(() => {
      watcher.start(join(tmpdir(), `missing-${Date.now()}`), () => {}, onError)
    }).not.toThrow()

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Failed to watch repository')
      })
    )
  })
})
