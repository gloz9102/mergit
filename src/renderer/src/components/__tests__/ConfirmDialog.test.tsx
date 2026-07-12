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
})
