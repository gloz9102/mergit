## 계층 분리
- src/main: Electron 메인 프로세스, git 작업(GitService, RepoWatcher)
- src/renderer: React UI
- src/preload: contextBridge로 window.api 노출
- src/shared: 공유 순수 로직·타입
