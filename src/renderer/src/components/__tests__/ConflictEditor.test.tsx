// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConflictFileDto } from '../../../../shared/types'
import '../../i18n'
import { useUiStore } from '../../stores/uiStore'
import { ConflictEditor } from '../ConflictEditor'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../CodeEditor', () => ({
  CodeEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea aria-label="conflict-output" value={value} onChange={(event) => onChange(event.currentTarget.value)} />
  )
}))

const A_CONTENT = `base
<<<<<<< HEAD
A ours
=======
A theirs
>>>>>>> feature/a
end
`

const B_CONTENT = `base
<<<<<<< HEAD
B ours
=======
B theirs
>>>>>>> feature/b
end
`

interface TestApi {
  readConflictFile: ReturnType<typeof vi.fn>
  resolveConflictSide: ReturnType<typeof vi.fn>
  saveResolved: ReturnType<typeof vi.fn>
}

let roots: Root[] = []
let api: TestApi

beforeEach(() => {
  localStorage.setItem('lang', 'en')
  api = {
    readConflictFile: vi.fn(),
    resolveConflictSide: vi.fn().mockResolvedValue(undefined),
    saveResolved: vi.fn().mockResolvedValue(undefined)
  }
  Object.defineProperty(window, 'api', {
    value: api as unknown as Window['api'],
    configurable: true
  })
})

afterEach(() => {
  for (const root of roots) {
    act(() => root.unmount())
  }
  roots = []
  document.body.innerHTML = ''
  useUiStore.setState({
    conflictFile: null,
    toasts: [],
    confirm: null,
    selected: null,
    diffView: null,
    diffRequest: null,
    pending: {}
  })
  vi.restoreAllMocks()
})

describe('ConflictEditor', () => {
  it('늦게 도착한 이전 파일 응답으로 현재 draft를 덮지 않는다', async () => {
    const a = deferred<ConflictFileDto>()
    const b = deferred<ConflictFileDto>()
    api.readConflictFile.mockImplementation((path: string) => (path === 'a.txt' ? a.promise : b.promise))
    const { container } = renderEditor()

    act(() => useUiStore.getState().openConflict('a.txt'))
    await flush()
    act(() => useUiStore.getState().openConflict('b.txt'))
    await flush()

    await act(async () => {
      b.resolve(conflictFile('b.txt', B_CONTENT))
      await b.promise
    })
    expect(output(container).value).toContain('B ours')

    await act(async () => {
      a.resolve(conflictFile('a.txt', A_CONTENT))
      await a.promise
    })
    expect(output(container).value).toContain('B ours')
    expect(output(container).value).not.toContain('A ours')
  })

  it('미해결 draft는 저장할 수 없고 해결 후에만 저장 버튼을 연다', async () => {
    api.readConflictFile.mockResolvedValue(conflictFile('a.txt', A_CONTENT))
    const { container } = renderEditor()

    act(() => useUiStore.getState().openConflict('a.txt'))
    await flush()

    expect(saveButton(container).disabled).toBe(true)

    await act(async () => {
      checkbox(container, 0).click()
    })

    expect(output(container).value).toBe('base\nA ours\nend\n')
    expect(saveButton(container).disabled).toBe(false)
  })

  it('수동 수정 후 선택 변경은 확인 없이 output을 덮지 않는다', async () => {
    api.readConflictFile.mockResolvedValue(conflictFile('a.txt', A_CONTENT))
    const { container } = renderEditor()

    act(() => useUiStore.getState().openConflict('a.txt'))
    await flush()
    await act(async () => {
      checkbox(container, 0).click()
    })
    await act(async () => {
      editOutput(container, 'manual resolution')
    })
    await act(async () => {
      checkbox(container, 1).click()
    })

    expect(useUiStore.getState().confirm?.message).toContain('Discard manual edits')
    expect(output(container).value).toBe('manual resolution')
  })

  it('선택한 draft를 닫을 때 폐기 확인을 요청한다', async () => {
    api.readConflictFile.mockResolvedValue(conflictFile('a.txt', A_CONTENT))
    const { container } = renderEditor()
    act(() => useUiStore.getState().openConflict('a.txt'))
    await flush()
    await act(async () => checkbox(container, 0).click())
    const close = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Close')
    )
    if (!close) throw new Error('close button not found')

    await act(async () => close.click())

    expect(useUiStore.getState().conflictFile).toBe('a.txt')
    expect(useUiStore.getState().confirm?.message).toContain('Discard the unsaved')
  })

  it('바이너리 충돌은 텍스트로 저장하지 않고 선택한 전체 버전으로 해결한다', async () => {
    api.readConflictFile.mockResolvedValue({
      path: 'image.bin',
      kind: 'binary',
      content: null,
      oursExists: true,
      theirsExists: true
    } satisfies ConflictFileDto)
    const { container } = renderEditor()

    act(() => useUiStore.getState().openConflict('image.bin'))
    await flush()

    expect(container.querySelector('textarea')).toBeNull()
    const useTheirs = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Use theirs')
    )
    if (!useTheirs) throw new Error('use theirs button not found')
    await act(async () => useTheirs.click())

    expect(api.resolveConflictSide).toHaveBeenCalledWith('image.bin', 'theirs')
    expect(api.saveResolved).not.toHaveBeenCalled()
    expect(useUiStore.getState().conflictFile).toBeNull()
  })

  it('marker가 없는 텍스트 충돌도 파일 전체 선택만 허용한다', async () => {
    api.readConflictFile.mockResolvedValue(conflictFile('deleted.txt', 'plain text\n', false))
    const { container } = renderEditor()

    act(() => useUiStore.getState().openConflict('deleted.txt'))
    await flush()

    expect(container.textContent).toContain('no text conflict markers')
    expect(container.querySelector('textarea')).toBeNull()
  })
})

function conflictFile(path: string, content: string, theirsExists = true): ConflictFileDto {
  return {
    path,
    kind: 'text',
    content,
    oursExists: true,
    theirsExists
  }
}

function renderEditor(): { container: HTMLDivElement } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<ConflictEditor />))
  return { container }
}

function output(container: HTMLElement): HTMLTextAreaElement {
  const element = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="conflict-output"]')
  if (!element) throw new Error('output textarea not found')
  return element
}

function checkbox(container: HTMLElement, index: number): HTMLInputElement {
  const element = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[index]
  if (!element) throw new Error(`checkbox ${index} not found`)
  return element
}

function saveButton(container: HTMLElement): HTMLButtonElement {
  const element = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes('Save')
  )
  if (!element) throw new Error('save button not found')
  return element
}

function editOutput(container: HTMLElement, value: string): void {
  const element = output(container)
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
  if (!setter) throw new Error('textarea value setter not found')
  setter.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (err: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (err: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
