// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StatusDto } from '../../../../shared/types'
import '../../i18n'
import { useRepoStore } from '../../stores/repoStore'
import { useUiStore } from '../../stores/uiStore'
import { StagingPanel } from '../StagingPanel'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface TestApi {
  diffWorkingFile: ReturnType<typeof vi.fn>
}

let roots: Root[] = []
let api: TestApi

beforeEach(() => {
  localStorage.setItem('lang', 'en')
  api = {
    diffWorkingFile: vi.fn()
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
  useRepoStore.setState({
    repo: null,
    commits: [],
    branches: [],
    status: null,
    stashes: [],
    repoGeneration: 0
  })
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

describe('StagingPanel diff lifecycle', () => {
  it('늦게 도착한 이전 diff response가 최신 diff를 덮지 않는다', async () => {
    const a = deferred<string>()
    const b = deferred<string>()
    api.diffWorkingFile.mockImplementation((path: string) => (path === 'a.txt' ? a.promise : b.promise))
    const { container } = renderStagingPanel(statusWithFiles([
      file('a.txt', ' ', 'M'),
      file('b.txt', ' ', 'M')
    ]))

    await clickFile(container, 'a.txt')
    await clickFile(container, 'b.txt')

    await resolveDeferred(b, 'diff b')
    expect(useUiStore.getState().diffView).toMatchObject({
      title: 'b.txt',
      text: 'diff b',
      targetKey: 'working:unstaged:b.txt'
    })

    await resolveDeferred(a, 'diff a')
    expect(useUiStore.getState().diffView).toMatchObject({
      title: 'b.txt',
      text: 'diff b',
      targetKey: 'working:unstaged:b.txt'
    })
  })

  it('repository generation 변경 후 old diff response를 표시하지 않는다', async () => {
    const pending = deferred<string>()
    api.diffWorkingFile.mockReturnValue(pending.promise)
    const { container } = renderStagingPanel(statusWithFiles([file('a.txt', ' ', 'M')]))

    await clickFile(container, 'a.txt')
    act(() => useRepoStore.setState({ repoGeneration: 2 }))
    await resolveDeferred(pending, 'old diff')

    expect(useUiStore.getState().diffView).toBe(null)
    expect(useUiStore.getState().diffRequest).toBe(null)
  })

  it('component unmount 후 late response가 panel을 다시 열지 않는다', async () => {
    const pending = deferred<string>()
    api.diffWorkingFile.mockReturnValue(pending.promise)
    const { container, root } = renderStagingPanel(statusWithFiles([file('a.txt', ' ', 'M')]))

    await clickFile(container, 'a.txt')
    act(() => root.unmount())
    await resolveDeferred(pending, 'late diff')

    expect(useUiStore.getState().diffView).toBe(null)
    expect(useUiStore.getState().diffRequest).toBe(null)
  })

  it('staged와 unstaged의 동일 path diff identity를 구분한다', async () => {
    api.diffWorkingFile.mockResolvedValue('diff text')
    const { container } = renderStagingPanel(statusWithFiles([file('same.txt', 'M', 'M')]))
    const buttons = fileButtons(container, 'same.txt')

    await act(async () => {
      buttons[1].click()
      await Promise.resolve()
    })

    expect(api.diffWorkingFile).toHaveBeenCalledWith('same.txt', true)
    expect(useUiStore.getState().diffView?.targetKey).toBe('working:staged:same.txt')
    expect(buttons[0].className).not.toContain('bg-zinc-700')
    expect(buttons[1].className).toContain('bg-zinc-700')
  })

  it('부분 스테이징 파일 변경 취소는 staged 변경 보존을 안내한다', async () => {
    api.diffWorkingFile.mockResolvedValue('')
    const { container } = renderStagingPanel(statusWithFiles([file('same.txt', 'M', 'M')]))
    const discard = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Discard')
    )
    if (!discard) throw new Error('discard button not found')

    await act(async () => discard.click())

    expect(useUiStore.getState().confirm?.message).toContain('Staged changes will be preserved')
  })
})

function renderStagingPanel(status: StatusDto): { container: HTMLDivElement; root: Root } {
  useRepoStore.setState({
    repo: { path: 'C:/repo', name: 'repo' },
    repoGeneration: 1,
    status,
    commits: []
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<StagingPanel />))
  return { container, root }
}

function statusWithFiles(files: StatusDto['files']): StatusDto {
  return {
    current: 'main',
    files,
    conflicted: [],
    operation: null,
    ahead: 0,
    behind: 0,
    tracking: null
  }
}

function file(path: string, index: string, workingDir: string): StatusDto['files'][number] {
  return { path, index, workingDir, isConflicted: false }
}

async function clickFile(container: HTMLElement, title: string, index = 0): Promise<void> {
  const button = fileButtons(container, title)[index]
  await act(async () => {
    button.click()
    await Promise.resolve()
  })
}

function fileButtons(container: HTMLElement, title: string): HTMLButtonElement[] {
  const buttons = [...container.querySelectorAll<HTMLButtonElement>('button')].filter(
    (button) => button.title === title
  )
  if (buttons.length === 0) throw new Error(`file button not found: ${title}`)
  return buttons
}

async function resolveDeferred<T>(item: Deferred<T>, value: T): Promise<void> {
  await act(async () => {
    item.resolve(value)
    await item.promise
    await Promise.resolve()
  })
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (err: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (err: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
