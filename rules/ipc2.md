## API 추가 절차
1. shared/api.ts의 GitApi와 GIT_API_METHODS에 동시 추가(불일치 시 컴파일 에러)
2. main/git/gitService.ts에 메서드 구현
3. renderer에서 window.api.<메서드>로 호출
