# Mergit

**Mergit** (merge + git) — 머지와 conflict 해결에 강한 GitKraken 스타일의 데스크톱 git 클라이언트.

커밋 그래프를 한눈에 보고, 충돌이 나면 3-패널 에디터에서 블록 단위로 골라 해결합니다.
한국어/영어를 지원합니다.

> ⚠️ 초기 버전입니다. 피드백과 이슈 제보를 환영합니다.

![메인 화면 — 커밋 그래프](docs/screenshots/main.png)

3-패널 conflict 해결 에디터:

![Conflict 해결 에디터](docs/screenshots/conflict.png)

## 주요 기능

- **커밋 그래프** — 브랜치 레인 시각화, 가상 스크롤로 큰 저장소도 부드럽게. 작업 중인 변경(WIP)이 그래프 최상단에 표시됩니다.
- **3-패널 conflict 해결** — 머지 충돌 시 Ours/Theirs를 나란히 놓고 블록별 체크박스로 선택, 하단 Output 에디터에서 결과를 직접 수정. 해결 진행 카운터와 충돌 블록 간 이동을 지원합니다.
- **Staging** — 파일 단위 stage / unstage / discard, diff는 중앙 패널에서 크게 확인.
- **브랜치 관리** — 생성 · 전환(더블클릭) · 이름 변경 · 삭제(미머지 시 강제 삭제 확인), 우클릭 컨텍스트 메뉴.
- **원격 작업** — Push / Pull / Fetch (시스템 git의 credential helper / SSH 설정을 그대로 사용), 진행 중 스피너 표시.
- **Stash** — 저장 / 적용 / 삭제.
- **한국어/영어** — 시스템 로케일 자동 감지, 설정에서 즉시 전환.
- **외부 변경 자동 감지** — 터미널에서 git을 사용해도 화면이 자동 갱신됩니다.

## 다운로드 (Windows)

[Releases](../../releases)에서 받을 수 있습니다.

| 파일 | 설명 |
|---|---|
| `Mergit-Setup-x.x.x.exe` | 원클릭 설치 버전 |
| `Mergit-Portable-x.x.x.exe` | 설치 없이 바로 실행 |

**실행 전 확인:**
- PC에 **git이 설치되어 있어야 합니다** (`git --version`으로 확인).
- 코드 서명이 없는 빌드라 SmartScreen 경고가 뜰 수 있습니다 — **"추가 정보" → "실행"** 으로 진행하세요.

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

## 아키텍처

```
┌─────────────────────────────── Electron ───────────────────────────────┐
│  Main 프로세스                      Renderer (React + Tailwind)         │
│  ┌──────────────┐   타입드 IPC     ┌──────────────────────────────┐    │
│  │ GitService   │◄────(봉투 응답)──►│ zustand 스토어 → 컴포넌트      │    │
│  │ (simple-git) │                  │ GraphView / Staging /         │    │
│  │ RepoWatcher  │──repo-changed──► │ ConflictEditor / i18n(ko,en)  │    │
│  └──────────────┘                  └──────────────────────────────┘    │
│            └── 순수 로직은 src/shared/ (로그 파서 · 레인 배치 · conflict 파서) │
└─────────────────────────────────────────────────────────────────────────┘
```

- **git 작업은 전부 main 프로세스**의 `GitService`(simple-git 래퍼)가 수행하고, renderer는 contextBridge로 노출된 `window.api`만 사용합니다 (`nodeIntegration: false`, `contextIsolation: true`).
- IPC 응답은 `{ ok, data } | { ok: false, error }` 봉투로 통일 — 에러는 코드화되어 i18n된 토스트로 표시됩니다.
- 그래프 레인 배치, git log 파싱, conflict 마커 파싱은 `src/shared/`의 순수 함수로 분리되어 단위 테스트됩니다.

```
src/
  main/        # Electron main — GitService, IPC, RepoWatcher
  preload/     # contextBridge 브리지
  renderer/    # React UI — 컴포넌트, 스토어, i18n
  shared/      # main/renderer 공유 순수 로직 + 타입
```

## 테스트

```bash
npm test
```

- 순수 로직 단위 테스트: 로그 파서, 레인 배치 알고리즘, conflict 파서/빌더
- `GitService` 통합 테스트: 임시 디렉토리에 실제 git 저장소를 만들어 충돌 머지 → 해결 → 머지 커밋까지 재현

## 알려진 한계

- rebase(인터랙티브 포함), cherry-pick, tag 관리, GPG 서명은 지원하지 않습니다.
- 저장소는 한 번에 하나만 열 수 있습니다.
- GitHub/GitLab 연동(PR, 이슈)은 없습니다.
- 그래프 레인 배치는 첫-부모-우선 휴리스틱이라 복잡한 머지 히스토리에서 레인이 교차할 수 있습니다.

## 라이선스

[MIT](LICENSE)
