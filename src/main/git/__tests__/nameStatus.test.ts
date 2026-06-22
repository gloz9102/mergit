import { describe, expect, it } from 'vitest'
import { parseNameStatus } from '../nameStatus'

describe('parseNameStatus', () => {
  it('A/M/D 경로와 특수 파일명을 NUL 토큰으로 파싱한다', () => {
    const raw = [
      'A',
      'space name.txt',
      'M',
      'dir/한글😀.txt',
      'D',
      'tabs\tand\nlines.txt',
      ''
    ].join('\0')

    expect(parseNameStatus(raw)).toEqual([
      { kind: 'A', path: 'space name.txt' },
      { kind: 'M', path: 'dir/한글😀.txt' },
      { kind: 'D', path: 'tabs\tand\nlines.txt' }
    ])
  })

  it('rename/copy record의 oldPath, path, score를 분리한다', () => {
    const raw = [
      'R100',
      'old\tname.txt',
      'new\tname.txt',
      'C75',
      'copy-from.txt',
      'copy-to.txt',
      ''
    ].join('\0')

    expect(parseNameStatus(raw)).toEqual([
      { kind: 'R', score: 100, oldPath: 'old\tname.txt', path: 'new\tname.txt' },
      { kind: 'C', score: 75, oldPath: 'copy-from.txt', path: 'copy-to.txt' }
    ])
  })

  it('malformed rename/copy token을 silent corruption 없이 거부한다', () => {
    expect(() => parseNameStatus(['R100', 'old.txt', ''].join('\0'))).toThrow(/old and new paths/)
    expect(() => parseNameStatus(['Rbad', 'old.txt', 'new.txt', ''].join('\0'))).toThrow(/invalid score/)
  })
})
