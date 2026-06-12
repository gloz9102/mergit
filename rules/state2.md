## 액션 실행 규칙
- git 액션은 renderer/src/lib/run.ts의 run()으로 감싼다
- run()이 성공 토스트, 에러 토스트, finally의 repoStore.refresh()까지 일괄 처리한다
