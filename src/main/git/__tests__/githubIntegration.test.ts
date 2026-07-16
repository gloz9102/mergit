import { describe, expect, it } from 'vitest'
import {
  accountStateFromSnapshot,
  parseGcmAccounts,
  parseGitHubRemoteUrl,
  withGitHubAccount
} from '../githubIntegration'

const SNAPSHOT = {
  branch: 'main',
  upstream: 'origin/main',
  remoteName: 'origin',
  fetchUrls: ['https://github.com/acme/project.git'],
  pushUrls: []
}

describe('GitHub integration helpers', () => {
  it('GCM 계정 목록의 공백과 중복을 제거한다', () => {
    expect(parseGcmAccounts('alice\r\nbob\nalice\n\n')).toEqual(['alice', 'bob'])
  })

  it('HTTPS와 SSH GitHub 원격을 구분한다', () => {
    expect(parseGitHubRemoteUrl('https://alice@github.com/acme/project.git')).toMatchObject({
      isGitHub: true,
      transport: 'https',
      account: 'alice',
      hasPassword: false
    })
    expect(parseGitHubRemoteUrl('git@github.com:acme/project.git')).toMatchObject({
      isGitHub: true,
      transport: 'ssh',
      account: null
    })
  })

  it('HTTPS 원격 계정을 지정하거나 시스템 기본으로 복원한다', () => {
    const selected = withGitHubAccount('https://github.com/acme/project.git', 'alice')
    expect(selected).toBe('https://alice@github.com/acme/project.git')
    expect(withGitHubAccount(selected, null)).toBe('https://github.com/acme/project.git')
  })

  it('URL에 비밀번호가 있으면 노출하지 않고 전환을 차단한다', () => {
    const parsed = parseGitHubRemoteUrl('https://alice:secret@github.com/acme/project.git')
    expect(parsed.hasPassword).toBe(true)
    expect(parsed.sanitizedUrl).not.toContain('secret')
    expect(() =>
      withGitHubAccount('https://alice:secret@github.com/acme/project.git', 'bob')
    ).toThrow(/credential-free/i)
  })

  it('단일 GitHub HTTPS upstream과 GCM 계정이 있으면 전환 가능 상태다', () => {
    expect(accountStateFromSnapshot(SNAPSHOT, null, ['alice'], true)).toEqual({
      isGitHubRepository: true,
      remoteName: 'origin',
      remoteUrl: 'https://github.com/acme/project.git',
      transport: 'https',
      accounts: ['alice'],
      selectedAccount: null,
      recoveryAvailable: true,
      accountSwitchAvailable: true,
      unavailableReason: null
    })
  })

  it('upstream 없이 origin만 GitHub이면 복구만 허용한다', () => {
    expect(
      accountStateFromSnapshot(
        null,
        'https://github.com/acme/project.git',
        ['alice'],
        true
      )
    ).toMatchObject({
      isGitHubRepository: true,
      recoveryAvailable: true,
      accountSwitchAvailable: false,
      unavailableReason: 'NO_UPSTREAM'
    })
  })

  it('SSH와 다중 URL은 계정 전환을 차단한다', () => {
    expect(
      accountStateFromSnapshot(
        { ...SNAPSHOT, fetchUrls: ['git@github.com:acme/project.git'] },
        null,
        ['alice'],
        true
      ).unavailableReason
    ).toBe('SSH_UNSUPPORTED')
    expect(
      accountStateFromSnapshot(
        {
          ...SNAPSHOT,
          fetchUrls: [
            'https://github.com/acme/project.git',
            'https://github.com/acme/mirror.git'
          ]
        },
        null,
        ['alice'],
        true
      ).unavailableReason
    ).toBe('COMPLEX_REMOTE')
  })

  it('GCM을 사용할 수 없거나 저장 계정이 없으면 이유를 구분한다', () => {
    expect(
      accountStateFromSnapshot(SNAPSHOT, null, [], false).unavailableReason
    ).toBe('GCM_UNAVAILABLE')
    expect(
      accountStateFromSnapshot(SNAPSHOT, null, [], true).unavailableReason
    ).toBe('NO_ACCOUNTS')
  })

  it('GitHub가 아닌 upstream은 복구와 계정 전환을 모두 차단한다', () => {
    expect(
      accountStateFromSnapshot(
        { ...SNAPSHOT, fetchUrls: ['https://gitlab.com/acme/project.git'] },
        null,
        ['alice'],
        true
      )
    ).toMatchObject({
      isGitHubRepository: false,
      recoveryAvailable: false,
      accountSwitchAvailable: false,
      unavailableReason: 'NOT_GITHUB'
    })
  })
})
