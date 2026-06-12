## Zustand 스토어
- repoStore: 커밋·브랜치·status·stash 등 git 상태
- uiStore: 선택·검색·토스트·pending 등 UI 상태
- 컴포넌트 밖에서는 useXxxStore.getState()로 접근
