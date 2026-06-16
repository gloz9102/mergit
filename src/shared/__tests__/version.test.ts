import { describe, expect, it } from 'vitest'
import { compareVersions, isNewer } from '../version'

describe('compareVersions', () => {
  it("'v' 프리픽스를 무시하고 비교한다", () => {
    expect(compareVersions('v0.3.1', '0.3.1')).toBe(0)
  })

  it('major.minor.patch 숫자 크기로 비교한다', () => {
    expect(compareVersions('0.4.0', '0.3.9')).toBe(1)
    expect(compareVersions('1.0.0', '0.9.9')).toBe(1)
  })

  it('자리수가 다르면 누락분을 0으로 채운다', () => {
    expect(compareVersions('0.3', '0.3.0')).toBe(0)
    expect(compareVersions('0.3.1', '0.3')).toBe(1)
  })

  it('같은 core에서는 stable이 prerelease보다 높다', () => {
    expect(compareVersions('0.4.0', '0.4.0-beta.1')).toBe(1)
    expect(compareVersions('0.4.0-beta.1', '0.4.0')).toBe(-1)
  })

  it('prerelease 식별자는 semver 우선순위로 비교한다', () => {
    expect(compareVersions('0.4.0-beta.2', '0.4.0-beta.1')).toBe(1)
    expect(compareVersions('0.4.0-alpha.1', '0.4.0-beta.1')).toBe(-1)
  })

  it('build metadata는 비교에서 제외한다', () => {
    expect(compareVersions('0.4.0+1', '0.4.0+2')).toBe(0)
  })

  it('더 낮은 버전이면 -1을 반환한다', () => {
    expect(compareVersions('0.2.0', '0.3.0')).toBe(-1)
  })
})

describe('isNewer', () => {
  it('최신이 현재보다 높으면 true', () => {
    expect(isNewer('v0.4.0', '0.3.1')).toBe(true)
  })

  it('같으면 false', () => {
    expect(isNewer('0.3.1', '0.3.1')).toBe(false)
  })

  it('현재가 더 높으면 false (다운그레이드 미감지)', () => {
    expect(isNewer('0.3.0', '0.3.1')).toBe(false)
  })

  it('현재가 prerelease이고 최신이 stable이면 true', () => {
    expect(isNewer('0.4.0', '0.4.0-beta.1')).toBe(true)
  })
})
