// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommitDto } from '../../../../shared/types'
import '../../i18n'
import { useRepoStore } from '../../stores/repoStore'
import { useUiStore } from '../../stores/uiStore'
import { CommitDetail } from '../CommitDetail'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface TestApi {
  commitFiles: ReturnType<typeof vi.fn>
  diffCommitFile: ReturnType<typeof vi.fn>
}

const COMMIT: CommitDto = {
  hash: 'abc123',
  parents: [],
  author: 'Test',
  email: 'test@example.com',
  date: '2026-06-22T00:00:00.000Z',
  subject: 'rename',
  body: '',
  refs: []
}

let roots: Root[] = []
let api: TestApi

beforeEach(() => {
  localStorage.setItem('lang', 'en')
  api = {
    commitFiles: vi.fn().mockResolvedValue([
      { kind: 'R', score: 100, oldPath: 'old.txt', path: 'new.txt' }
    ]),
    diffCommitFile: vi.fn().mockResolvedValue('diff text')
  }
  Object.defineProperty(window, 'api', {
    value: api as unknown as Window['api'],
    configurable: true
  })
  useRepoStore.setState({ commits: [COMMIT] })
})

afterEach(() => {
  for (const root of roots) {
    act(() => root.unmount())
  }
  roots = []
  document.body.innerHTML = ''
  useRepoStore.setState({ repo: null, commits: [], branches: [], status: null, stashes: [] })
  useUiStore.setState({
    conflictFile: null,
    toasts: [],
    confirm: null,
    selected: null,
    diffView: null,
    pending: {}
  })
  vi.restoreAllMocks()
})

describe('CommitDetail', () => {
  it('rename file은 새 path로 diff를 조회하고 old -> new 제목을 표시한다', async () => {
    const { container } = renderCommitDetail()
    await flush()

    const button = fileButton(container, 'old.txt -> new.txt')
    await act(async () => {
      button.click()
      await Promise.resolve()
    })

    expect(api.diffCommitFile).toHaveBeenCalledWith('abc123', 'new.txt')
    expect(useUiStore.getState().diffView).toEqual({
      title: 'old.txt -> new.txt',
      text: 'diff text',
      targetKey: 'commit:abc123:new.txt'
    })
  })
})

function renderCommitDetail(): { container: HTMLDivElement } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<CommitDetail hash="abc123" />))
  return { container }
}

function fileButton(container: HTMLElement, title: string): HTMLButtonElement {
  const element = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.title === title
  )
  if (!element) throw new Error(`file button not found: ${title}`)
  return element
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}
