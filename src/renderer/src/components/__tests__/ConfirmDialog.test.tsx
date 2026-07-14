// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { useUiStore } from '../../stores/uiStore'
import { ConfirmDialog } from '../ConfirmDialog'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('ConfirmDialog accessibility', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    useUiStore.setState({ confirm: null })
  })

  it('취소 버튼에 초기 focus를 두고 Escape로 닫은 뒤 기존 focus를 복원한다', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onConfirm = vi.fn()
    act(() => {
      useUiStore.getState().ask('Delete changes?', onConfirm)
      root.render(<ConfirmDialog />)
    })

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')
    const cancel = container.querySelector<HTMLElement>('[data-dialog-initial-focus]')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(cancel)

    act(() => dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))

    expect(useUiStore.getState().confirm).toBe(null)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(opener)
    act(() => root.unmount())
  })

  it('기본 확인 작업은 두 줄 문구와 primary 동작 색상을 지원한다', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
      useUiStore.getState().ask('로그 복사되었습니다.\ngithub 이슈에 업로드 하시겠습니까?', vi.fn(), 'primary')
      root.render(<ConfirmDialog />)
    })

    const message = container.querySelector('#confirm-dialog-message')
    const confirm = container.querySelectorAll('button')[1]
    expect(message?.textContent).toBe('로그 복사되었습니다.\ngithub 이슈에 업로드 하시겠습니까?')
    expect(message?.className).toContain('whitespace-pre-line')
    expect(message?.querySelector('br')).toBe(null)
    expect(confirm?.className).toContain('bg-emerald-700')

    act(() => root.unmount())
  })
})
