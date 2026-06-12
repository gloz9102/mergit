## shared 순수성
- src/shared에는 Node·Electron·React 의존 코드를 두지 않는다(순수 함수·타입만)
- 파싱·알고리즘(logParser, lanes, conflicts)은 shared에 두고 단위 테스트한다
