# GitKraken 클론 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한국어/영어를 지원하고 3-패널 conflict 해결 에디터를 갖춘 GitKraken 스타일 Electron git 클라이언트를 만든다.

**Architecture:** Electron main 프로세스의 `GitService`(simple-git)가 모든 git 작업을 수행하고, contextBridge 기반 타입드 IPC로 React renderer와 통신한다. 순수 로직(로그 파서, 레인 알고리즘, conflict 파서)은 `src/shared/`에 두고 TDD로 작성한다. 상태는 zustand, i18n은 i18next(ko/en), 스타일은 Tailwind 다크 테마.

**Tech Stack:** electron-vite, Electron, React 18, TypeScript, simple-git, zustand, i18next/react-i18next, Tailwind CSS v4, CodeMirror 6, Vitest

**스펙:** `docs/superpowers/specs/2026-06-11-gitkraken-clone-design.md`

---

## 파일 구조

```
package.json                       # 스크립트: dev/build/test/typecheck
electron.vite.config.ts            # main/preload/renderer 빌드 설정
vitest.config.ts                   # 테스트 설정 (node 환경)
tsconfig.json                      # 단일 tsconfig (src 전체)
src/
  shared/                          # main/renderer 공유 순수 코드 (Electron 의존 금지)
    types.ts                       # 모든 DTO 타입
    api.ts                         # GitApi 인터페이스 + 메서드 이름 목록
    logParser.ts                   # git log 출력 → CommitDto[]
    lanes.ts                       # 커밋 그래프 레인 배치
    conflicts.ts                   # conflict 마커 파서 + Output 빌더
    __tests__/                     # 위 모듈 단위 테스트
  main/
    index.ts                       # BrowserWindow 생성
    ipc.ts                         # IPC 핸들러 등록 (GitService 위임)
    git/
      gitService.ts                # simple-git 래퍼
      errors.ts                    # 에러 → GitErrorDto 매핑
      repoWatcher.ts               # fs.watch 기반 저장소 감시
      __tests__/
        fixtures.ts                # 임시 git 저장소 픽스처 생성기
        gitService.test.ts         # 통합 테스트
  preload/
    index.ts                       # contextBridge로 window.api 노출
  renderer/
    index.html
    src/
      main.tsx                     # React 엔트리 + i18n 초기화
      App.tsx                      # 전체 레이아웃 조립
      index.css                    # Tailwind
      env.d.ts                     # window.api 타입 선언
      i18n.ts                      # i18next 설정 + setLanguage
      locales/ko.json, en.json
      stores/repoStore.ts          # 저장소 데이터 (커밋/브랜치/status/스태시)
      stores/uiStore.ts            # 선택/모달/토스트/확인 다이얼로그
      lib/run.ts                   # 액션 실행 + 에러 토스트 + refresh 헬퍼
      lib/recentRepos.ts           # 최근 저장소 localStorage
      components/
        Toolbar.tsx                # 열기/Pull/Push/Fetch/브랜치/Stash/설정
        EmptyState.tsx             # 저장소 미선택 화면 + 최근 목록
        LeftPanel.tsx              # LOCAL/REMOTE/STASH 트리 + 컨텍스트 메뉴
        GraphView.tsx              # 커밋 그래프 (SVG + 가상 스크롤)
        RightPanel.tsx             # 선택에 따라 CommitDetail/StagingPanel 전환
        CommitDetail.tsx           # 커밋 메타 + 파일 목록 + diff
        StagingPanel.tsx           # staged/unstaged + 커밋
        DiffViewer.tsx             # unified diff 라인 컬러링
        MergeBanner.tsx            # 머지 진행 배너 + abort/commit
        ConflictEditor.tsx         # 3-패널 conflict 해결 모달
        CodeEditor.tsx             # CodeMirror 래퍼
        SettingsModal.tsx          # 언어 전환
        ConfirmDialog.tsx          # 파괴적 작업 확인
        Toasts.tsx                 # 에러/성공 토스트
```

**작업 환경 주의:** `npm`/`npx` 실행이 `Cannot find module '.../restore-node-options.cjs'` 에러로 실패하면 같은 명령을 `env -u NODE_OPTIONS <명령>`으로 재실행한다.

---

### Task 1: 프로젝트 스캐폴딩

electron-vite 기반 빈 Electron+React 앱이 뜨고, vitest가 동작하는 상태를 만든다.

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `vitest.config.ts`, `tsconfig.json`
- Create: `src/main/index.ts`, `src/preload/index.ts`
- Create: `src/renderer/index.html`, `src/renderer/src/main.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/index.css`, `src/renderer/src/env.d.ts`

- [ ] **Step 1: package.json 작성**

```json
{
  "name": "gitkraken-clone",
  "version": "0.1.0",
  "private": true,
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: 의존성 설치**

```bash
npm install react react-dom zustand i18next react-i18next simple-git codemirror @codemirror/state @codemirror/view
npm install -D electron electron-vite vite @vitejs/plugin-react typescript @types/react @types/react-dom @types/node tailwindcss @tailwindcss/vite vitest
```

Expected: 에러 없이 설치 완료 (`npm ls --depth=0`에 위 패키지 표시)

- [ ] **Step 3: 빌드/테스트/TS 설정 파일 작성**

`electron.vite.config.ts`:

```ts
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react(), tailwindcss()]
  }
})
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts']
  }
})
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"],
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src", "electron.vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4: main/preload/renderer 최소 코드 작성**

`src/main/index.ts`:

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

`src/preload/index.ts` (Task 7에서 채운다):

```ts
export {}
```

`src/renderer/index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'" />
    <title>GitKraken Clone</title>
  </head>
  <body class="bg-zinc-900">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/renderer/src/index.css`:

```css
@import 'tailwindcss';
```

`src/renderer/src/main.tsx`:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

`src/renderer/src/App.tsx`:

```tsx
export default function App() {
  return <div className="p-4 text-zinc-200">GitKraken Clone</div>
}
```

`src/renderer/src/env.d.ts` (Task 7에서 window.api 타입 추가):

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 5: 동작 확인**

Run: `npm run typecheck`
Expected: 에러 없음

Run: `npm run dev` (백그라운드로 띄우고 몇 초 후 종료)
Expected: Electron 창이 뜨고 "GitKraken Clone" 텍스트가 다크 배경에 표시됨

Run: `npm test`
Expected: "No test files found" 또는 0 테스트 통과로 정상 종료 (vitest run은 테스트 0개면 exit 1일 수 있음 — `--passWithNoTests`를 일시적으로 붙여 확인)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: electron-vite + React + Tailwind 스캐폴딩"
```

---

### Task 2: 공유 타입 + IPC 계약

main/preload/renderer가 공유하는 모든 DTO와 `GitApi` 인터페이스를 한 곳에 정의한다.

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/api.ts`

- [ ] **Step 1: src/shared/types.ts 작성**

```ts
export interface RepoInfoDto {
  path: string
  name: string
}

export interface CommitDto {
  hash: string
  parents: string[]
  author: string
  email: string
  date: string // ISO 8601
  subject: string
  refs: string[] // 예: ["HEAD -> main", "origin/main"]
}

export interface BranchDto {
  name: string // 로컬: "main", 원격: "origin/main"
  isRemote: boolean
  current: boolean
}

export interface FileStatusDto {
  path: string
  index: string // git status 의 index 컬럼 ('M', 'A', 'D', '?', ' ' 등)
  workingDir: string // working tree 컬럼
  isConflicted: boolean
}

export interface StatusDto {
  current: string | null
  files: FileStatusDto[]
  conflicted: string[]
  merging: boolean
  ahead: number
  behind: number
  tracking: string | null
}

export interface StashDto {
  index: number
  message: string
}

export interface CommitFileDto {
  path: string
  status: string // 'A' | 'M' | 'D' 등 name-status 첫 글자
}

export interface GitErrorDto {
  code: string // 'GIT_ERROR' | 'CONFLICT' | 'AUTH' | 'NOT_A_REPO' | 'REMOTE' | 'NO_REPO'
  message: string
  detail: string
}

export type ConflictSegment =
  | { type: 'context'; lines: string[] }
  | {
      type: 'conflict'
      ours: string[]
      theirs: string[]
      oursLabel: string
      theirsLabel: string
    }

export interface ConflictChoice {
  ours: boolean
  theirs: boolean
}
```

- [ ] **Step 2: src/shared/api.ts 작성**

```ts
import type {
  BranchDto,
  CommitDto,
  CommitFileDto,
  RepoInfoDto,
  StashDto,
  StatusDto
} from './types'

export interface GitApi {
  selectRepo(): Promise<string | null>
  openRepo(path: string): Promise<RepoInfoDto>
  log(): Promise<CommitDto[]>
  status(): Promise<StatusDto>
  branches(): Promise<BranchDto[]>
  commitFiles(hash: string): Promise<CommitFileDto[]>
  diffCommitFile(hash: string, path: string): Promise<string>
  diffWorkingFile(path: string, staged: boolean): Promise<string>
  stage(paths: string[]): Promise<void>
  unstage(paths: string[]): Promise<void>
  discard(paths: string[]): Promise<void>
  commit(message: string): Promise<void>
  commitMerge(): Promise<void>
  createBranch(name: string, checkout: boolean): Promise<void>
  checkoutBranch(name: string): Promise<void>
  deleteBranch(name: string, force: boolean): Promise<void>
  renameBranch(oldName: string, newName: string): Promise<void>
  merge(branch: string): Promise<{ conflicts: boolean }>
  abortMerge(): Promise<void>
  push(): Promise<void>
  pull(): Promise<void>
  fetch(): Promise<void>
  stashSave(message: string): Promise<void>
  stashList(): Promise<StashDto[]>
  stashApply(index: number): Promise<void>
  stashDrop(index: number): Promise<void>
  readWorkingFile(path: string): Promise<string>
  saveResolved(path: string, content: string): Promise<void>
  onRepoChanged(cb: () => void): () => void
}

// preload가 IPC 채널을 자동 생성할 때 쓰는 메서드 목록 (onRepoChanged 제외)
export const GIT_API_METHODS = [
  'selectRepo',
  'openRepo',
  'log',
  'status',
  'branches',
  'commitFiles',
  'diffCommitFile',
  'diffWorkingFile',
  'stage',
  'unstage',
  'discard',
  'commit',
  'commitMerge',
  'createBranch',
  'checkoutBranch',
  'deleteBranch',
  'renameBranch',
  'merge',
  'abortMerge',
  'push',
  'pull',
  'fetch',
  'stashSave',
  'stashList',
  'stashApply',
  'stashDrop',
  'readWorkingFile',
  'saveResolved'
] as const
```

- [ ] **Step 3: typecheck 후 커밋**

Run: `npm run typecheck`
Expected: 에러 없음

```bash
git add src/shared
git commit -m "feat: 공유 DTO 타입과 GitApi IPC 계약 정의"
```

---

### Task 3: 로그 파서 (TDD)

`git log` 커스텀 포맷 출력을 `CommitDto[]`로 파싱한다. 필드 구분자 `\x1f`, 레코드 구분자 `\x1e`.

**Files:**
- Create: `src/shared/logParser.ts`
- Test: `src/shared/__tests__/logParser.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/shared/__tests__/logParser.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseLog } from '../logParser'

const F = '\x1f'
const R = '\x1e'

describe('parseLog', () => {
  it('단일 커밋을 파싱한다', () => {
    const raw = `abc123${F}${F}Kim${F}kim@test.com${F}2026-06-11T10:00:00+09:00${F}initial commit${F}HEAD -> main${R}\n`
    const commits = parseLog(raw)
    expect(commits).toHaveLength(1)
    expect(commits[0]).toEqual({
      hash: 'abc123',
      parents: [],
      author: 'Kim',
      email: 'kim@test.com',
      date: '2026-06-11T10:00:00+09:00',
      subject: 'initial commit',
      refs: ['HEAD -> main']
    })
  })

  it('부모가 여러 개인 머지 커밋을 파싱한다', () => {
    const raw = `m1${F}p1 p2${F}Kim${F}k@t.com${F}2026-06-11T10:00:00+09:00${F}Merge branch 'feature'${F}${R}\n`
    const commits = parseLog(raw)
    expect(commits[0].parents).toEqual(['p1', 'p2'])
    expect(commits[0].refs).toEqual([])
  })

  it('여러 레코드를 파싱하고 빈 레코드는 무시한다', () => {
    const raw = [
      `c2${F}c1${F}A${F}a@t.com${F}2026-06-11T11:00:00+09:00${F}second${F}HEAD -> main, origin/main`,
      `c1${F}${F}A${F}a@t.com${F}2026-06-11T10:00:00+09:00${F}first${F}`
    ].join(R + '\n') + R + '\n'
    const commits = parseLog(raw)
    expect(commits.map((c) => c.hash)).toEqual(['c2', 'c1'])
    expect(commits[0].refs).toEqual(['HEAD -> main', 'origin/main'])
  })

  it('빈 입력이면 빈 배열을 반환한다', () => {
    expect(parseLog('')).toEqual([])
    expect(parseLog('\n')).toEqual([])
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/shared/__tests__/logParser.test.ts`
Expected: FAIL — "Cannot find module '../logParser'" 또는 유사 에러

- [ ] **Step 3: 구현**

`src/shared/logParser.ts`:

```ts
import type { CommitDto } from './types'

// %x1f = 필드 구분자, %x1e = 레코드 구분자
export const LOG_FORMAT = '%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%D%x1e'

export function parseLog(raw: string): CommitDto[] {
  return raw
    .split('\x1e')
    .map((record) => record.replace(/^\n/, ''))
    .filter((record) => record.trim().length > 0)
    .map((record) => {
      const [hash, parents, author, email, date, subject, refs] = record.split('\x1f')
      return {
        hash,
        parents: parents ? parents.split(' ') : [],
        author,
        email,
        date,
        subject,
        refs: refs ? refs.split(', ').filter(Boolean) : []
      }
    })
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/shared/__tests__/logParser.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/shared/logParser.ts src/shared/__tests__/logParser.test.ts
git commit -m "feat: git log 출력 파서"
```

---

### Task 4: 그래프 레인 배치 알고리즘 (TDD)

커밋 리스트(최신순)를 받아 각 커밋의 레인(세로 줄) 번호를 배정한다. 그래프 SVG 렌더링의 기반이다.

**Files:**
- Create: `src/shared/lanes.ts`
- Test: `src/shared/__tests__/lanes.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/shared/__tests__/lanes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { assignLanes } from '../lanes'
import type { CommitDto } from '../types'

function commit(hash: string, parents: string[]): CommitDto {
  return { hash, parents, author: 'A', email: 'a@t.com', date: '', subject: hash, refs: [] }
}

describe('assignLanes', () => {
  it('선형 히스토리는 모두 레인 0', () => {
    const lanes = assignLanes([commit('c3', ['c2']), commit('c2', ['c1']), commit('c1', [])])
    expect(lanes.get('c3')).toBe(0)
    expect(lanes.get('c2')).toBe(0)
    expect(lanes.get('c1')).toBe(0)
  })

  it('브랜치 분기/머지: 머지 커밋의 두 번째 부모 쪽이 새 레인을 받는다', () => {
    // m(merge) -> a(main), b(feature) -> r(root)
    const lanes = assignLanes([
      commit('m', ['a', 'b']),
      commit('a', ['r']),
      commit('b', ['r']),
      commit('r', [])
    ])
    expect(lanes.get('m')).toBe(0)
    expect(lanes.get('a')).toBe(0)
    expect(lanes.get('b')).toBe(1)
    expect(lanes.get('r')).toBe(0) // 머지 후 레인 1은 닫힌다
  })

  it('독립 루트(고아 브랜치)는 별도 레인을 받는다', () => {
    const lanes = assignLanes([commit('x1', []), commit('y1', [])])
    expect(lanes.get('x1')).toBe(0)
    expect(lanes.get('y1')).toBe(0) // x1 레인이 닫혔으므로 재사용
  })

  it('빈 입력은 빈 맵', () => {
    expect(assignLanes([]).size).toBe(0)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/shared/__tests__/lanes.test.ts`
Expected: FAIL — "Cannot find module '../lanes'"

- [ ] **Step 3: 구현**

`src/shared/lanes.ts`:

```ts
import type { CommitDto } from './types'

// commits는 git log 순서(최신 → 과거). lanes[i]에는 그 레인이 다음에
// 기다리는 커밋 해시가 들어 있고, null이면 빈 레인이다.
export function assignLanes(commits: CommitDto[]): Map<string, number> {
  const lanes: (string | null)[] = []
  const result = new Map<string, number>()

  for (const c of commits) {
    let lane = lanes.indexOf(c.hash)
    if (lane === -1) {
      lane = lanes.indexOf(null)
      if (lane === -1) {
        lane = lanes.length
        lanes.push(null)
      }
    }
    result.set(c.hash, lane)

    // 같은 커밋을 기다리던 다른 레인(머지된 브랜치)을 닫는다
    for (let i = 0; i < lanes.length; i++) {
      if (i !== lane && lanes[i] === c.hash) lanes[i] = null
    }

    // 첫 부모는 현재 레인을 잇고, 나머지 부모는 새 레인을 예약한다
    const [first, ...rest] = c.parents
    lanes[lane] = first ?? null
    for (const p of rest) {
      if (!lanes.includes(p)) {
        const free = lanes.indexOf(null)
        if (free === -1) lanes.push(p)
        else lanes[free] = p
      }
    }
  }
  return result
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/shared/__tests__/lanes.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/shared/lanes.ts src/shared/__tests__/lanes.test.ts
git commit -m "feat: 커밋 그래프 레인 배치 알고리즘"
```

---

### Task 5: Conflict 마커 파서 + Output 빌더 (TDD)

충돌 파일 내용을 context/conflict 세그먼트로 분해하고, 사용자의 Ours/Theirs 선택으로 결과 텍스트를 만든다. ConflictEditor의 핵심 로직.

**Files:**
- Create: `src/shared/conflicts.ts`
- Test: `src/shared/__tests__/conflicts.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/shared/__tests__/conflicts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildOutput, parseConflicts } from '../conflicts'

const SIMPLE = `line1
<<<<<<< HEAD
ours line
=======
theirs line
>>>>>>> feature/api
line2
`

describe('parseConflicts', () => {
  it('단일 충돌 블록을 분해한다', () => {
    const segs = parseConflicts(SIMPLE)
    expect(segs).toEqual([
      { type: 'context', lines: ['line1'] },
      {
        type: 'conflict',
        ours: ['ours line'],
        theirs: ['theirs line'],
        oursLabel: 'HEAD',
        theirsLabel: 'feature/api'
      },
      { type: 'context', lines: ['line2', ''] }
    ])
  })

  it('충돌이 없으면 context 하나만 반환한다', () => {
    const segs = parseConflicts('a\nb\n')
    expect(segs).toEqual([{ type: 'context', lines: ['a', 'b', ''] }])
  })

  it('diff3 스타일의 base 섹션(|||||||)을 무시한다', () => {
    const content = `<<<<<<< HEAD
ours
||||||| merged common ancestors
base
=======
theirs
>>>>>>> feature
`
    const segs = parseConflicts(content)
    expect(segs[0]).toMatchObject({ type: 'conflict', ours: ['ours'], theirs: ['theirs'] })
  })

  it('여러 충돌 블록을 처리한다', () => {
    const content = `<<<<<<< HEAD
a1
=======
b1
>>>>>>> f
mid
<<<<<<< HEAD
a2
=======
b2
>>>>>>> f
`
    const segs = parseConflicts(content)
    const conflicts = segs.filter((s) => s.type === 'conflict')
    expect(conflicts).toHaveLength(2)
  })
})

describe('buildOutput', () => {
  const segs = parseConflicts(SIMPLE)

  it('ours만 선택', () => {
    expect(buildOutput(segs, [{ ours: true, theirs: false }])).toBe('line1\nours line\nline2\n')
  })

  it('둘 다 선택하면 ours → theirs 순서로 포함', () => {
    expect(buildOutput(segs, [{ ours: true, theirs: true }])).toBe(
      'line1\nours line\ntheirs line\nline2\n'
    )
  })

  it('미선택 블록은 비워 둔다', () => {
    expect(buildOutput(segs, [{ ours: false, theirs: false }])).toBe('line1\nline2\n')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/shared/__tests__/conflicts.test.ts`
Expected: FAIL — "Cannot find module '../conflicts'"

- [ ] **Step 3: 구현**

`src/shared/conflicts.ts`:

```ts
import type { ConflictChoice, ConflictSegment } from './types'

export function parseConflicts(content: string): ConflictSegment[] {
  const lines = content.split('\n')
  const segments: ConflictSegment[] = []
  let context: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('<<<<<<<')) {
      if (context.length) {
        segments.push({ type: 'context', lines: context })
        context = []
      }
      const oursLabel = line.slice(7).trim()
      const ours: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('=======') && !lines[i].startsWith('|||||||')) {
        ours.push(lines[i])
        i++
      }
      // diff3 스타일 base 섹션은 ======= 까지 건너뛴다
      if (i < lines.length && lines[i].startsWith('|||||||')) {
        while (i < lines.length && !lines[i].startsWith('=======')) i++
      }
      i++ // '=======' 건너뛰기
      const theirs: string[] = []
      while (i < lines.length && !lines[i].startsWith('>>>>>>>')) {
        theirs.push(lines[i])
        i++
      }
      const theirsLabel = lines[i]?.slice(7).trim() ?? ''
      i++ // '>>>>>>>' 건너뛰기
      segments.push({ type: 'conflict', ours, theirs, oursLabel, theirsLabel })
    } else {
      context.push(line)
      i++
    }
  }
  if (context.length) segments.push({ type: 'context', lines: context })
  return segments
}

// choices는 conflict 세그먼트 순서대로 대응한다
export function buildOutput(segments: ConflictSegment[], choices: ConflictChoice[]): string {
  const out: string[] = []
  let ci = 0
  for (const seg of segments) {
    if (seg.type === 'context') {
      out.push(...seg.lines)
    } else {
      const choice = choices[ci++] ?? { ours: false, theirs: false }
      if (choice.ours) out.push(...seg.ours)
      if (choice.theirs) out.push(...seg.theirs)
    }
  }
  return out.join('\n')
}

export function countConflicts(segments: ConflictSegment[]): number {
  return segments.filter((s) => s.type === 'conflict').length
}

export function countResolved(choices: ConflictChoice[]): number {
  return choices.filter((c) => c.ours || c.theirs).length
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/shared/__tests__/conflicts.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/shared/conflicts.ts src/shared/__tests__/conflicts.test.ts
git commit -m "feat: conflict 마커 파서와 output 빌더"
```

---

### Task 6: GitService + 에러 매핑 (통합 테스트)

simple-git을 감싸 모든 git 작업을 DTO로 반환한다. 실제 임시 저장소 픽스처로 통합 테스트한다.

**Files:**
- Create: `src/main/git/gitService.ts`, `src/main/git/errors.ts`
- Test: `src/main/git/__tests__/fixtures.ts`, `src/main/git/__tests__/gitService.test.ts`

- [ ] **Step 1: 픽스처 헬퍼 작성**

`src/main/git/__tests__/fixtures.ts`:

```ts
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function gitIn(dir: string) {
  return (...args: string[]): string =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf-8' })
}

// 커밋 1개 있는 기본 저장소
export function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gkc-'))
  const git = gitIn(dir)
  git('init', '-b', 'main')
  git('config', 'user.email', 'test@test.com')
  git('config', 'user.name', 'Test')
  git('config', 'commit.gpgsign', 'false')
  writeFileSync(join(dir, 'a.txt'), 'line1\nline2\n')
  git('add', '.')
  git('commit', '-m', 'initial')
  return dir
}

// main과 feature가 같은 줄을 다르게 수정해 머지 시 충돌하는 저장소
export function makeConflictRepo(): string {
  const dir = makeRepo()
  const git = gitIn(dir)
  git('checkout', '-b', 'feature')
  writeFileSync(join(dir, 'a.txt'), 'feature change\nline2\n')
  git('commit', '-am', 'feature edit')
  git('checkout', 'main')
  writeFileSync(join(dir, 'a.txt'), 'main change\nline2\n')
  git('commit', '-am', 'main edit')
  return dir
}
```

- [ ] **Step 2: 실패하는 통합 테스트 작성**

`src/main/git/__tests__/gitService.test.ts`:

```ts
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GitService } from '../gitService'
import { gitIn, makeConflictRepo, makeRepo } from './fixtures'

describe('GitService', () => {
  it('info: git 저장소가 아니면 throw', async () => {
    const svc = new GitService('/tmp')
    await expect(svc.info()).rejects.toThrow()
  })

  it('log: 커밋 목록을 최신순으로 반환한다', async () => {
    const dir = makeRepo()
    const svc = new GitService(dir)
    const commits = await svc.log()
    expect(commits).toHaveLength(1)
    expect(commits[0].subject).toBe('initial')
    expect(commits[0].parents).toEqual([])
  })

  it('status: 수정 파일과 staged 파일을 구분한다', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'changed\n')
    writeFileSync(join(dir, 'new.txt'), 'new\n')
    const svc = new GitService(dir)
    let status = await svc.status()
    expect(status.files.map((f) => f.path).sort()).toEqual(['a.txt', 'new.txt'])
    expect(status.merging).toBe(false)

    await svc.stage(['a.txt'])
    status = await svc.status()
    const a = status.files.find((f) => f.path === 'a.txt')!
    expect(a.index).toBe('M')
  })

  it('stage → commit → log 에 반영된다', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'changed\n')
    const svc = new GitService(dir)
    await svc.stage(['a.txt'])
    await svc.commit('second')
    const commits = await svc.log()
    expect(commits[0].subject).toBe('second')
    expect(commits[0].parents).toHaveLength(1)
  })

  it('branches: 로컬 브랜치와 current 플래그', async () => {
    const dir = makeConflictRepo()
    const svc = new GitService(dir)
    const branches = await svc.branches()
    const names = branches.filter((b) => !b.isRemote).map((b) => b.name).sort()
    expect(names).toEqual(['feature', 'main'])
    expect(branches.find((b) => b.name === 'main')?.current).toBe(true)
  })

  it('createBranch / checkoutBranch / renameBranch / deleteBranch', async () => {
    const dir = makeRepo()
    const svc = new GitService(dir)
    await svc.createBranch('work', false)
    await svc.checkoutBranch('work')
    expect((await svc.status()).current).toBe('work')
    await svc.checkoutBranch('main')
    await svc.renameBranch('work', 'work2')
    await svc.deleteBranch('work2', false)
    const names = (await svc.branches()).map((b) => b.name)
    expect(names).not.toContain('work')
    expect(names).not.toContain('work2')
  })

  it('merge 충돌: conflicts=true, status에 충돌 파일과 merging 플래그', async () => {
    const dir = makeConflictRepo()
    const svc = new GitService(dir)
    const result = await svc.merge('feature')
    expect(result.conflicts).toBe(true)
    const status = await svc.status()
    expect(status.conflicted).toContain('a.txt')
    expect(status.merging).toBe(true)
  })

  it('충돌 해결: saveResolved → commitMerge 로 머지를 끝낸다', async () => {
    const dir = makeConflictRepo()
    const svc = new GitService(dir)
    await svc.merge('feature')
    const content = await svc.readWorkingFile('a.txt')
    expect(content).toContain('<<<<<<<')
    await svc.saveResolved('a.txt', 'resolved\nline2\n')
    const status = await svc.status()
    expect(status.conflicted).toEqual([])
    await svc.commitMerge()
    const after = await svc.status()
    expect(after.merging).toBe(false)
    const commits = await svc.log()
    expect(commits[0].parents).toHaveLength(2)
  })

  it('abortMerge: 머지 전 상태로 돌아간다', async () => {
    const dir = makeConflictRepo()
    const svc = new GitService(dir)
    await svc.merge('feature')
    await svc.abortMerge()
    const status = await svc.status()
    expect(status.merging).toBe(false)
    expect(status.conflicted).toEqual([])
  })

  it('stash save/list/apply/drop', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'wip\n')
    const svc = new GitService(dir)
    await svc.stashSave('my wip')
    expect((await svc.status()).files).toHaveLength(0)
    const list = await svc.stashList()
    expect(list).toHaveLength(1)
    expect(list[0].message).toContain('my wip')
    await svc.stashApply(0)
    expect((await svc.status()).files).toHaveLength(1)
    await svc.stashDrop(0)
    expect(await svc.stashList()).toEqual([])
  })

  it('push/pull: bare 원격 저장소와 동기화한다', async () => {
    const dir = makeRepo()
    const remoteDir = makeRepo()
    gitIn(remoteDir)('config', 'receive.denyCurrentBranch', 'ignore')
    gitIn(dir)('remote', 'add', 'origin', remoteDir)
    const svc = new GitService(dir)
    await svc.push()
    await svc.fetch()
    const branches = await svc.branches()
    expect(branches.some((b) => b.isRemote && b.name === 'origin/main')).toBe(true)
  })

  it('commitFiles / diffCommitFile / diffWorkingFile', async () => {
    const dir = makeRepo()
    const svc = new GitService(dir)
    const [head] = await svc.log()
    const files = await svc.commitFiles(head.hash)
    expect(files).toEqual([{ path: 'a.txt', status: 'A' }])
    const diff = await svc.diffCommitFile(head.hash, 'a.txt')
    expect(diff).toContain('+line1')
    writeFileSync(join(dir, 'a.txt'), 'line1\nline2\nline3\n')
    const wdiff = await svc.diffWorkingFile('a.txt', false)
    expect(wdiff).toContain('+line3')
  })

  it('discard: 수정을 되돌리고 untracked는 삭제한다', async () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'changed\n')
    writeFileSync(join(dir, 'junk.txt'), 'junk\n')
    const svc = new GitService(dir)
    await svc.discard(['a.txt', 'junk.txt'])
    expect((await svc.status()).files).toHaveLength(0)
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run src/main/git/__tests__/gitService.test.ts`
Expected: FAIL — "Cannot find module '../gitService'"

- [ ] **Step 4: errors.ts 구현**

`src/main/git/errors.ts`:

```ts
import type { GitErrorDto } from '../../shared/types'

export function toGitError(err: unknown): GitErrorDto {
  const detail = err instanceof Error ? err.message : String(err)
  const message = detail.split('\n')[0]
  let code = 'GIT_ERROR'
  if (/conflict/i.test(detail)) code = 'CONFLICT'
  else if (/authentication|permission denied|could not read username/i.test(detail)) code = 'AUTH'
  else if (/not a git repository/i.test(detail)) code = 'NOT_A_REPO'
  else if (/couldn't find remote ref|no upstream|unable to access|could not resolve host/i.test(detail))
    code = 'REMOTE'
  else if (/no repository open/i.test(detail)) code = 'NO_REPO'
  return { code, message, detail }
}
```

- [ ] **Step 5: gitService.ts 구현**

`src/main/git/gitService.ts`:

```ts
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { simpleGit, type SimpleGit } from 'simple-git'
import { LOG_FORMAT, parseLog } from '../../shared/logParser'
import type {
  BranchDto,
  CommitDto,
  CommitFileDto,
  RepoInfoDto,
  StashDto,
  StatusDto
} from '../../shared/types'

export class GitService {
  private git: SimpleGit

  constructor(readonly repoPath: string) {
    this.git = simpleGit(repoPath)
  }

  async info(): Promise<RepoInfoDto> {
    const isRepo = await this.git.checkIsRepo()
    if (!isRepo) throw new Error(`not a git repository: ${this.repoPath}`)
    return { path: this.repoPath, name: basename(this.repoPath) }
  }

  async log(): Promise<CommitDto[]> {
    const head = await this.git.raw(['rev-list', '-n', '1', '--all']).catch(() => '')
    if (!head.trim()) return [] // 커밋 0개인 저장소
    const raw = await this.git.raw(['log', '--all', '--date-order', `--format=${LOG_FORMAT}`])
    return parseLog(raw)
  }

  async status(): Promise<StatusDto> {
    const s = await this.git.status()
    return {
      current: s.current ?? null,
      files: s.files.map((f) => ({
        path: f.path,
        index: f.index,
        workingDir: f.working_dir,
        isConflicted: s.conflicted.includes(f.path)
      })),
      conflicted: s.conflicted,
      merging: existsSync(join(this.repoPath, '.git', 'MERGE_HEAD')),
      ahead: s.ahead,
      behind: s.behind,
      tracking: s.tracking ?? null
    }
  }

  async branches(): Promise<BranchDto[]> {
    const all = await this.git.branch(['-a'])
    const result: BranchDto[] = []
    for (const name of all.all) {
      if (name.startsWith('remotes/')) {
        const remoteName = name.slice('remotes/'.length)
        if (!remoteName.endsWith('/HEAD')) {
          result.push({ name: remoteName, isRemote: true, current: false })
        }
      } else {
        result.push({ name, isRemote: false, current: name === all.current })
      }
    }
    return result
  }

  async commitFiles(hash: string): Promise<CommitFileDto[]> {
    const raw = await this.git.raw(['diff-tree', '--no-commit-id', '--name-status', '-r', '--root', hash])
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [status, ...rest] = line.split('\t')
        return { path: rest.join('\t'), status: status[0] }
      })
  }

  async diffCommitFile(hash: string, path: string): Promise<string> {
    return this.git.raw(['show', '--format=', hash, '--', path])
  }

  async diffWorkingFile(path: string, staged: boolean): Promise<string> {
    const args = staged ? ['diff', '--cached', '--', path] : ['diff', '--', path]
    const diff = await this.git.raw(args)
    if (diff.trim()) return diff
    // untracked 파일은 diff가 비므로 전체 내용을 추가 라인으로 표시
    const content = await readFile(join(this.repoPath, path), 'utf-8').catch(() => '')
    return content
      .split('\n')
      .map((l) => `+${l}`)
      .join('\n')
  }

  async stage(paths: string[]): Promise<void> {
    await this.git.add(paths)
  }

  async unstage(paths: string[]): Promise<void> {
    await this.git.raw(['restore', '--staged', '--', ...paths])
  }

  async discard(paths: string[]): Promise<void> {
    const s = await this.git.status()
    const untracked = paths.filter((p) => s.not_added.includes(p))
    const tracked = paths.filter((p) => !s.not_added.includes(p))
    if (tracked.length) await this.git.raw(['checkout', '--', ...tracked])
    if (untracked.length) await this.git.raw(['clean', '-f', '--', ...untracked])
  }

  async commit(message: string): Promise<void> {
    await this.git.commit(message)
  }

  // 머지 커밋: .git/MERGE_MSG의 기본 메시지를 그대로 사용
  async commitMerge(): Promise<void> {
    await this.git.raw(['commit', '--no-edit'])
  }

  async createBranch(name: string, checkout: boolean): Promise<void> {
    if (checkout) await this.git.checkoutLocalBranch(name)
    else await this.git.branch([name])
  }

  // 원격 브랜치는 UI에서 "origin/" 프리픽스를 뗀 이름으로 호출한다
  // (git checkout의 DWIM이 추적 브랜치를 자동 생성)
  async checkoutBranch(name: string): Promise<void> {
    await this.git.checkout(name)
  }

  async deleteBranch(name: string, force: boolean): Promise<void> {
    await this.git.deleteLocalBranch(name, force)
  }

  async renameBranch(oldName: string, newName: string): Promise<void> {
    await this.git.branch(['-m', oldName, newName])
  }

  async merge(branch: string): Promise<{ conflicts: boolean }> {
    try {
      await this.git.merge([branch])
      return { conflicts: false }
    } catch (err) {
      const s = await this.git.status()
      if (s.conflicted.length > 0) return { conflicts: true }
      throw err
    }
  }

  async abortMerge(): Promise<void> {
    await this.git.merge(['--abort'])
  }

  async push(): Promise<void> {
    await this.git.push(['-u', 'origin', 'HEAD'])
  }

  async pull(): Promise<void> {
    await this.git.pull()
  }

  async fetch(): Promise<void> {
    await this.git.fetch(['--all', '--prune'])
  }

  async stashSave(message: string): Promise<void> {
    await this.git.stash(['push', '-m', message || 'WIP'])
  }

  async stashList(): Promise<StashDto[]> {
    const raw = await this.git.raw(['stash', 'list']).catch(() => '')
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line, i) => ({ index: i, message: line.replace(/^stash@\{\d+\}:\s*/, '') }))
  }

  async stashApply(index: number): Promise<void> {
    await this.git.stash(['apply', `stash@{${index}}`])
  }

  async stashDrop(index: number): Promise<void> {
    await this.git.stash(['drop', `stash@{${index}}`])
  }

  async readWorkingFile(path: string): Promise<string> {
    return readFile(join(this.repoPath, path), 'utf-8')
  }

  async saveResolved(path: string, content: string): Promise<void> {
    await writeFile(join(this.repoPath, path), content, 'utf-8')
    await this.git.add([path])
  }
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npx vitest run src/main/git/__tests__/gitService.test.ts`
Expected: PASS (13 tests). 전체도 확인: `npm test` → 모든 테스트 PASS

- [ ] **Step 7: typecheck 후 커밋**

Run: `npm run typecheck`
Expected: 에러 없음

```bash
git add src/main/git
git commit -m "feat: GitService simple-git 래퍼와 통합 테스트"
```

---

### Task 7: IPC 핸들러 + RepoWatcher + preload

main의 GitService를 IPC로 노출하고, 저장소 변경 감시 이벤트를 renderer로 push한다.

**Files:**
- Create: `src/main/ipc.ts`, `src/main/git/repoWatcher.ts`
- Modify: `src/main/index.ts` (registerIpc 호출 추가)
- Modify: `src/preload/index.ts` (window.api 노출)
- Modify: `src/renderer/src/env.d.ts` (window.api 타입)

- [ ] **Step 1: repoWatcher.ts 작성**

`src/main/git/repoWatcher.ts`:

```ts
import { watch, type FSWatcher } from 'node:fs'

// 워킹 트리 + .git 변경을 감시해 debounce 후 콜백 호출.
// .git/objects, .git/logs, *.lock은 노이즈가 심해 무시한다.
export class RepoWatcher {
  private watcher: FSWatcher | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  start(repoPath: string, onChange: () => void): void {
    this.stop()
    this.watcher = watch(repoPath, { recursive: true }, (_event, filename) => {
      const f = filename?.toString() ?? ''
      if (f.startsWith('.git/objects') || f.startsWith('.git/logs') || f.endsWith('.lock')) return
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(onChange, 300)
    })
  }

  stop(): void {
    this.watcher?.close()
    this.watcher = null
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}
```

- [ ] **Step 2: ipc.ts 작성**

핸들러는 `{ ok: true, data } | { ok: false, error: GitErrorDto }` 봉투로 반환한다 (Electron이 reject 에러 메시지를 변형하므로).

`src/main/ipc.ts`:

```ts
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { GIT_API_METHODS } from '../shared/api'
import { toGitError } from './git/errors'
import { GitService } from './git/gitService'
import { RepoWatcher } from './git/repoWatcher'

let service: GitService | null = null
const watcher = new RepoWatcher()

type Envelope = { ok: true; data: unknown } | { ok: false; error: unknown }

export function registerIpc(): void {
  ipcMain.handle('git:selectRepo', async (): Promise<Envelope> => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return { ok: true, data: result.canceled ? null : result.filePaths[0] }
  })

  ipcMain.handle('git:openRepo', async (event, path: string): Promise<Envelope> => {
    try {
      const next = new GitService(path)
      const info = await next.info()
      service = next
      const win = BrowserWindow.fromWebContents(event.sender)
      watcher.start(path, () => win?.webContents.send('repo-changed'))
      return { ok: true, data: info }
    } catch (err) {
      return { ok: false, error: toGitError(err) }
    }
  })

  for (const method of GIT_API_METHODS) {
    if (method === 'selectRepo' || method === 'openRepo') continue
    ipcMain.handle(`git:${method}`, async (_event, ...args: unknown[]): Promise<Envelope> => {
      try {
        if (!service) throw new Error('no repository open')
        const fn = (service as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[method]
        return { ok: true, data: await fn.apply(service, args) }
      } catch (err) {
        return { ok: false, error: toGitError(err) }
      }
    })
  }
}
```

- [ ] **Step 3: main/index.ts에 registerIpc 연결**

`src/main/index.ts`의 `app.whenReady().then(() => {` 바로 다음 줄에 추가:

```ts
import { registerIpc } from './ipc'
// ...
app.whenReady().then(() => {
  registerIpc()
  createWindow()
  // ...
})
```

- [ ] **Step 4: preload 작성**

`src/preload/index.ts` 전체 교체:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { GIT_API_METHODS } from '../shared/api'

type Envelope = { ok: true; data: unknown } | { ok: false; error: unknown }

function unwrap(res: Envelope): unknown {
  if (res.ok) return res.data
  throw res.error // GitErrorDto 그대로 reject
}

const api: Record<string, unknown> = {}
for (const method of GIT_API_METHODS) {
  api[method] = (...args: unknown[]) =>
    ipcRenderer.invoke(`git:${method}`, ...args).then((res: Envelope) => unwrap(res))
}
api['onRepoChanged'] = (cb: () => void) => {
  const listener = (): void => cb()
  ipcRenderer.on('repo-changed', listener)
  return () => ipcRenderer.removeListener('repo-changed', listener)
}

contextBridge.exposeInMainWorld('api', api)
```

- [ ] **Step 5: renderer에 window.api 타입 선언**

`src/renderer/src/env.d.ts` 전체 교체:

```ts
/// <reference types="vite/client" />
import type { GitApi } from '../../shared/api'

declare global {
  interface Window {
    api: GitApi
  }
}

export {}
```

- [ ] **Step 6: 검증 후 커밋**

Run: `npm run typecheck`
Expected: 에러 없음

Run: `npm run dev` 잠깐 띄워 콘솔 에러 없는지 확인 (DevTools 콘솔에서 `window.api.selectRepo` 가 function인지 확인 가능)

```bash
git add -A
git commit -m "feat: IPC 핸들러, RepoWatcher, preload 브리지"
```

---

### Task 8: i18n + zustand 스토어 + run 헬퍼

ko/en 리소스, 저장소/UI 스토어, 모든 git 액션이 공유할 에러 토스트 헬퍼를 만든다.

**Files:**
- Create: `src/renderer/src/i18n.ts`, `src/renderer/src/locales/ko.json`, `src/renderer/src/locales/en.json`
- Create: `src/renderer/src/stores/repoStore.ts`, `src/renderer/src/stores/uiStore.ts`
- Create: `src/renderer/src/lib/run.ts`, `src/renderer/src/lib/recentRepos.ts`
- Modify: `src/renderer/src/main.tsx` (i18n import)

- [ ] **Step 1: 로케일 파일 작성**

`src/renderer/src/locales/ko.json`:

```json
{
  "app": {
    "openRepo": "저장소 열기",
    "noRepo": "git 저장소를 열어 시작하세요",
    "recentRepos": "최근 저장소"
  },
  "toolbar": {
    "pull": "Pull",
    "push": "Push",
    "fetch": "Fetch",
    "branch": "브랜치",
    "stash": "스태시",
    "settings": "설정"
  },
  "panel": {
    "local": "로컬",
    "remote": "원격",
    "stash": "스태시",
    "wip": "작업 중인 변경",
    "unstaged": "스테이지 안 됨",
    "staged": "스테이지됨",
    "commitMessagePlaceholder": "커밋 메시지를 입력하세요",
    "commit": "커밋",
    "stage": "스테이지",
    "unstage": "언스테이지",
    "discard": "변경 취소",
    "files": "변경 파일",
    "noCommitSelected": "커밋을 선택하세요",
    "parents": "부모"
  },
  "branch": {
    "checkout": "체크아웃",
    "mergeInto": "현재 브랜치({{target}})에 머지",
    "delete": "삭제",
    "rename": "이름 변경",
    "create": "새 브랜치",
    "namePlaceholder": "브랜치 이름",
    "deleteConfirm": "'{{name}}' 브랜치를 삭제할까요?",
    "forceDeleteConfirm": "'{{name}}' 브랜치는 머지되지 않았습니다. 강제로 삭제할까요?"
  },
  "merge": {
    "inProgress": "머지 진행 중",
    "conflictedFiles": "충돌 파일 {{count}}개",
    "abort": "머지 중단",
    "abortConfirm": "진행 중인 머지를 중단할까요? 해결한 내용이 사라집니다.",
    "commitMerge": "머지 커밋",
    "resolved": "{{resolved}}/{{total}} 해결됨",
    "ours": "Ours — {{label}}",
    "theirs": "Theirs — {{label}}",
    "output": "결과 (직접 편집 가능)",
    "save": "저장 후 해결 처리",
    "prev": "이전 충돌",
    "next": "다음 충돌"
  },
  "stash": {
    "apply": "적용",
    "drop": "삭제",
    "dropConfirm": "스태시 '{{name}}'을(를) 삭제할까요?"
  },
  "settings": {
    "title": "설정",
    "language": "언어",
    "close": "닫기"
  },
  "common": {
    "confirm": "확인",
    "cancel": "취소",
    "close": "닫기",
    "detail": "상세 보기",
    "discardConfirm": "'{{name}}' 파일의 변경 사항을 되돌릴까요? 복구할 수 없습니다."
  },
  "error": {
    "GIT_ERROR": "Git 작업이 실패했습니다",
    "CONFLICT": "충돌이 발생했습니다",
    "AUTH": "인증에 실패했습니다. 시스템 git 설정(credential helper / SSH 키)을 확인하세요",
    "NOT_A_REPO": "git 저장소가 아닙니다",
    "REMOTE": "원격 저장소 작업에 실패했습니다",
    "NO_REPO": "저장소가 열려 있지 않습니다"
  },
  "toast": {
    "pulled": "Pull 완료",
    "pushed": "Push 완료",
    "fetched": "Fetch 완료",
    "committed": "커밋 완료",
    "merged": "머지 완료",
    "mergeConflict": "충돌이 발생했습니다 — 상단 배너에서 충돌 파일을 해결하세요",
    "branchCreated": "브랜치를 생성했습니다",
    "stashSaved": "스태시에 저장했습니다",
    "resolvedSaved": "해결로 표시했습니다"
  }
}
```

`src/renderer/src/locales/en.json`:

```json
{
  "app": {
    "openRepo": "Open Repository",
    "noRepo": "Open a git repository to get started",
    "recentRepos": "Recent repositories"
  },
  "toolbar": {
    "pull": "Pull",
    "push": "Push",
    "fetch": "Fetch",
    "branch": "Branch",
    "stash": "Stash",
    "settings": "Settings"
  },
  "panel": {
    "local": "LOCAL",
    "remote": "REMOTE",
    "stash": "STASH",
    "wip": "Work in progress",
    "unstaged": "Unstaged",
    "staged": "Staged",
    "commitMessagePlaceholder": "Enter commit message",
    "commit": "Commit",
    "stage": "Stage",
    "unstage": "Unstage",
    "discard": "Discard",
    "files": "Changed files",
    "noCommitSelected": "Select a commit",
    "parents": "Parents"
  },
  "branch": {
    "checkout": "Checkout",
    "mergeInto": "Merge into current ({{target}})",
    "delete": "Delete",
    "rename": "Rename",
    "create": "New branch",
    "namePlaceholder": "Branch name",
    "deleteConfirm": "Delete branch '{{name}}'?",
    "forceDeleteConfirm": "Branch '{{name}}' is not fully merged. Force delete?"
  },
  "merge": {
    "inProgress": "Merge in progress",
    "conflictedFiles": "{{count}} conflicted file(s)",
    "abort": "Abort merge",
    "abortConfirm": "Abort the merge in progress? Your resolutions will be lost.",
    "commitMerge": "Commit merge",
    "resolved": "{{resolved}}/{{total}} resolved",
    "ours": "Ours — {{label}}",
    "theirs": "Theirs — {{label}}",
    "output": "Output (editable)",
    "save": "Save & mark resolved",
    "prev": "Prev conflict",
    "next": "Next conflict"
  },
  "stash": {
    "apply": "Apply",
    "drop": "Drop",
    "dropConfirm": "Drop stash '{{name}}'?"
  },
  "settings": {
    "title": "Settings",
    "language": "Language",
    "close": "Close"
  },
  "common": {
    "confirm": "Confirm",
    "cancel": "Cancel",
    "close": "Close",
    "detail": "Details",
    "discardConfirm": "Discard changes in '{{name}}'? This cannot be undone."
  },
  "error": {
    "GIT_ERROR": "Git operation failed",
    "CONFLICT": "Conflicts detected",
    "AUTH": "Authentication failed. Check your system git credential helper / SSH keys",
    "NOT_A_REPO": "Not a git repository",
    "REMOTE": "Remote operation failed",
    "NO_REPO": "No repository is open"
  },
  "toast": {
    "pulled": "Pull complete",
    "pushed": "Push complete",
    "fetched": "Fetch complete",
    "committed": "Committed",
    "merged": "Merge complete",
    "mergeConflict": "Conflicts detected — resolve files from the banner above",
    "branchCreated": "Branch created",
    "stashSaved": "Saved to stash",
    "resolvedSaved": "Marked as resolved"
  }
}
```

- [ ] **Step 2: i18n.ts 작성**

```ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import ko from './locales/ko.json'

const saved = localStorage.getItem('lang')
const initial = saved ?? (navigator.language.startsWith('ko') ? 'ko' : 'en')

void i18n.use(initReactI18next).init({
  resources: { ko: { translation: ko }, en: { translation: en } },
  lng: initial,
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
})

export function setLanguage(lang: 'ko' | 'en'): void {
  localStorage.setItem('lang', lang)
  void i18n.changeLanguage(lang)
}

export default i18n
```

`src/renderer/src/main.tsx` 상단 import에 추가:

```tsx
import './i18n'
```

- [ ] **Step 3: 스토어 작성**

`src/renderer/src/stores/repoStore.ts`:

```ts
import { create } from 'zustand'
import type { BranchDto, CommitDto, RepoInfoDto, StashDto, StatusDto } from '../../../shared/types'

interface RepoState {
  repo: RepoInfoDto | null
  commits: CommitDto[]
  branches: BranchDto[]
  status: StatusDto | null
  stashes: StashDto[]
  openRepo(path: string): Promise<void>
  refresh(): Promise<void>
}

export const useRepoStore = create<RepoState>((set, get) => ({
  repo: null,
  commits: [],
  branches: [],
  status: null,
  stashes: [],

  async openRepo(path: string) {
    const repo = await window.api.openRepo(path)
    set({ repo })
    await get().refresh()
  },

  async refresh() {
    if (!get().repo) return
    const [commits, branches, status, stashes] = await Promise.all([
      window.api.log(),
      window.api.branches(),
      window.api.status(),
      window.api.stashList()
    ])
    set({ commits, branches, status, stashes })
  }
}))
```

`src/renderer/src/stores/uiStore.ts`:

```ts
import { create } from 'zustand'

export type Selection = { type: 'commit'; hash: string } | { type: 'wip' } | null

interface Toast {
  id: number
  message: string
  detail?: string
}

interface ConfirmState {
  message: string
  onConfirm: () => void
}

interface UiState {
  selected: Selection
  conflictFile: string | null
  showSettings: boolean
  toasts: Toast[]
  confirm: ConfirmState | null
  select(sel: Selection): void
  openConflict(path: string | null): void
  setShowSettings(v: boolean): void
  pushToast(message: string, detail?: string): void
  dismissToast(id: number): void
  ask(message: string, onConfirm: () => void): void
  closeConfirm(): void
}

let toastId = 0

export const useUiStore = create<UiState>((set) => ({
  selected: null,
  conflictFile: null,
  showSettings: false,
  toasts: [],
  confirm: null,

  select: (selected) => set({ selected }),
  openConflict: (conflictFile) => set({ conflictFile }),
  setShowSettings: (showSettings) => set({ showSettings }),

  pushToast: (message, detail) => {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts, { id, message, detail }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 6000)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  ask: (message, onConfirm) => set({ confirm: { message, onConfirm } }),
  closeConfirm: () => set({ confirm: null })
}))
```

- [ ] **Step 4: run 헬퍼와 recentRepos 작성**

`src/renderer/src/lib/run.ts`:

```ts
import i18n from '../i18n'
import { useRepoStore } from '../stores/repoStore'
import { useUiStore } from '../stores/uiStore'
import type { GitErrorDto } from '../../../shared/types'

export function toastError(err: unknown): void {
  const e = err as Partial<GitErrorDto>
  const key = `error.${e.code ?? 'GIT_ERROR'}`
  const message = i18n.exists(key) ? i18n.t(key) : i18n.t('error.GIT_ERROR')
  useUiStore.getState().pushToast(message, e.detail ?? e.message)
}

// git 액션 공통 래퍼: 성공 토스트(옵션) + 에러 토스트 + 저장소 데이터 refresh
export async function run(action: () => Promise<void>, successKey?: string): Promise<void> {
  try {
    await action()
    if (successKey) useUiStore.getState().pushToast(i18n.t(successKey))
  } catch (err) {
    toastError(err)
  } finally {
    await useRepoStore.getState().refresh().catch(() => {})
  }
}
```

`src/renderer/src/lib/recentRepos.ts`:

```ts
export function getRecentRepos(): string[] {
  try {
    return JSON.parse(localStorage.getItem('recentRepos') ?? '[]') as string[]
  } catch {
    return []
  }
}

export function addRecentRepo(path: string): void {
  const list = [path, ...getRecentRepos().filter((p) => p !== path)].slice(0, 10)
  localStorage.setItem('recentRepos', JSON.stringify(list))
}
```

- [ ] **Step 5: 검증 후 커밋**

Run: `npm run typecheck`
Expected: 에러 없음

```bash
git add -A
git commit -m "feat: i18n(ko/en), zustand 스토어, run 액션 헬퍼"
```

---

### Task 9: 앱 셸 — App/Toolbar/EmptyState/Toasts/ConfirmDialog

저장소를 열고, 원격 작업 버튼이 동작하고, 에러/확인 UI가 갖춰진 상태를 만든다.

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/components/Toolbar.tsx`, `EmptyState.tsx`, `Toasts.tsx`, `ConfirmDialog.tsx`
- Create: 빈 플레이스홀더 `LeftPanel.tsx`, `GraphView.tsx`, `RightPanel.tsx`, `MergeBanner.tsx`, `ConflictEditor.tsx`, `SettingsModal.tsx` (이후 Task에서 채움)

- [ ] **Step 1: App.tsx 교체**

```tsx
import { useEffect } from 'react'
import { useRepoStore } from './stores/repoStore'
import { Toolbar } from './components/Toolbar'
import { EmptyState } from './components/EmptyState'
import { LeftPanel } from './components/LeftPanel'
import { GraphView } from './components/GraphView'
import { RightPanel } from './components/RightPanel'
import { MergeBanner } from './components/MergeBanner'
import { ConflictEditor } from './components/ConflictEditor'
import { SettingsModal } from './components/SettingsModal'
import { ConfirmDialog } from './components/ConfirmDialog'
import { Toasts } from './components/Toasts'

export default function App() {
  const repo = useRepoStore((s) => s.repo)
  const refresh = useRepoStore((s) => s.refresh)

  useEffect(() => window.api.onRepoChanged(() => void refresh()), [refresh])

  return (
    <div className="flex h-screen flex-col bg-zinc-900 text-zinc-200">
      <Toolbar />
      <MergeBanner />
      {repo ? (
        <div className="flex min-h-0 flex-1">
          <LeftPanel />
          <GraphView />
          <RightPanel />
        </div>
      ) : (
        <EmptyState />
      )}
      <ConflictEditor />
      <SettingsModal />
      <ConfirmDialog />
      <Toasts />
    </div>
  )
}
```

플레이스홀더 컴포넌트 (이후 Task에서 교체):

```tsx
// src/renderer/src/components/LeftPanel.tsx
export function LeftPanel() {
  return <div className="w-56 shrink-0 border-r border-zinc-700" />
}
```

```tsx
// src/renderer/src/components/GraphView.tsx
export function GraphView() {
  return <div className="min-w-0 flex-1 border-r border-zinc-700" />
}
```

```tsx
// src/renderer/src/components/RightPanel.tsx
export function RightPanel() {
  return <div className="w-80 shrink-0" />
}
```

```tsx
// src/renderer/src/components/MergeBanner.tsx
export function MergeBanner() {
  return null
}
```

```tsx
// src/renderer/src/components/ConflictEditor.tsx
export function ConflictEditor() {
  return null
}
```

```tsx
// src/renderer/src/components/SettingsModal.tsx
export function SettingsModal() {
  return null
}
```

- [ ] **Step 2: Toolbar.tsx 작성**

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addRecentRepo } from '../lib/recentRepos'
import { run, toastError } from '../lib/run'
import { useRepoStore } from '../stores/repoStore'
import { useUiStore } from '../stores/uiStore'

export function Toolbar() {
  const { t } = useTranslation()
  const repo = useRepoStore((s) => s.repo)
  const status = useRepoStore((s) => s.status)
  const openRepo = useRepoStore((s) => s.openRepo)
  const setShowSettings = useUiStore((s) => s.setShowSettings)
  const [branchName, setBranchName] = useState<string | null>(null) // null = 입력창 닫힘

  async function handleOpen(): Promise<void> {
    try {
      const path = await window.api.selectRepo()
      if (!path) return
      await openRepo(path)
      addRecentRepo(path)
    } catch (err) {
      toastError(err)
    }
  }

  function createBranch(): void {
    const name = branchName?.trim()
    if (!name) return
    setBranchName(null)
    void run(() => window.api.createBranch(name, true), 'toast.branchCreated')
  }

  const btn =
    'rounded px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-transparent'

  return (
    <div className="flex items-center gap-1 border-b border-zinc-700 bg-zinc-800 px-2 py-1.5">
      <button className={btn} onClick={() => void handleOpen()}>
        {t('app.openRepo')}
      </button>
      {repo && <span className="mx-2 text-sm font-semibold text-emerald-400">{repo.name}</span>}
      <button className={btn} disabled={!repo} onClick={() => void run(() => window.api.pull(), 'toast.pulled')}>
        {t('toolbar.pull')} {status && status.behind > 0 ? `↓${status.behind}` : ''}
      </button>
      <button className={btn} disabled={!repo} onClick={() => void run(() => window.api.push(), 'toast.pushed')}>
        {t('toolbar.push')} {status && status.ahead > 0 ? `↑${status.ahead}` : ''}
      </button>
      <button className={btn} disabled={!repo} onClick={() => void run(() => window.api.fetch(), 'toast.fetched')}>
        {t('toolbar.fetch')}
      </button>
      {branchName === null ? (
        <button className={btn} disabled={!repo} onClick={() => setBranchName('')}>
          {t('toolbar.branch')} +
        </button>
      ) : (
        <input
          autoFocus
          value={branchName}
          onChange={(e) => setBranchName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') createBranch()
            if (e.key === 'Escape') setBranchName(null)
          }}
          onBlur={() => setBranchName(null)}
          placeholder={t('branch.namePlaceholder')}
          className="rounded bg-zinc-900 px-2 py-1 text-sm outline-none ring-1 ring-emerald-500"
        />
      )}
      <button
        className={btn}
        disabled={!repo || !status || status.files.length === 0}
        onClick={() => void run(() => window.api.stashSave(''), 'toast.stashSaved')}
      >
        {t('toolbar.stash')}
      </button>
      <button className={`${btn} ml-auto`} onClick={() => setShowSettings(true)}>
        {t('toolbar.settings')}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: EmptyState.tsx 작성**

```tsx
import { useTranslation } from 'react-i18next'
import { addRecentRepo, getRecentRepos } from '../lib/recentRepos'
import { toastError } from '../lib/run'
import { useRepoStore } from '../stores/repoStore'

export function EmptyState() {
  const { t } = useTranslation()
  const openRepo = useRepoStore((s) => s.openRepo)
  const recent = getRecentRepos()

  async function open(path: string): Promise<void> {
    try {
      await openRepo(path)
      addRecentRepo(path)
    } catch (err) {
      toastError(err)
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <p className="text-lg text-zinc-400">{t('app.noRepo')}</p>
      {recent.length > 0 && (
        <div className="w-96">
          <p className="mb-1 text-xs uppercase text-zinc-500">{t('app.recentRepos')}</p>
          {recent.map((path) => (
            <button
              key={path}
              onClick={() => void open(path)}
              className="block w-full truncate rounded px-2 py-1 text-left text-sm text-emerald-400 hover:bg-zinc-800"
            >
              {path}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Toasts.tsx / ConfirmDialog.tsx 작성**

`src/renderer/src/components/Toasts.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUiStore } from '../stores/uiStore'

export function Toasts() {
  const { t } = useTranslation()
  const toasts = useUiStore((s) => s.toasts)
  const dismiss = useUiStore((s) => s.dismissToast)
  const [expanded, setExpanded] = useState<number | null>(null)

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-96 flex-col gap-2">
      {toasts.map((toast) => (
        <div key={toast.id} className="rounded border border-zinc-600 bg-zinc-800 p-3 text-sm shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <span>{toast.message}</span>
            <button onClick={() => dismiss(toast.id)} className="text-zinc-500 hover:text-zinc-300">
              ✕
            </button>
          </div>
          {toast.detail && (
            <button
              onClick={() => setExpanded(expanded === toast.id ? null : toast.id)}
              className="mt-1 text-xs text-emerald-400"
            >
              {t('common.detail')}
            </button>
          )}
          {expanded === toast.id && toast.detail && (
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-zinc-900 p-2 text-xs text-zinc-400">
              {toast.detail}
            </pre>
          )}
        </div>
      ))}
    </div>
  )
}
```

`src/renderer/src/components/ConfirmDialog.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { useUiStore } from '../stores/uiStore'

export function ConfirmDialog() {
  const { t } = useTranslation()
  const confirm = useUiStore((s) => s.confirm)
  const close = useUiStore((s) => s.closeConfirm)
  if (!confirm) return null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
      <div className="w-96 rounded-lg border border-zinc-600 bg-zinc-800 p-4">
        <p className="text-sm">{confirm.message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={close} className="rounded px-3 py-1.5 text-sm hover:bg-zinc-700">
            {t('common.cancel')}
          </button>
          <button
            onClick={() => {
              close()
              confirm.onConfirm()
            }}
            className="rounded bg-red-700 px-3 py-1.5 text-sm hover:bg-red-600"
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 검증 후 커밋**

Run: `npm run typecheck`
Expected: 에러 없음

Run: `npm run dev`로 수동 확인:
- "저장소 열기"로 실제 저장소 선택 → 툴바에 저장소 이름 표시
- Fetch 클릭 → "Fetch 완료" 토스트
- 원격 없는 저장소에서 Pull → 에러 토스트 + 상세 보기 동작

```bash
git add -A
git commit -m "feat: 앱 셸 — 툴바, 저장소 열기, 토스트, 확인 다이얼로그"
```

---

### Task 10: GraphView — 커밋 그래프

레인 알고리즘 결과를 SVG로 그리고, 가상 스크롤로 큰 저장소를 감당한다. WIP 행을 최상단에 표시한다.

**Files:**
- Modify: `src/renderer/src/components/GraphView.tsx` (전체 교체)

- [ ] **Step 1: GraphView.tsx 구현**

```tsx
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { assignLanes } from '../../../shared/lanes'
import type { CommitDto } from '../../../shared/types'
import { useRepoStore } from '../stores/repoStore'
import { useUiStore } from '../stores/uiStore'

const ROW_H = 28
const LANE_W = 14
const GRAPH_PAD = 8
const OVERSCAN = 10
const LANE_COLORS = ['#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#f87171', '#2dd4bf']

type Row = { type: 'wip' } | { type: 'commit'; commit: CommitDto }

export function GraphView() {
  const { t } = useTranslation()
  const commits = useRepoStore((s) => s.commits)
  const status = useRepoStore((s) => s.status)
  const selected = useUiStore((s) => s.selected)
  const select = useUiStore((s) => s.select)

  const hasWip = (status?.files.length ?? 0) > 0
  const rows: Row[] = useMemo(
    () => [
      ...(hasWip ? [{ type: 'wip' } as Row] : []),
      ...commits.map((c) => ({ type: 'commit', commit: c }) as Row)
    ],
    [commits, hasWip]
  )

  const lanes = useMemo(() => assignLanes(commits), [commits])
  const rowOf = useMemo(() => {
    const m = new Map<string, number>()
    rows.forEach((row, i) => {
      if (row.type === 'commit') m.set(row.commit.hash, i)
    })
    return m
  }, [rows])
  const maxLane = useMemo(
    () => commits.reduce((max, c) => Math.max(max, lanes.get(c.hash) ?? 0), 0),
    [commits, lanes]
  )
  const graphW = GRAPH_PAD * 2 + (maxLane + 1) * LANE_W

  const ref = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewH, setViewH] = useState(600)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewH(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN)

  const x = (lane: number): number => GRAPH_PAD + lane * LANE_W + LANE_W / 2
  const y = (row: number): number => row * ROW_H + ROW_H / 2
  const color = (lane: number): string => LANE_COLORS[lane % LANE_COLORS.length]

  const edges: ReactNode[] = []
  const nodes: ReactNode[] = []
  for (let i = start; i < end; i++) {
    const row = rows[i]
    if (row.type !== 'commit') continue
    const lane = lanes.get(row.commit.hash) ?? 0
    nodes.push(<circle key={row.commit.hash} cx={x(lane)} cy={y(i)} r="4" fill={color(lane)} />)
    for (const p of row.commit.parents) {
      const pr = rowOf.get(p)
      if (pr === undefined) continue
      const pl = lanes.get(p) ?? 0
      edges.push(
        <path
          key={`${row.commit.hash}-${p}`}
          d={`M ${x(lane)} ${y(i)} C ${x(lane)} ${y(i) + ROW_H} ${x(pl)} ${y(pr) - ROW_H} ${x(pl)} ${y(pr)}`}
          stroke={color(pl)}
          fill="none"
          strokeWidth="1.5"
        />
      )
    }
  }

  return (
    <div
      ref={ref}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className="relative min-w-0 flex-1 overflow-y-auto border-r border-zinc-700"
    >
      <div className="relative" style={{ height: rows.length * ROW_H }}>
        <svg
          className="pointer-events-none absolute left-0 top-0"
          width={graphW}
          height={rows.length * ROW_H}
        >
          {edges}
          {nodes}
        </svg>
        {rows.slice(start, end).map((row, j) => {
          const i = start + j
          const isSelected =
            row.type === 'wip'
              ? selected?.type === 'wip'
              : selected?.type === 'commit' && selected.hash === row.commit.hash
          return (
            <div
              key={row.type === 'wip' ? 'WIP' : row.commit.hash}
              onClick={() =>
                select(row.type === 'wip' ? { type: 'wip' } : { type: 'commit', hash: row.commit.hash })
              }
              className={`absolute flex w-full cursor-pointer items-center gap-2 pr-2 text-sm ${
                isSelected ? 'bg-zinc-700' : 'hover:bg-zinc-800'
              }`}
              style={{ top: i * ROW_H, height: ROW_H, paddingLeft: graphW + 8 }}
            >
              {row.type === 'wip' ? (
                <span className="italic text-amber-300">{t('panel.wip')}</span>
              ) : (
                <>
                  {row.commit.refs.map((r) => (
                    <span
                      key={r}
                      className="shrink-0 rounded bg-zinc-700 px-1 text-xs text-emerald-300"
                    >
                      {r.replace('HEAD -> ', '')}
                    </span>
                  ))}
                  <span className="truncate">{row.commit.subject}</span>
                  <span className="ml-auto shrink-0 text-xs text-zinc-500">{row.commit.author}</span>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 검증 후 커밋**

Run: `npm run typecheck` → 에러 없음

Run: `npm run dev`로 수동 확인:
- 브랜치/머지가 있는 저장소를 열면 레인이 색깔별로 갈라지고 합쳐짐
- 파일을 수정하면(외부 터미널에서) WIP 행이 자동으로 나타남 (RepoWatcher 경유)
- 수천 커밋 저장소에서도 스크롤이 부드러움

```bash
git add -A
git commit -m "feat: 커밋 그래프 뷰 (SVG 레인 + 가상 스크롤)"
```

---

### Task 11: RightPanel — CommitDetail + DiffViewer

커밋 선택 시 메타데이터/파일 목록/diff를 보여준다.

**Files:**
- Modify: `src/renderer/src/components/RightPanel.tsx` (전체 교체)
- Create: `src/renderer/src/components/CommitDetail.tsx`, `src/renderer/src/components/DiffViewer.tsx`
- Create: 플레이스홀더 `src/renderer/src/components/StagingPanel.tsx` (Task 12에서 채움)

- [ ] **Step 1: DiffViewer.tsx 작성**

```tsx
export function DiffViewer({ text }: { text: string }) {
  return (
    <pre className="min-h-0 flex-1 overflow-auto whitespace-pre font-mono text-xs leading-5">
      {text.split('\n').map((line, i) => {
        const cls = line.startsWith('+')
          ? 'bg-emerald-950 text-emerald-300'
          : line.startsWith('-')
            ? 'bg-red-950 text-red-300'
            : line.startsWith('@@')
              ? 'text-sky-400'
              : 'text-zinc-400'
        return (
          <div key={i} className={cls}>
            {line || ' '}
          </div>
        )
      })}
    </pre>
  )
}
```

- [ ] **Step 2: CommitDetail.tsx 작성**

```tsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CommitFileDto } from '../../../shared/types'
import { toastError } from '../lib/run'
import { useRepoStore } from '../stores/repoStore'
import { DiffViewer } from './DiffViewer'

const STATUS_COLOR: Record<string, string> = {
  A: 'text-emerald-400',
  M: 'text-amber-400',
  D: 'text-red-400'
}

export function CommitDetail({ hash }: { hash: string }) {
  const { t } = useTranslation()
  const commit = useRepoStore((s) => s.commits.find((c) => c.hash === hash))
  const [files, setFiles] = useState<CommitFileDto[]>([])
  const [diff, setDiff] = useState<{ path: string; text: string } | null>(null)

  useEffect(() => {
    setDiff(null)
    setFiles([])
    window.api.commitFiles(hash).then(setFiles).catch(toastError)
  }, [hash])

  if (!commit) return null

  async function showDiff(path: string): Promise<void> {
    try {
      const text = await window.api.diffCommitFile(hash, path)
      setDiff({ path, text })
    } catch (err) {
      toastError(err)
    }
  }

  return (
    <div className="flex h-full flex-col gap-2 p-3 text-sm">
      <p className="font-semibold">{commit.subject}</p>
      <p className="text-xs text-zinc-500">
        {commit.author} · {new Date(commit.date).toLocaleString()} ·{' '}
        <span className="font-mono">{commit.hash.slice(0, 8)}</span>
      </p>
      <p className="text-xs uppercase text-zinc-500">
        {t('panel.files')} ({files.length})
      </p>
      <div className="max-h-48 overflow-y-auto">
        {files.map((f) => (
          <button
            key={f.path}
            onClick={() => void showDiff(f.path)}
            className={`block w-full truncate rounded px-1 py-0.5 text-left font-mono text-xs hover:bg-zinc-800 ${
              diff?.path === f.path ? 'bg-zinc-700' : ''
            }`}
          >
            <span className={STATUS_COLOR[f.status] ?? 'text-zinc-400'}>{f.status}</span> {f.path}
          </button>
        ))}
      </div>
      {diff && <DiffViewer text={diff.text} />}
    </div>
  )
}
```

- [ ] **Step 3: RightPanel.tsx 교체 + StagingPanel 플레이스홀더**

`src/renderer/src/components/RightPanel.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { useUiStore } from '../stores/uiStore'
import { CommitDetail } from './CommitDetail'
import { StagingPanel } from './StagingPanel'

export function RightPanel() {
  const { t } = useTranslation()
  const selected = useUiStore((s) => s.selected)

  return (
    <div className="flex w-80 shrink-0 flex-col overflow-hidden">
      {selected?.type === 'commit' ? (
        <CommitDetail hash={selected.hash} />
      ) : selected?.type === 'wip' ? (
        <StagingPanel />
      ) : (
        <p className="p-4 text-sm text-zinc-500">{t('panel.noCommitSelected')}</p>
      )}
    </div>
  )
}
```

`src/renderer/src/components/StagingPanel.tsx` (플레이스홀더):

```tsx
export function StagingPanel() {
  return null
}
```

- [ ] **Step 4: 검증 후 커밋**

Run: `npm run typecheck` → 에러 없음

Run: `npm run dev`로 수동 확인: 커밋 클릭 → 우측에 메시지/파일 목록, 파일 클릭 → 색깔 입힌 diff

```bash
git add -A
git commit -m "feat: 커밋 상세 패널과 diff 뷰어"
```

---

### Task 12: StagingPanel — stage/unstage/discard/commit

WIP 행 선택 시 staged/unstaged 목록과 커밋 UI를 제공한다.

**Files:**
- Modify: `src/renderer/src/components/StagingPanel.tsx` (전체 교체)

- [ ] **Step 1: StagingPanel.tsx 구현**

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FileStatusDto } from '../../../shared/types'
import { run, toastError } from '../lib/run'
import { useRepoStore } from '../stores/repoStore'
import { useUiStore } from '../stores/uiStore'
import { DiffViewer } from './DiffViewer'

export function StagingPanel() {
  const { t } = useTranslation()
  const status = useRepoStore((s) => s.status)
  const ask = useUiStore((s) => s.ask)
  const [message, setMessage] = useState('')
  const [diff, setDiff] = useState<{ path: string; text: string } | null>(null)

  if (!status) return null
  // 충돌 파일은 MergeBanner/ConflictEditor가 담당
  const staged = status.files.filter((f) => !f.isConflicted && f.index !== ' ' && f.index !== '?')
  const unstaged = status.files.filter((f) => !f.isConflicted && f.workingDir !== ' ')

  async function showDiff(file: FileStatusDto, fromStaged: boolean): Promise<void> {
    try {
      const text = await window.api.diffWorkingFile(file.path, fromStaged)
      setDiff({ path: file.path, text })
    } catch (err) {
      toastError(err)
    }
  }

  function commit(): void {
    const msg = message.trim()
    if (!msg) return
    void run(async () => {
      await window.api.commit(msg)
      setMessage('')
    }, 'toast.committed')
  }

  function fileRow(file: FileStatusDto, fromStaged: boolean) {
    return (
      <div key={file.path} className="group flex items-center gap-1 rounded px-1 hover:bg-zinc-800">
        <button
          onClick={() => void showDiff(file, fromStaged)}
          className="min-w-0 flex-1 truncate text-left font-mono text-xs"
        >
          <span className="text-amber-400">{fromStaged ? file.index : file.workingDir}</span>{' '}
          {file.path}
        </button>
        {fromStaged ? (
          <button
            onClick={() => void run(() => window.api.unstage([file.path]))}
            className="hidden rounded px-1 text-xs text-zinc-400 hover:text-zinc-200 group-hover:block"
          >
            {t('panel.unstage')}
          </button>
        ) : (
          <>
            <button
              onClick={() => void run(() => window.api.stage([file.path]))}
              className="hidden rounded px-1 text-xs text-emerald-400 hover:text-emerald-300 group-hover:block"
            >
              {t('panel.stage')}
            </button>
            <button
              onClick={() =>
                ask(t('common.discardConfirm', { name: file.path }), () =>
                  void run(() => window.api.discard([file.path]))
                )
              }
              className="hidden rounded px-1 text-xs text-red-400 hover:text-red-300 group-hover:block"
            >
              {t('panel.discard')}
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-2 p-3 text-sm">
      <p className="text-xs uppercase text-zinc-500">
        {t('panel.unstaged')} ({unstaged.length})
      </p>
      <div className="max-h-40 overflow-y-auto">{unstaged.map((f) => fileRow(f, false))}</div>
      <p className="text-xs uppercase text-zinc-500">
        {t('panel.staged')} ({staged.length})
      </p>
      <div className="max-h-40 overflow-y-auto">{staged.map((f) => fileRow(f, true))}</div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t('panel.commitMessagePlaceholder')}
        rows={3}
        className="resize-none rounded bg-zinc-800 p-2 text-sm outline-none ring-1 ring-zinc-700 focus:ring-emerald-500"
      />
      <button
        onClick={commit}
        disabled={!message.trim() || staged.length === 0}
        className="rounded bg-emerald-700 py-1.5 text-sm font-semibold hover:bg-emerald-600 disabled:opacity-40"
      >
        {t('panel.commit')}
      </button>
      {diff && <DiffViewer text={diff.text} />}
    </div>
  )
}
```

- [ ] **Step 2: 검증 후 커밋**

Run: `npm run typecheck` → 에러 없음

Run: `npm run dev`로 수동 확인:
- 파일 수정 → WIP 행 클릭 → unstaged에 표시 → 스테이지 → staged로 이동
- 메시지 입력 + 커밋 → 그래프 최상단에 새 커밋, WIP 행 사라짐
- 변경 취소 → 확인 다이얼로그 → 되돌려짐

```bash
git add -A
git commit -m "feat: staging 패널 (stage/unstage/discard/commit)"
```

---

### Task 13: LeftPanel — 브랜치/원격/스태시 트리

브랜치 컨텍스트 메뉴(checkout/merge/rename/delete)와 스태시 apply/drop을 제공한다.

**Files:**
- Modify: `src/renderer/src/components/LeftPanel.tsx` (전체 교체)

- [ ] **Step 1: LeftPanel.tsx 구현**

```tsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BranchDto, GitErrorDto } from '../../../shared/types'
import { run, toastError } from '../lib/run'
import { useRepoStore } from '../stores/repoStore'
import { useUiStore } from '../stores/uiStore'

interface MenuState {
  x: number
  y: number
  branch: BranchDto
}

export function LeftPanel() {
  const { t } = useTranslation()
  const branches = useRepoStore((s) => s.branches)
  const stashes = useRepoStore((s) => s.stashes)
  const status = useRepoStore((s) => s.status)
  const refresh = useRepoStore((s) => s.refresh)
  const ask = useUiStore((s) => s.ask)
  const pushToast = useUiStore((s) => s.pushToast)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [renaming, setRenaming] = useState<{ from: string; value: string } | null>(null)

  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menu])

  const locals = branches.filter((b) => !b.isRemote)
  const remotes = branches.filter((b) => b.isRemote)

  function checkout(branch: BranchDto): void {
    // 원격 브랜치는 프리픽스를 떼고 git의 DWIM 추적 브랜치 생성을 활용
    const name = branch.isRemote ? branch.name.split('/').slice(1).join('/') : branch.name
    void run(() => window.api.checkoutBranch(name))
  }

  function mergeBranch(branch: BranchDto): void {
    void run(async () => {
      const result = await window.api.merge(branch.name)
      if (result.conflicts) pushToast(t('toast.mergeConflict'))
      else pushToast(t('toast.merged'))
    })
  }

  async function deleteBranch(name: string, force: boolean): Promise<void> {
    try {
      await window.api.deleteBranch(name, force)
      await refresh()
    } catch (err) {
      const e = err as GitErrorDto
      if (!force && /not fully merged/i.test(e.detail ?? '')) {
        ask(t('branch.forceDeleteConfirm', { name }), () => void deleteBranch(name, true))
      } else {
        toastError(err)
      }
    }
  }

  function commitRename(): void {
    if (!renaming) return
    const { from, value } = renaming
    setRenaming(null)
    const to = value.trim()
    if (to && to !== from) void run(() => window.api.renameBranch(from, to))
  }

  function branchRow(branch: BranchDto) {
    if (renaming && !branch.isRemote && renaming.from === branch.name) {
      return (
        <input
          key={branch.name}
          autoFocus
          value={renaming.value}
          onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') setRenaming(null)
          }}
          onBlur={commitRename}
          className="w-full rounded bg-zinc-900 px-1 text-sm outline-none ring-1 ring-emerald-500"
        />
      )
    }
    return (
      <button
        key={branch.name}
        onDoubleClick={() => checkout(branch)}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY, branch })
        }}
        className={`block w-full truncate rounded px-1 py-0.5 text-left text-sm hover:bg-zinc-800 ${
          branch.current ? 'font-semibold text-emerald-400' : ''
        }`}
      >
        {branch.current ? '● ' : ''}
        {branch.name}
      </button>
    )
  }

  return (
    <div className="w-56 shrink-0 overflow-y-auto border-r border-zinc-700 p-2">
      <p className="mb-1 text-xs font-semibold uppercase text-zinc-500">{t('panel.local')}</p>
      {locals.map(branchRow)}
      <p className="mb-1 mt-3 text-xs font-semibold uppercase text-zinc-500">{t('panel.remote')}</p>
      {remotes.map(branchRow)}
      <p className="mb-1 mt-3 text-xs font-semibold uppercase text-zinc-500">{t('panel.stash')}</p>
      {stashes.map((stash) => (
        <div key={stash.index} className="group flex items-center gap-1 rounded px-1 hover:bg-zinc-800">
          <span className="min-w-0 flex-1 truncate text-sm">{stash.message}</span>
          <button
            onClick={() => void run(() => window.api.stashApply(stash.index))}
            className="hidden text-xs text-emerald-400 group-hover:block"
          >
            {t('stash.apply')}
          </button>
          <button
            onClick={() =>
              ask(t('stash.dropConfirm', { name: stash.message }), () =>
                void run(() => window.api.stashDrop(stash.index))
              )
            }
            className="hidden text-xs text-red-400 group-hover:block"
          >
            {t('stash.drop')}
          </button>
        </div>
      ))}

      {menu && (
        <div
          className="fixed z-50 w-56 rounded border border-zinc-600 bg-zinc-800 py-1 text-sm shadow-xl"
          style={{ left: menu.x, top: menu.y }}
        >
          <MenuItem
            label={t('branch.checkout')}
            onClick={() => checkout(menu.branch)}
            disabled={menu.branch.current}
          />
          <MenuItem
            label={t('branch.mergeInto', { target: status?.current ?? '' })}
            onClick={() => mergeBranch(menu.branch)}
            disabled={menu.branch.current}
          />
          {!menu.branch.isRemote && (
            <>
              <MenuItem
                label={t('branch.rename')}
                onClick={() => setRenaming({ from: menu.branch.name, value: menu.branch.name })}
              />
              <MenuItem
                label={t('branch.delete')}
                danger
                disabled={menu.branch.current}
                onClick={() =>
                  ask(t('branch.deleteConfirm', { name: menu.branch.name }), () =>
                    void deleteBranch(menu.branch.name, false)
                  )
                }
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  label,
  onClick,
  disabled,
  danger
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`block w-full px-3 py-1 text-left hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-transparent ${
        danger ? 'text-red-400' : ''
      }`}
    >
      {label}
    </button>
  )
}
```

- [ ] **Step 2: 검증 후 커밋**

Run: `npm run typecheck` → 에러 없음

Run: `npm run dev`로 수동 확인:
- 브랜치 더블클릭 → 체크아웃, ● 표시 이동
- 우클릭 메뉴: 이름 변경(인라인 입력), 삭제(확인 후), 미머지 브랜치 삭제 시 강제 삭제 재확인
- 원격 브랜치 체크아웃 → 로컬 추적 브랜치 생성
- 스태시 적용/삭제 동작

```bash
git add -A
git commit -m "feat: 좌측 패널 — 브랜치/원격/스태시 트리와 컨텍스트 메뉴"
```

---

### Task 14: MergeBanner — 머지 진행 상태 관리

머지 중 상단 배너로 충돌 파일 목록, Abort, Commit Merge를 제공한다.

**Files:**
- Modify: `src/renderer/src/components/MergeBanner.tsx` (전체 교체)

- [ ] **Step 1: MergeBanner.tsx 구현**

```tsx
import { useTranslation } from 'react-i18next'
import { run } from '../lib/run'
import { useRepoStore } from '../stores/repoStore'
import { useUiStore } from '../stores/uiStore'

export function MergeBanner() {
  const { t } = useTranslation()
  const status = useRepoStore((s) => s.status)
  const openConflict = useUiStore((s) => s.openConflict)
  const ask = useUiStore((s) => s.ask)

  if (!status?.merging) return null
  const allResolved = status.conflicted.length === 0

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-amber-700 bg-amber-950 px-3 py-2 text-sm">
      <span className="font-semibold text-amber-300">{t('merge.inProgress')}</span>
      <span className="text-amber-200">
        {t('merge.conflictedFiles', { count: status.conflicted.length })}
      </span>
      {status.conflicted.map((file) => (
        <button
          key={file}
          onClick={() => openConflict(file)}
          className="rounded bg-amber-900 px-2 py-0.5 font-mono text-xs text-amber-200 hover:bg-amber-800"
        >
          {file}
        </button>
      ))}
      <div className="ml-auto flex gap-2">
        <button
          onClick={() => ask(t('merge.abortConfirm'), () => void run(() => window.api.abortMerge()))}
          className="rounded px-3 py-1 text-amber-200 hover:bg-amber-900"
        >
          {t('merge.abort')}
        </button>
        <button
          disabled={!allResolved}
          onClick={() => void run(() => window.api.commitMerge(), 'toast.merged')}
          className="rounded bg-emerald-700 px-3 py-1 font-semibold hover:bg-emerald-600 disabled:opacity-40"
        >
          {t('merge.commitMerge')}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 검증 후 커밋**

Run: `npm run typecheck` → 에러 없음

Run: `npm run dev`로 수동 확인 (Task 6 픽스처처럼 충돌 저장소를 만들어서):
- feature 브랜치를 현재 브랜치에 머지 → 충돌 토스트 + 상단에 노란 배너
- 배너에 충돌 파일 버튼 표시, Commit Merge는 비활성
- Abort → 확인 → 배너 사라지고 워킹 트리 원복

```bash
git add -A
git commit -m "feat: 머지 진행 배너 (abort / commit merge)"
```

---

### Task 15: ConflictEditor — 3-패널 충돌 해결

스펙의 핵심 기능. 상단 Ours/Theirs 블록 체크박스 + 하단 편집 가능 Output(CodeMirror).

**Files:**
- Create: `src/renderer/src/components/CodeEditor.tsx`
- Modify: `src/renderer/src/components/ConflictEditor.tsx` (전체 교체)

- [ ] **Step 1: CodeEditor.tsx 작성 (CodeMirror 래퍼)**

```tsx
import { useEffect, useRef } from 'react'
import { basicSetup, EditorView } from 'codemirror'

export function CodeEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!ref.current) return
    const view = new EditorView({
      doc: value,
      parent: ref.current,
      extensions: [
        basicSetup,
        EditorView.theme({ '&': { height: '100%', fontSize: '12px' } }, { dark: true }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString())
        })
      ]
    })
    viewRef.current = view
    return () => view.destroy()
    // 마운트 시 1회만 생성; 외부 value 변경은 아래 effect가 반영
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
    }
  }, [value])

  return <div ref={ref} className="h-full min-h-0 overflow-hidden bg-zinc-950" />
}
```

- [ ] **Step 2: ConflictEditor.tsx 구현**

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { buildOutput, countConflicts, countResolved, parseConflicts } from '../../../shared/conflicts'
import type { ConflictChoice, ConflictSegment } from '../../../shared/types'
import { run, toastError } from '../lib/run'
import { useUiStore } from '../stores/uiStore'
import { CodeEditor } from './CodeEditor'

export function ConflictEditor() {
  const { t } = useTranslation()
  const file = useUiStore((s) => s.conflictFile)
  const openConflict = useUiStore((s) => s.openConflict)
  const [segments, setSegments] = useState<ConflictSegment[]>([])
  const [choices, setChoices] = useState<ConflictChoice[]>([])
  const [output, setOutput] = useState('')
  const [focus, setFocus] = useState(0) // 현재 충돌 블록 인덱스
  const blockRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    if (!file) return
    setFocus(0)
    window.api
      .readWorkingFile(file)
      .then((content) => {
        const segs = parseConflicts(content)
        const init = segs.filter((s) => s.type === 'conflict').map(() => ({ ours: false, theirs: false }))
        setSegments(segs)
        setChoices(init)
        setOutput(buildOutput(segs, init))
      })
      .catch(toastError)
  }, [file])

  const total = useMemo(() => countConflicts(segments), [segments])
  const resolved = countResolved(choices)

  function toggle(index: number, side: 'ours' | 'theirs'): void {
    const next = choices.map((c, i) => (i === index ? { ...c, [side]: !c[side] } : c))
    setChoices(next)
    setOutput(buildOutput(segments, next))
  }

  function jump(delta: number): void {
    const next = Math.min(total - 1, Math.max(0, focus + delta))
    setFocus(next)
    blockRefs.current[next]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  if (!file) return null

  // 한쪽 컬럼 렌더링: context는 흐리게, 충돌 블록은 체크박스 헤더와 함께
  function column(side: 'ours' | 'theirs') {
    let ci = -1
    return (
      <div className="min-h-0 flex-1 overflow-auto border-r border-zinc-700 last:border-r-0">
        {segments.map((seg, si) => {
          if (seg.type === 'context') {
            return (
              <pre key={si} className="whitespace-pre px-2 font-mono text-xs leading-5 text-zinc-600">
                {seg.lines.join('\n')}
              </pre>
            )
          }
          ci++
          const index = ci
          const checked = choices[index]?.[side] ?? false
          const lines = side === 'ours' ? seg.ours : seg.theirs
          const label = side === 'ours' ? seg.oursLabel : seg.theirsLabel
          const color = side === 'ours' ? 'emerald' : 'red'
          return (
            <div
              key={si}
              ref={(el) => {
                if (side === 'ours') blockRefs.current[index] = el
              }}
              className={`my-1 border-l-2 ${
                index === focus ? `border-${color}-400` : 'border-transparent'
              }`}
            >
              <label
                className={`flex cursor-pointer items-center gap-2 bg-${color}-950 px-2 py-1 text-xs text-${color}-300`}
              >
                <input type="checkbox" checked={checked} onChange={() => toggle(index, side)} />
                #{index + 1} {t(`merge.${side}`, { label })}
              </label>
              <pre
                className={`whitespace-pre px-2 font-mono text-xs leading-5 ${
                  checked ? `bg-${color}-950/50 text-zinc-200` : 'text-zinc-500'
                }`}
              >
                {lines.join('\n')}
              </pre>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-zinc-900 p-3">
      <div className="mb-2 flex items-center gap-3">
        <span className="font-mono text-sm font-semibold">{file}</span>
        <span className="text-sm text-amber-300">{t('merge.resolved', { resolved, total })}</span>
        <button onClick={() => jump(-1)} className="rounded px-2 py-1 text-xs hover:bg-zinc-700">
          ↑ {t('merge.prev')}
        </button>
        <button onClick={() => jump(1)} className="rounded px-2 py-1 text-xs hover:bg-zinc-700">
          ↓ {t('merge.next')}
        </button>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => openConflict(null)}
            className="rounded px-3 py-1 text-sm hover:bg-zinc-700"
          >
            {t('common.close')}
          </button>
          <button
            onClick={() =>
              void run(async () => {
                await window.api.saveResolved(file, output)
                openConflict(null)
              }, 'toast.resolvedSaved')
            }
            className="rounded bg-emerald-700 px-3 py-1 text-sm font-semibold hover:bg-emerald-600"
          >
            {t('merge.save')}
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-[3] rounded border border-zinc-700">
        {column('ours')}
        {column('theirs')}
      </div>
      <p className="mt-2 text-xs uppercase text-zinc-500">{t('merge.output')}</p>
      <div className="min-h-0 flex-[2] rounded border border-zinc-700">
        <CodeEditor value={output} onChange={setOutput} />
      </div>
    </div>
  )
}
```

**Tailwind 동적 클래스 주의:** `bg-${color}-950` 같은 동적 조합은 Tailwind가 감지하지 못한다. 구현 시 아래처럼 정적 클래스 맵으로 바꾼다:

```tsx
const SIDE_CLS = {
  ours: { header: 'bg-emerald-950 text-emerald-300', body: 'bg-emerald-950/50', border: 'border-emerald-400' },
  theirs: { header: 'bg-red-950 text-red-300', body: 'bg-red-950/50', border: 'border-red-400' }
} as const
```

위 `column()` 안의 `bg-${color}-*`, `text-${color}-*`, `border-${color}-400`을 모두 `SIDE_CLS[side].*` 참조로 교체할 것.

- [ ] **Step 3: 검증 후 커밋**

Run: `npm run typecheck` → 에러 없음

Run: `npm run dev`로 수동 확인 (충돌 저장소에서):
- 배너의 충돌 파일 클릭 → 전체 화면 3-패널 에디터
- Ours 체크 → Output에 즉시 반영. 둘 다 체크 → ours 다음 theirs 순서
- Output 직접 편집 가능. 카운터 갱신(`1/2 해결됨`), 이전/다음 이동
- 저장 → 배너에서 해당 파일 사라짐 → 전부 해결 시 Commit Merge 활성화 → 머지 커밋이 그래프에 두 부모로 표시

```bash
git add -A
git commit -m "feat: 3-패널 conflict 해결 에디터"
```

---

### Task 16: SettingsModal(언어 전환) + 최종 검증

언어 전환 UI를 붙이고 전체 시나리오를 검증한다.

**Files:**
- Modify: `src/renderer/src/components/SettingsModal.tsx` (전체 교체)
- Create: `README.md`

- [ ] **Step 1: SettingsModal.tsx 구현**

```tsx
import { useTranslation } from 'react-i18next'
import { setLanguage } from '../i18n'
import { useUiStore } from '../stores/uiStore'

export function SettingsModal() {
  const { t, i18n } = useTranslation()
  const show = useUiStore((s) => s.showSettings)
  const setShow = useUiStore((s) => s.setShowSettings)
  if (!show) return null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
      <div className="w-80 rounded-lg border border-zinc-600 bg-zinc-800 p-4">
        <p className="mb-3 font-semibold">{t('settings.title')}</p>
        <p className="mb-1 text-xs uppercase text-zinc-500">{t('settings.language')}</p>
        <div className="flex gap-2">
          {(['ko', 'en'] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              className={`flex-1 rounded px-3 py-1.5 text-sm ${
                i18n.language === lang ? 'bg-emerald-700 font-semibold' : 'bg-zinc-700 hover:bg-zinc-600'
              }`}
            >
              {lang === 'ko' ? '한국어' : 'English'}
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={() => setShow(false)} className="rounded px-3 py-1.5 text-sm hover:bg-zinc-700">
            {t('settings.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: README.md 작성**

```markdown
# GitKraken Clone

GitKraken 스타일의 Electron git 클라이언트. 한국어/영어 지원, 3-패널 conflict 해결 에디터.

## 요구 사항

- Node.js 20+
- 시스템에 git 설치 (인증은 시스템 git의 credential helper / SSH 설정 사용)

## 개발

```bash
npm install
npm run dev        # Electron 개발 모드 (HMR)
npm test           # Vitest 단위/통합 테스트
npm run typecheck  # TypeScript 검사
npm run build      # 프로덕션 빌드 (out/)
```

## 주요 기능

- 커밋 그래프 (브랜치 레인 시각화, 가상 스크롤)
- Stage / Unstage / Commit, 브랜치 생성·전환·삭제·이름 변경
- Merge + 3-패널 conflict 해결 (Ours/Theirs 블록 선택 + Output 직접 편집)
- Push / Pull / Fetch, Stash
- 한국어/영어 전환 (설정)
```

- [ ] **Step 3: 전체 자동 검증**

Run: `npm test`
Expected: 모든 테스트 PASS (logParser 4, lanes 4, conflicts 7, gitService 13 = 28개)

Run: `npm run typecheck`
Expected: 에러 없음

Run: `npm run build`
Expected: out/ 에 main/preload/renderer 빌드 산출물 생성, 에러 없음

- [ ] **Step 4: 수동 E2E 시나리오 (스펙의 성공 기준)**

`npm run dev`로 띄우고 임시 저장소(Task 6의 makeConflictRepo와 동일한 구조를 셸로 생성)에서:

1. 저장소 열기 → 그래프에 main/feature 분기 표시
2. 파일 수정 → WIP 행 → stage → 커밋 → 그래프 반영
3. 브랜치 생성/체크아웃/이름 변경/삭제
4. feature 머지 → 충돌 배너 → 3-패널에서 해결 → Commit Merge → 두 부모 머지 커밋 확인
5. bare 원격 추가된 저장소에서 Push/Pull/Fetch
6. Stash 저장/적용/삭제
7. 설정 → English 전환 → 모든 라벨 즉시 변경 → 재시작 후에도 유지
8. 외부 터미널에서 커밋 → 앱이 자동 갱신 (RepoWatcher)

- [ ] **Step 5: 최종 커밋**

```bash
git add -A
git commit -m "feat: 설정 모달(언어 전환), README"
```

---

## 셀프 리뷰 체크 결과

- **스펙 커버리지:** 저장소 열기/최근 목록(T9), 그래프+WIP(T10), stage/commit(T12), 브랜치 작업(T9 생성, T13 나머지), merge+conflict(T13 트리거, T14 배너, T15 에디터), push/pull/fetch(T9), stash(T9 저장, T13 적용/삭제), i18n(T8, T16), 에러 DTO+토스트(T6, T8, T9), 확인 다이얼로그(T9), RepoWatcher(T7), 테스트 2층위(T3-T6) — 전부 매핑됨.
- **타입 일관성:** `GitApi` 메서드명(T2)과 `GitService` 메서드명(T6), preload 자동 생성(T7), 컴포넌트 호출부가 동일 이름 사용. `commitMerge`는 GitApi/GIT_API_METHODS/GitService 모두 정의됨.
- **알려진 트레이드오프:** 레인 알고리즘은 단순 휴리스틱(첫 부모 우선)으로, 복잡한 옥토퍼스 머지에서 레인이 교차할 수 있다 — 스펙 범위 내 수용. `push`는 항상 `-u origin HEAD`로 origin을 가정한다 — 다중 remote는 범위 외.



