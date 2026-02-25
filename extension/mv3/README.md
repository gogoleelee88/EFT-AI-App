# MV3 Work Guide Extension

## 핵심 목적
- 앱 내부 데모 DOM이 아니라, 사용자가 실제로 열어둔 외부 웹페이지 DOM을 읽어 가이드를 제공합니다.
- 즉, 네이버/정부 사이트/사내 툴 같은 실제 업무 화면 위에 오버레이로 단계 안내가 뜹니다.

## 동작 방식
1. 사용자가 대상 페이지를 연 상태에서 확장 아이콘 클릭
2. 팝업에서 목표(goal), 상황 설명(context), 최대 단계 입력
3. content script가 현재 탭 interactive DOM 최대 200개 수집
4. 백엔드 `POST /api/work-guide/plan/dom` 호출
5. 오버레이로 현재 1단계 하이라이트 + 설명 + 확인(Yes/No) + 다음

## 절대 하지 않는 것
- 자동 클릭
- 자동 제출

## 설치
1. `chrome://extensions` 이동
2. 개발자 모드 ON
3. `압축해제된 확장 프로그램 로드`
4. `extension/mv3` 폴더 선택

## 실행 전 체크
- 백엔드 실행: `http://127.0.0.1:8000`
- 팝업 `API Base` 입력값 확인 (기본: `http://127.0.0.1:8000/api`)

## 제한사항
- `chrome://`, 웹스토어 등 브라우저 내부 페이지는 정책상 동작 불가
- 크로스 오리진 iframe 내부 DOM은 탐색이 제한될 수 있음

## 확장 포인트
- screenshot 모드 연동 (`tabs.captureVisibleTab` + `/api/work-guide/plan/screenshot`)
- 도메인별 힌트 템플릿
- popup 저장/불러오기 프리셋
