# 릴리스 절차

Mergit의 새 버전을 GitHub Releases에 배포하는 절차. 예시는 `v0.2.0` 기준 — 버전만 바꿔 그대로 사용한다.

## 사전 조건

- `gh` CLI에 릴리스 권한이 있는 계정이 로그인되어 있어야 한다 (`gh auth status`로 확인, 없으면 `gh auth login -h github.com -w`)
- Windows x64 빌드가 동작한다 (electron-builder가 NSIS 도구를 자동 다운로드)
- npm/npx가 `restore-node-options.cjs` MODULE_NOT_FOUND로 실패하면 같은 명령을 `env -u NODE_OPTIONS <명령>`으로 재실행한다

## 절차

### 1. 버전 올리기

```bash
npm version 0.2.0 --no-git-tag-version
git add -A && git commit -m "chore: v0.2.0"
```

`--no-git-tag-version`을 쓰는 이유: 태그는 4단계의 `gh release create`가 만들기 때문.

### 2. 검증 + Windows 빌드

```bash
npm test && npm run typecheck
npm run dist:win
```

- 테스트나 typecheck가 실패하면 **여기서 중단**하고 고친 뒤 다시 시작한다.
- 성공 시 `release/` 에 Windows 실행 파일과 자동 업데이트 metadata가 생긴다:
  - `Mergit-Setup-<버전>.exe` — 원클릭 설치
  - `Mergit-Portable-<버전>.exe` — 무설치 실행
  - `latest.yml` — electron-updater Windows metadata
  - `*.exe.blockmap` — differential update metadata

### 3. push

릴리스 권한 계정이 활성 상태인지 확인 후 push한다. 여러 계정을 쓰는 경우 `gh auth switch -u <릴리스 계정>` 으로 전환.

```bash
git push
```

### 4. GitHub 릴리스 생성

릴리스 노트는 `git log --oneline v<이전버전>..HEAD`로 변경 커밋을 뽑아 정리한다.

```bash
gh release create v0.2.0 \
  release/Mergit-Setup-0.2.0.exe release/Mergit-Portable-0.2.0.exe \
  release/latest.yml release/*.exe.blockmap \
  --title "Mergit v0.2.0" \
  --notes "## 변경 사항
- (변경 내용 정리)

## 실행 전 확인
- PC에 git 설치 필요 (\`git --version\`)
- 미서명 빌드라 SmartScreen 경고 시 **추가 정보 → 실행**"
```

- `gh release create`가 태그(`v0.2.0`) 생성과 push를 함께 처리한다. (저장소는 git remote에서 자동 인식)
- 릴리스 확인: `gh release view v0.2.0`

### 5. (여러 계정 사용 시) 계정 원복

```bash
gh auth switch -u <기본 계정>
```

## 체크리스트 요약

- [ ] `npm version <버전> --no-git-tag-version` + 커밋
- [ ] `npm test` / `npm run typecheck` 통과
- [ ] `npm run dist:win` → release/ 에 exe 2개, `latest.yml`, `*.exe.blockmap`
- [ ] (필요 시 계정 전환 후) `git push`
- [ ] `gh release create v<버전> <exe 2개> release/latest.yml release/*.exe.blockmap --title --notes`
- [ ] (필요 시) 계정 원복

## 알려진 한계 / 향후 개선

- **코드 서명 없음**: Windows SmartScreen 경고가 뜬다. 정식 배포 시 코드 서명 인증서 필요.
- **macOS/Linux 패키지 미제공**: README 기준 공식 배포는 Windows만 제공한다. macOS는 로컬 `npm run dist:mac` 빌드만 가능하며 자동 업데이트 대상이 아니다.
- **자동화**: `.github/workflows/release.yml`은 `v*.*.*` 태그 push 시 검증, Windows 빌드, updater metadata 확인, GitHub Release 생성을 수행한다. 수동 릴리스는 같은 artifact 계약을 확인하는 비상 절차로 유지한다.
