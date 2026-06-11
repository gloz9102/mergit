# GitKraken 클론 — 설계 문서

날짜: 2026-06-11
상태: 사용자 승인 완료 (브레인스토밍 세션)

## 개요

GitKraken 형태의 git 관리 데스크톱 애플리케이션. 한국어/영어를 지원하고, 기본적인
git 관리 기능(로컬 + 원격)과 conflict 해결에 특화된 UI/UX를 제공한다.

## 확정된 결정 사항

| 항목 | 결정 |
|---|---|
| 플랫폼 | Electron + React + TypeScript |
| 기능 범위 | 코어 + 원격 (아래 상세) |
| Conflict UI | 3-패널 (GitKraken 방식: Ours/Theirs 체크박스 + 편집 가능 Output) |
| 메인 레이아웃 | 3단 클래식 (좌: 트리 / 중앙: 그래프 / 우: 상세·staging) |
| Git 백엔드 | simple-git (그래프 로그만 `.raw()` 커스텀 파싱) |

## 기능 범위

포함:

- 저장소 열기 (디렉토리 선택 다이얼로그, 최근 저장소 목록)
- 커밋 그래프 (`git log --all`, 브랜치 레인 시각화, WIP 행 표시)
- Stage / Unstage / Commit (파일 단위)
- 브랜치 생성 · 전환(checkout) · 삭제 · 이름 변경
- Merge + conflict 해결 (3-패널 에디터)
- Push / Pull / Fetch (시스템 git의 credential helper / ssh 설정 그대로 사용)
- Stash (저장 / 적용 / 삭제)
- 한국어/영어 i18n (시스템 로케일 자동 감지 + 설정에서 수동 전환)

제외 (이번 범위 아님):

- rebase(인터랙티브 포함), cherry-pick, tag 관리, GPG 서명
- GitHub/GitLab 등 호스팅 서비스 연동 (PR, 이슈)
- 멀티 저장소 탭 (단일 저장소 1개만 열기 — 구조는 확장 가능하게)
- UI E2E 테스트

## 아키텍처

- 빌드: **electron-vite** — main / preload / renderer 일괄 빌드, HMR.
- **Main 프로세스 (Node)**
  - `GitService`: simple-git 인스턴스로 모든 git 작업 수행. 결과는 직렬화 가능한
    DTO로 변환해 반환.
  - `RepoWatcher`: `.git` 디렉토리와 워킹 트리 변경 감지(debounce) →
    renderer로 `repo-changed` 이벤트 push.
  - 로그 파서: `git log --all` 커스텀 포맷(`--format` 구분자 기반) 출력을 파싱해
    부모 해시를 포함한 커밋 DTO 리스트 생성.
- **Preload**: contextBridge로 타입드 API(`window.api.git.*`, `window.api.on*`)만
  노출. `nodeIntegration: false`, `contextIsolation: true`.
- **Renderer (React + TS)**
  - 상태 관리: zustand — 저장소 데이터 스토어(커밋, 브랜치, status)와
    UI 스토어(선택 상태, 패널, 다이얼로그) 분리.
  - i18n: i18next + react-i18next. `src/renderer/locales/ko.json`, `en.json`.
    모든 UI 문자열은 키 기반. 최초 실행 시 시스템 로케일 감지, 설정 모달에서
    전환, 선택값은 로컬 설정 파일에 저장.
  - 스타일: Tailwind CSS, GitKraken풍 다크 테마 기본.
  - 에디터: CodeMirror 6 — conflict Output 패널(편집 가능), diff 뷰어(읽기 전용).

## 화면 구성 (3단 클래식)

```
┌──────────────────────────────────────────────────────┐
│ 툴바: 저장소 열기 | Pull Push Fetch Branch Stash | 설정 │
├──────────┬────────────────────────┬──────────────────┤
│ LOCAL    │  커밋 그래프            │ 커밋 상세 / 또는   │
│ REMOTE   │  (WIP 행 최상단,        │ STAGING 패널      │
│ STASH    │   레인 + 브랜치 라벨)    │ (diff 뷰어 포함)   │
└──────────┴────────────────────────┴──────────────────┘
```

- **LeftPanel**: LOCAL / REMOTE / STASH 트리. 브랜치 우클릭 컨텍스트 메뉴
  (checkout, merge into current, delete, rename). 현재 브랜치 표시.
- **GraphView**: 레인 배치 알고리즘(부모 해시 기반) + SVG 렌더링.
  대형 저장소 대비 가상 스크롤(보이는 행만 렌더). 행 클릭 시 우측에 커밋 상세.
  워킹 트리에 변경이 있으면 최상단에 WIP 행 표시 → 클릭 시 staging 패널.
- **RightPanel**:
  - 커밋 선택: 메시지, 작성자, 변경 파일 목록, 파일 클릭 시 diff.
  - WIP 선택: Unstaged / Staged 파일 목록, 파일 단위 stage/unstage 버튼,
    커밋 메시지 입력 + Commit 버튼.

## Conflict 해결 UI (3-패널)

merge에서 충돌 발생 시:

1. 상단에 "머지 진행 중" 배너 표시 — 충돌 파일 수, **Abort Merge** 버튼,
   전체 해결 시 활성화되는 **Commit Merge** 버튼.
2. 충돌 파일 목록에서 파일 클릭 → ConflictEditor 진입.
3. **ConflictEditor 구조**
   - 상단 좌: **Ours** (현재 브랜치) — 충돌 블록별 체크박스.
   - 상단 우: **Theirs** (병합 대상 브랜치) — 충돌 블록별 체크박스.
   - 양쪽 모두 체크 시 Ours → Theirs 순으로 둘 다 포함.
   - 하단: **Output** — 체크 결과가 실시간 반영되는 CodeMirror 에디터,
     직접 편집 가능.
   - 충돌 블록 카운터: `2/5 해결됨`. 블록 간 이동 버튼(이전/다음).
4. 파싱: 파일 내용에서 `<<<<<<<` / `=======` / `>>>>>>>` 마커를 파싱해
   공통 영역 + 충돌 블록 리스트로 분해.
5. **저장** 버튼 → 결과 파일 저장 + `git add` (resolved 처리).
6. 모든 충돌 파일이 resolved되면 배너의 Commit Merge 활성화 →
   기본 머지 커밋 메시지로 커밋.

## 데이터 흐름

```
UI 액션 → window.api.git.* (ipcRenderer.invoke)
        → main: IPC 핸들러 → GitService → simple-git
        → DTO 반환 → zustand 스토어 갱신 → React 리렌더

외부 변경(터미널 git 등) → RepoWatcher → 'repo-changed' push
                        → renderer가 status/log 재조회
```

- IPC 채널과 DTO 타입은 `src/shared/` 에 단일 정의 — main/preload/renderer가
  공유해 타입 불일치 방지.

## 에러 처리

- `GitService`가 모든 git 에러를 `{ code, message, detail }` DTO로 변환.
  `detail`에 원본 stderr 보존.
- Renderer는 i18n된 메시지로 토스트 표시, "상세 보기" 펼침으로 stderr 노출.
- 파괴적 작업은 확인 다이얼로그 필수: 브랜치 강제 삭제(미머지),
  변경 사항 discard, merge abort.
- push/pull 인증 실패 등 git 설정 문제는 안내 메시지로 시스템 git 설정을
  확인하도록 유도 (앱 내 credential 관리 없음).

## 테스트

Vitest 사용, 두 층위:

1. **순수 로직 단위 테스트**: 로그 파서, 그래프 레인 배치 알고리즘,
   conflict 마커 파서 — 입력 문자열 → 출력 구조 검증.
2. **GitService 통합 테스트**: 임시 디렉토리에 실제 git 저장소 픽스처 생성
   (init → 커밋 → 브랜치 분기 → 충돌 유발 merge까지 스크립트로 재현),
   서비스 메서드 호출 결과 검증.

UI E2E는 범위 외.

## 성공 기준

- 실제 저장소를 열어 그래프 확인, 파일 stage → 커밋, 브랜치 생성/전환,
  push/pull이 동작한다.
- 충돌이 있는 merge를 수행하면 3-패널 에디터로 모든 충돌을 해결하고
  머지 커밋을 만들 수 있다.
- 설정에서 한국어 ↔ 영어 전환 시 모든 UI 문자열이 즉시 바뀐다.
- 단위/통합 테스트 전부 통과.
