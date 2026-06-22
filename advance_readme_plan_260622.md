# README.md 개선 계획

## Summary

- `README.md`만 수정한다.
- 현재 소스 기준 버전과 기능 상태를 반영한다: `v0.6.1`, Windows 공식 배포, 자동 업데이트 20분 주기, 설정창 GitHub repo 링크, 종료 confirm.
- 기존 한국어 중심 톤과 스크린샷(`docs/screenshots/main.png`, `docs/screenshots/conflict.png`)은 유지한다.
- README는 200줄 안팎을 목표로 하고, 상세 릴리스 절차는 `docs/RELEASE.md`로 넘긴다.

## Key Changes

- 첫 영역을 정리한다.
  - 중복된 영문/국문 설명을 줄이고, 한 줄 소개 + 핵심 링크로 압축한다.
  - 현재 최신 릴리스 링크는 `releases/latest` 유지.
  - "초기 버전" 경고는 유지하되 Windows 중심 배포 상태를 명확히 쓴다.

- "한눈에 보기" 표를 최신 기능 기준으로 갱신한다.
  - 지원 항목에 설정창 GitHub repo 링크, Windows 자동 업데이트, 종료 confirm, 북마크/최근 저장소/새 창 열기를 반영한다.
  - 예정 항목은 현재 README의 `hunk·line staging`, `3-way base conflict editor`만 유지한다.

- "다운로드 / 업데이트" 섹션을 보강한다.
  - Windows 공식 배포 파일: `Mergit-Setup-x.x.x.exe`, `Mergit-Portable-x.x.x.exe`.
  - Windows packaged build에서 자동 업데이트를 지원한다고 명시한다.
  - 자동 업데이트 확인은 설정이 켜진 경우 시작 시와 20분마다 수행한다고 적는다.
  - macOS/Linux는 공식 패키지 미제공, 소스 실행만 안내한다.

- "소스에서 실행"과 스크립트 표를 `package.json`과 일치시킨다.
  - Node.js 20+, git, `npm install`, `npm run dev`.
  - 스크립트는 `dev`, `test`, `typecheck`, `build`, `dist:win`, `dist:mac`만 기재한다.

- "주요 기능"을 최신 UI 기준으로 재정렬한다.
  - 저장소 열기/새 창/북마크, 그래프/검색, staging/diff, commit/amend/undo, branch/remote/stash, conflict editor, 설정/업데이트, 종료 확인 순서로 정리한다.
  - GitHub/GitLab PR·이슈 연동은 계속 "의도적으로 하지 않는 것"에 둔다.

- "아키텍처" 섹션은 현 구조에 맞게 소폭 갱신한다.
  - main: `GitService`, `RepoWatcher`, `UpdateService`, window lifecycle.
  - preload: `window.api`.
  - renderer: React, Zustand, settings/update/conflict/staging UI.
  - shared: 타입, log parser, lanes, conflict parser, version 비교.

- "테스트" 섹션을 최신 테스트 범위로 갱신한다.
  - Vitest가 `.test.ts`와 `.test.tsx`를 실행한다고 명시한다.
  - GitService 통합 테스트, renderer lifecycle/race 테스트, update/window lifecycle 테스트를 포함한다.

## Public Docs / Interface Notes

- 코드 API, IPC 타입, 런타임 동작은 변경하지 않는다.
- README의 공개 문서 계약만 갱신한다.
- README에 없는 명령어를 추가하지 않는다.
- README에서 지원한다고 쓰는 기능은 현재 소스 또는 릴리스 문서에서 확인된 것만 포함한다.

## Test Plan

- 문서 내용 검증:
  - `package.json`의 version/scripts와 README 명령어 일치 확인.
  - `docs/screenshots/main.png`, `docs/screenshots/conflict.png`, `docs/RELEASE.md`, `LICENSE` 링크 존재 확인.
  - README의 Windows/macOS/Linux 배포 설명이 `docs/RELEASE.md`와 충돌하지 않는지 확인.
- 기본 프로젝트 검증:
  - `npm test`
  - `npm run typecheck`
  - `npm run build`

## Assumptions

- README는 한국어를 기본 언어로 유지한다.
- 기존 스크린샷은 교체하지 않고 그대로 사용한다.
- 릴리스 상세 절차는 README에 길게 복제하지 않고 `docs/RELEASE.md` 링크로 처리한다.
- README 개선만 수행하며, 코드·테스트·릴리스 설정은 변경하지 않는다.
