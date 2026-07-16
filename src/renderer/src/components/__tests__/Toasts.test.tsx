// @vitest-environment jsdom
import { act, Fragment } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitApi } from '../../../../shared/api'
import i18n from '../../i18n'
import {
  useRepoStore,
  type RefreshOptions,
  type RefreshScope
} from '../../stores/repoStore'
import { useUiStore } from '../../stores/uiStore'
import { ConfirmDialog } from '../ConfirmDialog'
import { Toasts } from '../Toasts'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const BUG_REPORT_URL = 'https://github.com/gloz9102/mergit/issues/new?template=bug_report.yml'

let container: HTMLDivElement
let root: Root
let copyToClipboard: ReturnType<typeof vi.fn>
let openExternal: ReturnType<typeof vi.fn>
let getGitHubAccountState: ReturnType<typeof vi.fn>
let recoverGitHub: ReturnType<typeof vi.fn>
let refresh: (scope?: RefreshScope, options?: RefreshOptions) => Promise<void>

function button(label: string): HTMLButtonElement {
  const target = [...container.querySelectorAll('button')].find((item) => item.textContent === label)
  expect(target).toBeDefined()
  return target!
}

function render(): void {
  act(() => {
    root.render(
      <Fragment>
        <Toasts />
        <ConfirmDialog />
      </Fragment>
    )
  })
}

describe('Toasts error log copy', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    await i18n.changeLanguage('ko')
    copyToClipboard = vi.fn().mockResolvedValue(undefined)
    openExternal = vi.fn().mockResolvedValue(undefined)
    getGitHubAccountState = vi.fn().mockResolvedValue({
      isGitHubRepository: false,
      remoteName: null,
      remoteUrl: null,
      transport: 'none',
      accounts: [],
      selectedAccount: null,
      recoveryAvailable: false,
      accountSwitchAvailable: false,
      unavailableReason: 'NO_UPSTREAM'
    })
    recoverGitHub = vi.fn()
    refresh = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        copyToClipboard,
        openExternal,
        getGitHubAccountState,
        recoverGitHub
      } as unknown as GitApi
    })
    useUiStore.setState({ toasts: [], confirm: null })
    useRepoStore.setState({
      repo: { path: 'C:\\repo', name: 'repo' },
      refresh
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    useUiStore.setState({ toasts: [], confirm: null })
    useRepoStore.setState({ repo: null })
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('로그 복사 버튼은 오류 토스트에만 표시한다', () => {
    act(() => {
      useUiStore.getState().pushToast('정보', 'info detail', 'info')
      useUiStore.getState().pushToast('오류', 'error detail', 'error')
    })
    render()

    const copyButtons = [...container.querySelectorAll('button')].filter(
      (item) => item.textContent === '로그 복사'
    )
    expect(copyButtons).toHaveLength(1)
  })

  it('오류 제목과 상세를 복사한 뒤 GitHub 이슈 이동 확인 창을 연다', async () => {
    act(() => useUiStore.getState().pushToast('원격 저장소 작업에 실패했습니다', 'fatal: denied', 'error'))
    render()

    await act(async () => {
      button('로그 복사').click()
      await Promise.resolve()
    })

    expect(copyToClipboard).toHaveBeenCalledWith(
      '원격 저장소 작업에 실패했습니다\n\nfatal: denied'
    )
    expect(useUiStore.getState().confirm).toMatchObject({
      message: '로그 복사되었습니다.\ngithub 이슈에 업로드 하시겠습니까?',
      tone: 'primary'
    })
    expect(container.querySelector('#confirm-dialog-message')?.textContent).toBe(
      '로그 복사되었습니다.\ngithub 이슈에 업로드 하시겠습니까?'
    )

    act(() => button('확인').click())
    await Promise.resolve()

    expect(openExternal).toHaveBeenCalledWith(BUG_REPORT_URL)
  })

  it('클립보드 기록 실패 시 성공 확인 창을 열지 않는다', async () => {
    copyToClipboard.mockRejectedValue({ detail: 'clipboard unavailable' })
    act(() => useUiStore.getState().pushToast('원격 오류', 'fatal: denied', 'error'))
    render()

    await act(async () => {
      button('로그 복사').click()
      await Promise.resolve()
    })

    expect(useUiStore.getState().confirm).toBe(null)
    expect(container.textContent).toContain('로그를 클립보드에 복사하지 못했습니다')
  })

  it('GitHub 원격의 AUTH·REMOTE 오류에만 복구 버튼을 표시한다', async () => {
    getGitHubAccountState.mockResolvedValue({
      isGitHubRepository: true,
      remoteName: 'origin',
      remoteUrl: 'https://github.com/acme/repo.git',
      transport: 'https',
      accounts: ['alice'],
      selectedAccount: 'alice',
      recoveryAvailable: true,
      accountSwitchAvailable: true,
      unavailableReason: null
    })
    act(() => {
      useUiStore.getState().pushToast('원격 오류', 'fatal: denied', 'error', {
        errorCode: 'REMOTE',
        persistent: true
      })
    })
    render()

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(button('GitHub 복구 시도')).toBeDefined()
  })

  it('복구 실행 중 버튼을 잠그고 완료 transcript를 영구 토스트로 표시한다', async () => {
    getGitHubAccountState.mockResolvedValue({
      isGitHubRepository: true,
      remoteName: 'origin',
      remoteUrl: 'https://github.com/acme/repo.git',
      transport: 'https',
      accounts: ['alice'],
      selectedAccount: 'alice',
      recoveryAvailable: true,
      accountSwitchAvailable: true,
      unavailableReason: null
    })
    let resolveRecovery!: (value: { steps: []; transcript: string }) => void
    recoverGitHub.mockReturnValue(
      new Promise((resolve) => {
        resolveRecovery = resolve
      })
    )
    act(() => {
      useUiStore.getState().pushToast('원격 오류', 'fatal: denied', 'error', {
        errorCode: 'REMOTE',
        persistent: true
      })
    })
    render()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    act(() => button('GitHub 복구 시도').click())
    expect(button('복구 시도 중...').disabled).toBe(true)
    expect(button('복구 시도 중...').getAttribute('aria-busy')).toBe('true')

    await act(async () => {
      resolveRecovery({ steps: [], transcript: '[OK] git pull' })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(recoverGitHub).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalled()
    expect(container.textContent).toContain('GitHub 복구 시도가 완료되었습니다')
    expect(container.textContent).toContain('상세 보기')

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(container.textContent).toContain('GitHub 복구 시도가 완료되었습니다')
  })

  it('복구 실패는 오류 코드를 유지해 다시 시도할 수 있다', async () => {
    getGitHubAccountState.mockResolvedValue({
      isGitHubRepository: true,
      remoteName: 'origin',
      remoteUrl: 'https://github.com/acme/repo.git',
      transport: 'https',
      accounts: ['alice'],
      selectedAccount: 'alice',
      recoveryAvailable: true,
      accountSwitchAvailable: true,
      unavailableReason: null
    })
    recoverGitHub.mockRejectedValue({ code: 'AUTH', detail: '[FAILED] git pull\nfatal: denied' })
    act(() => {
      useUiStore.getState().pushToast('원격 오류', 'fatal: denied', 'error', {
        errorCode: 'REMOTE',
        persistent: true
      })
    })
    render()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      button('GitHub 복구 시도').click()
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain('인증에 실패했습니다')
    expect(button('GitHub 복구 시도')).toBeDefined()
  })
})
