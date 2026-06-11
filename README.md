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
