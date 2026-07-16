// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitApi } from '../../../../shared/api'
import type { GitHubAccountStateDto } from '../../../../shared/types'
import i18n from '../../i18n'
import { useRepoStore } from '../../stores/repoStore'
import { useUiStore } from '../../stores/uiStore'
import { SettingsModal } from '../SettingsModal'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const READY_STATE: GitHubAccountStateDto = {
  isGitHubRepository: true,
  remoteName: 'origin',
  remoteUrl: 'https://alice@github.com/acme/project-with-a-very-long-name.git',
  transport: 'https',
  accounts: ['alice', 'bob'],
  selectedAccount: 'alice',
  recoveryAvailable: true,
  accountSwitchAvailable: true,
  unavailableReason: null
}

let container: HTMLDivElement
let root: Root
let getGitHubAccountState: ReturnType<typeof vi.fn>
let switchGitHubAccount: ReturnType<typeof vi.fn>

function render(): void {
  act(() => root.render(<SettingsModal />))
}

function button(label: string): HTMLButtonElement {
  const target = [...container.querySelectorAll('button')].find((item) => item.textContent === label)
  expect(target).toBeDefined()
  return target!
}

describe('SettingsModal GitHub account', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ko')
    getGitHubAccountState = vi.fn().mockResolvedValue(READY_STATE)
    switchGitHubAccount = vi.fn().mockResolvedValue({ ...READY_STATE, selectedAccount: 'bob' })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        getGitHubAccountState,
        switchGitHubAccount,
        openExternal: vi.fn(),
        checkForUpdates: vi.fn()
      } as unknown as GitApi
    })
    useRepoStore.setState({ repo: { path: 'C:\\repo', name: 'repo' } })
    useUiStore.setState({ showSettings: true, toasts: [], confirm: null })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    useRepoStore.setState({ repo: null })
    useUiStore.setState({ showSettings: false, toasts: [], confirm: null })
  })

  it('현재 remote·계정과 GCM 계정 선택지를 표시한다', async () => {
    render()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain('GitHub 계정')
    expect(container.textContent).toContain('origin')
    expect(container.textContent).toContain('alice')
    const select = container.querySelector<HTMLSelectElement>('#github-account-select')
    expect(select?.value).toBe('alice')
    expect([...select!.options].map((option) => option.value)).toEqual(['', 'alice', 'bob'])
    expect(container.querySelector('.break-all')?.textContent).toContain('project-with-a-very-long-name')
  })

  it('선택한 GCM 계정으로 전환하고 완료 상태를 반영한다', async () => {
    render()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    const select = container.querySelector<HTMLSelectElement>('#github-account-select')!
    act(() => {
      select.value = 'bob'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await act(async () => {
      button('계정 전환').click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(switchGitHubAccount).toHaveBeenCalledWith('bob')
    expect(useUiStore.getState().toasts).toContainEqual(
      expect.objectContaining({ message: 'GitHub 계정을 전환했습니다', kind: 'success' })
    )
  })

  it('저장소가 열려 있지 않으면 계정 전환 안내만 표시한다', () => {
    useRepoStore.setState({ repo: null })
    render()

    expect(container.textContent).toContain('저장소를 열면 계정을 전환할 수 있습니다')
    expect(container.querySelector('#github-account-select')).toBe(null)
  })

  it('SSH 원격은 이유를 표시하고 전환 컨트롤을 숨긴다', async () => {
    getGitHubAccountState.mockResolvedValue({
      ...READY_STATE,
      remoteUrl: 'git@github.com:acme/project.git',
      transport: 'ssh',
      accountSwitchAvailable: false,
      unavailableReason: 'SSH_UNSUPPORTED'
    })
    render()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain('계정 전환은 HTTPS만 지원합니다')
    expect(container.querySelector('#github-account-select')).toBe(null)
  })
})
