# Mergit (gitkrakenclone)

GitKraken 스타일의 Git 클라이언트 데스크톱 앱. 머지·충돌 해결에 특화.

## 기술 스택

- Electron + electron-vite, TypeScript(strict), React 19, Tailwind CSS 4
- 상태: Zustand / git: simple-git / 에디터: CodeMirror 6 / 다국어: i18next / 테스트: Vitest

## 명령어

| 명령 | 용도 |
|---|---|
| `npm run dev` | 개발 실행(HMR) |
| `npm test` | Vitest 테스트 |
| `npm run typecheck` | 타입 검사 |
| `npm run build` | 프로덕션 번들 |
| `npm run dist:win` | Windows 패키징 |

## 구조

- `src/main` — Electron 메인 프로세스(git 작업) / `src/preload` — window.api 노출
- `src/renderer` — React UI / `src/shared` — 공유 순수 로직·타입

## 상세 규칙 인덱스 (rules/)

각 규칙은 `rules/[rulename].md` 인덱스를 통해 200자 단위 상세 파일(`[rulename]1.md`, `[rulename]2.md`, …)로 연결된다. 규칙 추가 시 동일 구조를 따른다.

- [rules/architecture.md](rules/architecture.md) — 계층 분리, shared 순수성
- [rules/ipc.md](rules/ipc.md) — IPC Envelope 패턴, API 추가 절차
- [rules/state.md](rules/state.md) — Zustand 스토어, run() 액션 규칙
- [rules/style.md](rules/style.md) — 네이밍, 주석·문자열
- [rules/i18n.md](rules/i18n.md) — 다국어 키 관리
- [rules/testing.md](rules/testing.md) — 테스트·검증 절차
- [rules/commit.md](rules/commit.md) — 커밋 컨벤션, 사용자 확인 규칙
- [rules/release.md](rules/release.md) — 릴리스 절차

## 기타 문서

- [README.md](README.md) — 프로젝트 소개·설치
- [docs/RELEASE.md](docs/RELEASE.md) — 릴리스 상세 절차
