import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUiStore } from '../uiStore'

describe('uiStore update settings', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    useUiStore.setState({
      autoCheckForUpdates: true,
      autoDownloadUpdates: false,
      updateState: { status: 'idle' },
      showUpdateModal: false
    })
  })

  it('자동 확인은 기본 ON, 자동 다운로드는 기본 OFF이다', () => {
    expect(useUiStore.getState().autoCheckForUpdates).toBe(true)
    expect(useUiStore.getState().autoDownloadUpdates).toBe(false)
  })

  it('자동 업데이트 설정 변경을 localStorage에 저장한다', () => {
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { setItem, getItem: vi.fn(() => null) })

    useUiStore.getState().setAutoCheckForUpdates(false)
    useUiStore.getState().setAutoDownloadUpdates(true)

    expect(setItem).toHaveBeenCalledWith('autoCheckForUpdates', 'false')
    expect(setItem).toHaveBeenCalledWith('autoDownloadUpdates', 'true')
  })

  it('업데이트 진행 이벤트는 모달을 표시한다', () => {
    useUiStore.getState().setUpdateState({ status: 'available', latestVersion: '0.4.1' })
    expect(useUiStore.getState().showUpdateModal).toBe(true)

    useUiStore.getState().setUpdateState({ status: 'downloading', latestVersion: '0.4.1' })
    expect(useUiStore.getState().showUpdateModal).toBe(true)

    useUiStore.getState().setUpdateState({ status: 'downloaded', latestVersion: '0.4.1' })
    expect(useUiStore.getState().showUpdateModal).toBe(true)
  })

  it('업데이트 없음 이벤트는 모달을 닫는다', () => {
    useUiStore.getState().setUpdateState({ status: 'not-available' })

    expect(useUiStore.getState().showUpdateModal).toBe(false)
  })
})
