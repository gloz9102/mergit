# Mergit

**Mergit** (merge + git) — 스테이징, 히스토리, 충돌 해결에 집중한 minimal 데스크톱 Git 클라이언트.

> A minimal desktop Git client focused on staging, history, and conflict resolution.

> ⚠️ 초기 버전입니다. 피드백과 이슈 제보를 환영합니다.

<p>
  <a href="https://github.com/gloz9102/mergit/releases/latest"><strong>Download for Windows</strong></a>
  ·
  <a href="#소스에서-실행"><strong>Run from source</strong></a>
  ·
  <a href="#의도적으로-하지-않는-것"><strong>Scope</strong></a>
</p>

## 왜 Mergit인가

- **Conflict-first** — merge, cherry-pick, revert 중 생긴 충돌을 한 흐름에서 해결합니다.
- **Safe daily Git** — stage, commit, amend, undo last commit, stash, push/pull/fetch 같은 매일 쓰는 작업을 작게 제공합니다.
- **Git-native** — 별도 계정이나 호스팅 서비스 연동 없이 시스템 git, credential helper, SSH 설정을 그대로 사용합니다.
- **한국어/영어 지원** — 시스템 로케일 자동 감지와 설정 전환을 지원합니다.

![메인 화면 — 커밋 그래프](docs/screenshots/main.png)

3-패널 conflict 해결 에디터:

![Conflict 해결 에디터](docs/screenshots/conflict.png)

## 한눈에 보기

| 포함 | 상태 |
|---|---|
| 커밋 그래프 / 브랜치 레인 / WIP 행 | 지원 |
| 커밋 검색 / 브랜치 검색·필터 | 지원 |
| 최근 저장소 / 북마크 / 새 창으로 열기 | 지원 |
| 파일 단위 stage / unstage / discard | 지원 |
| commit / amend / undo last commit | 지원 |
| branch 생성·전환·rename·delete·merge | 지원 |
| push / pull / fetch | 지원 |
| stash save / apply / pop / drop / 파일 단위 stash | 지원 |
| merge / cherry-pick / revert conflict 해결 | 지원 |
| 외부 변경 자동 감지 | 지원 |
| 업데이트 확인 (Windows 자동 업데이트) | 지원 |
| 마지막 창 종료 확인 | 지원 |
| 한국어 / 영어 | 지원 |
| hunk·line 단위 staging | 예정 |
| 3-way base conflict editor | 예정 |

## 주요 기능

- **저장소 열기** — 현재 창 또는 새 창으로 열기(스플릿 버튼), 최근 저장소 목록, 북마크(별 토글)와 즐겨찾기 리스트. 여러 저장소는 새 창으로 동시에 열 수 있고, 창 제목에 저장소명이 표시됩니다.
- **커밋 그래프** — 브랜치 레인 시각화, 가상 스크롤, topo/date order 전환, all/current history 전환. 작업 중인 변경(WIP)이 그래프 최상단에 표시됩니다.
- **검색과 탐색** — 커밋 메시지/작성자 검색(점프·하이라이트), 브랜치 fuzzy 검색·필터.
- **Staging** — 파일 단위 stage / unstage / discard, diff는 중앙 패널에서 크게 확인.
- **커밋 작업** — commit, amend, 마지막 커밋 취소(soft reset), cherry-pick, revert를 제공합니다.
- **브랜치 / 원격 / stash** — 브랜치 생성·전환·rename·delete(미머지 시 강제 삭제 확인), push/pull/fetch(시스템 git의 credential helper / SSH 설정 사용, ahead/behind·진행 스피너 표시), stash 저장/적용/pop/삭제·파일 단위 stash.
- **3-패널 conflict 해결** — 충돌 시 Ours/Theirs를 나란히 놓고 블록별 체크박스로 선택, 하단 Output 에디터에서 결과를 직접 수정. 해결 진행 카운터와 충돌 블록 간 이동을 지원합니다.
- **외부 변경 자동 감지** — 터미널에서 git을 사용해도 화면이 자동 갱신됩니다.
- **설정과 업데이트** — 언어 즉시 전환, 설정창에서 GitHub 저장소 링크와 현재 버전 확인, 수동/자동 업데이트 확인.
- **종료 확인** — 마지막 창을 닫을 때 확인 다이얼로그로 실수 종료를 방지합니다.

## 다운로드 (Windows)

[Releases](https://github.com/gloz9102/mergit/releases)에서 받을 수 있습니다.

| 파일 | 설명 |
|---|---|
| `Mergit-Setup-x.x.x.exe` | 원클릭 설치 버전 |
| `Mergit-Portable-x.x.x.exe` | 설치 없이 바로 실행 |

**실행 전 확인:**
- PC에 **git이 설치되어 있어야 합니다** (`git --version`으로 확인).
- 코드 서명이 없는 빌드라 SmartScreen 경고가 뜰 수 있습니다 — **"추가 정보" → "실행"** 으로 진행하세요.

**업데이트:**
- 설정의 *자동 업데이트 확인*(기본 켜짐)이 켜져 있으면 앱 시작 시와 20분마다 최신 릴리스를 확인합니다.
- **Windows 설치 빌드**에서는 새 버전을 자동으로 내려받아 설치할 수 있습니다(설정의 자동 다운로드 옵션). 그 외 환경에서는 새 버전을 알리고 릴리스 페이지로 안내합니다.
- 설정창에서 언제든 수동으로 업데이트를 확인할 수 있습니다.

macOS / Linux는 아직 패키지를 제공하지 않습니다. 아래 "소스에서 실행"으로 사용할 수 있습니다.

## 소스에서 실행

요구 사항: Node.js 20+, git

```bash
git clone https://github.com/gloz9102/mergit.git
cd mergit
npm install
npm run dev        # Electron 개발 모드 (HMR)
```

| 스크립트 | 설명 |
|---|---|
| `npm run dev` | 개발 모드 실행 |
| `npm test` | Vitest 단위/통합 테스트 |
| `npm run typecheck` | TypeScript 검사 |
| `npm run build` | 프로덕션 번들 (out/) |
| `npm run dist:win` | Windows 설치 파일 빌드 (release/) |
| `npm run dist:mac` | macOS DMG 빌드 (release/) |

## 의도적으로 하지 않는 것

Mergit은 모든 Git 기능을 담는 도구가 아닙니다. 자주 쓰는 핵심 흐름을 작고 안전하게 제공하는 것을 목표로 합니다.

- GitHub/GitLab PR·이슈·계정 연동
- GitFlow 전용 UI
- submodule 관리 UI
- tag CRUD
- GPG signing 설정 UI
- interactive rebase 전체 UI
- AI commit message 생성
- 자체 credential manager

## 아키텍처

```
┌─────────────────────────────── Electron ───────────────────────────────┐
│  Main 프로세스                      Renderer (React + Tailwind)         │
│  ┌──────────────┐   타입드 IPC     ┌──────────────────────────────┐    │
│  │ GitService   │◄────(봉투 응답)──►│ zustand 스토어 → 컴포넌트      │    │
│  │ (simple-git) │                  │ GraphView / Staging /         │    │
│  │ RepoWatcher  │──repo-changed──► │ ConflictEditor / Settings     │    │
│  │ UpdateService│──update-event──► │ i18n(ko, en)                  │    │
│  └──────────────┘                  └──────────────────────────────┘    │
│            └── 순수 로직은 src/shared/ (로그 파서 · 레인 배치 · conflict 파서) │
└─────────────────────────────────────────────────────────────────────────┘
```

- **git 작업은 전부 main 프로세스**의 `GitService`(simple-git 래퍼)가 수행하고, renderer는 contextBridge로 노출된 `window.api`만 사용합니다 (`nodeIntegration: false`, `contextIsolation: true`).
- `RepoWatcher`는 외부 git 변경을 감지해 화면을 갱신하고, `UpdateService`는 릴리스 버전 확인과 Windows 자동 업데이트를 담당합니다. 창 생애주기(마지막 창 종료 확인 등)는 별도 모듈로 분리되어 있습니다.
- IPC 응답은 `{ ok, data } | { ok: false, error }` 봉투로 통일 — 에러는 코드화되어 i18n된 토스트로 표시됩니다.
- 그래프 레인 배치, git log 파싱, conflict 마커 파싱은 `src/shared/`의 순수 함수로 분리되어 단위 테스트됩니다.

```
src/
  main/        # Electron main — GitService, IPC, RepoWatcher, UpdateService, window lifecycle
  preload/     # contextBridge 브리지 (window.api)
  renderer/    # React UI — 컴포넌트, 스토어, i18n
  shared/      # main/renderer 공유 순수 로직 + 타입
```

## 테스트

```bash
npm test
```

Vitest가 `.test.ts`와 `.test.tsx`를 모두 실행합니다.

- **순수 로직 단위 테스트** — 로그 파서, 레인 배치 알고리즘, conflict 파서/빌더, 버전 비교, fuzzy 매칭, 그래프 엣지.
- **`GitService` 통합 테스트** — 임시 디렉토리에 실제 git 저장소를 만들어 충돌 머지 → 해결 → 머지 커밋까지 재현. RepoWatcher·name-status 파싱 포함.
- **Renderer 테스트** — ConflictEditor / StagingPanel / CommitDetail 컴포넌트, 스토어의 stale 응답·경합 처리(run 헬퍼, repo/ui 스토어).
- **업데이트·창 생애주기 테스트** — UpdateService 버전 확인 흐름과 종료 확인 동작.

## 알려진 한계

- hunk/line 단위 staging은 아직 지원하지 않습니다.
- 3-way conflict editor에서 base 패널과 자동 비충돌 적용은 아직 지원하지 않습니다.
- rebase(인터랙티브 포함), tag 관리, GPG 서명은 지원하지 않습니다.
- 한 창에서는 저장소 하나만 엽니다. 여러 저장소는 새 창으로 열 수 있습니다.
- GitHub/GitLab 연동(PR, 이슈)은 없습니다.
- 그래프 레인 배치는 첫-부모-우선 휴리스틱이라 복잡한 머지 히스토리에서 레인이 교차할 수 있습니다.

## 라이선스

[MIT](LICENSE)
