import { describe, expect, it } from 'vitest'
import { configureGitEnvironment } from '../gitEnvironment'

describe('configureGitEnvironment', () => {
  it('기존 Git 및 SSH 환경을 보존하고 출력 로케일만 C로 고정한다', () => {
    const environment: NodeJS.ProcessEnv = {
      PATH: 'D:\\Program Files\\Git\\cmd',
      USERPROFILE: 'C:\\Users\\tester',
      SSH_AUTH_SOCK: '\\\\.\\pipe\\openssh-ssh-agent',
      GIT_SSH_COMMAND: 'ssh -F custom-config',
      LC_ALL: 'ko_KR.UTF-8',
      LANG: 'ko_KR.UTF-8',
      LANGUAGE: 'ko'
    }

    configureGitEnvironment(environment)

    expect(environment).toMatchObject({
      PATH: 'D:\\Program Files\\Git\\cmd',
      USERPROFILE: 'C:\\Users\\tester',
      SSH_AUTH_SOCK: '\\\\.\\pipe\\openssh-ssh-agent',
      GIT_SSH_COMMAND: 'ssh -F custom-config',
      LC_ALL: 'C',
      LANG: 'C',
      LANGUAGE: 'C'
    })
  })
})
