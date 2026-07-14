// @vitest-environment jsdom
import { act, Fragment } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitApi } from '../../../../shared/api'
import i18n from '../../i18n'
import { useUiStore } from '../../stores/uiStore'
import { ConfirmDialog } from '../ConfirmDialog'
import { Toasts } from '../Toasts'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const BUG_REPORT_URL = 'https://github.com/gloz9102/mergit/issues/new?template=bug_report.yml'

let container: HTMLDivElement
let root: Root
let copyToClipboard: ReturnType<typeof vi.fn>
let openExternal: ReturnType<typeof vi.fn>

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
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { copyToClipboard, openExternal } as unknown as GitApi
    })
    useUiStore.setState({ toasts: [], confirm: null })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    useUiStore.setState({ toasts: [], confirm: null })
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
})
