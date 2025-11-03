# 🧪 로컬 검증 가이드 (배포 불필요)

## 📋 목적

Slice 1 구현(5단계 Intake+Record+Branch 시스템)을 배포 없이 로컬에서 완전히 검증하는 방법입니다.

## 🛠️ 구현된 도구

### 1. MSW (Mock Service Worker)
- **목적**: 백엔드 LLM 없이 JSON 3종(Intake, Notion Record, UI Action) 응답 재현
- **파일**: `frontend/src/mocks/handlers.ts`, `frontend/src/mocks/browser.ts`
- **활성화**: 개발 모드에서 자동 활성화

### 2. 시나리오 토글
- **목적**: EFT ↔ 호흡 분기 테스트 전환
- **사용법**: 브라우저 콘솔에서 `setScenario('eft')` 또는 `setScenario('breath')`

### 3. 유닛테스트
- **목적**: 파서/라우팅 로직 확정
- **파일**: `frontend/src/components/feature/__tests__/AIChat.utils.test.ts`
- **실행**: `npm test`

## 🚀 로컬 테스트 절차

### Step 1: 개발 서버 시작
```bash
cd frontend
npm run dev
```

### Step 2: 브라우저 콘솔에서 시나리오 설정

**EFT 분기 테스트**:
```javascript
setScenario('eft')
location.reload()
```

**호흡 분기 테스트**:
```javascript
setScenario('breath')
location.reload()
```

### Step 3: AI 채팅 테스트

1. 대시보드에서 "AI 상담" 클릭
2. 임의 메시지 입력 (예: "스트레스받아요")
3. 콘솔 확인:
   - `📊 Intake JSON 추출` (1회)
   - `📝 Notion Record JSON 추출`
   - `🚀 UI Action JSON 추출`

### Step 4: SUDS 입력 및 분기 확인

1. SUDS 배너 표시 확인
2. 점수 입력 (예: 7 또는 8)
3. 콘솔 확인:
   - EFT: `🚀 start_eftar 액션 수신`
   - 호흡: `🧘 start_breath_page 액션 수신`

### Step 5: 라우팅 검증

**EFT 케이스**:
- URL: `/eftar?suds=8&script=standard_relief`
- 자동 리다이렉트: `/ar-holistic?suds=8&script=standard_relief`

**호흡 케이스**:
- URL: `/tri-modal?suds=7`

## 📊 테스트 시나리오

### Scenario A - EFT 분기
```
1. setScenario('eft')
2. AI 채팅 입력: "상사가 무시해서 화나요"
3. SUDS 입력: 8
4. 기대:
   - plan_modality: "EFT"
   - action: "start_eftar"
   - route: "/eftar"
   - 콘솔: ✅ EFT Loop confirmed
```

### Scenario B - 호흡 분기 (시간 제약)
```
1. setScenario('breath')
2. AI 채팅 입력: "불안한데 5분밖에 없어요"
3. SUDS 입력: 7
4. 기대:
   - plan_modality: "BREATH"
   - action: "start_breath_page"
   - route: "/tri-modal"
   - rationale: "시간 제약 5분 이내"
   - 콘솔: ✅ Breath Meditation Loop confirmed
```

### Scenario C - 호흡 분기 (신체 각성)
```
1. setScenario('breath')
2. AI 채팅 입력: "가슴이 두근거려요"
3. SUDS 입력: 6
4. 기대:
   - plan_modality: "BREATH"
   - rationale: "신체 증상 중심"
```

## 🧪 유닛테스트 실행

```bash
npm test
```

**테스트 내용**:
- ✅ Intake JSON 파싱
- ✅ Notion Record JSON 파싱
- ✅ UI Action JSON 파싱
- ✅ 키 누락 검증
- ✅ 잘못된 JSON 처리

## ⚠️ 실패 포인트 가드

### 1. 키 누락 경고
콘솔에서 자동 감지:
```
⚠️ NotionRecordJSON missing keys: ['rationale', 'session_notes']
```

### 2. 파싱 실패
```
⚠️ Intake JSON 파싱 실패: SyntaxError
⚠️ Notion Record JSON 파싱 실패: SyntaxError
⚠️ UI Action JSON 파싱 실패: SyntaxError
```

### 3. 라우팅 실패
- EFT: `/eftar` 페이지가 표시되지 않음
- 호흡: `/tri-modal` 페이지가 표시되지 않음

## ✅ 검증 체크리스트

- [ ] MSW 활성화 확인 (`🧪 MSW mocking enabled` 콘솔 로그)
- [ ] 시나리오 토글 기능 확인 (`setScenario` 함수 사용 가능)
- [ ] EFT 분기 테스트 통과
- [ ] 호흡 분기 테스트 통과 (시간 제약)
- [ ] 호흡 분기 테스트 통과 (신체 증상)
- [ ] Intake JSON 1회만 출력 확인
- [ ] Notion Record JSON + UI Action JSON 동시 출력 확인
- [ ] 유닛테스트 전체 통과

## 🚀 다음 단계

검증 완료 후:
1. PR 머지
2. 프로덕션 배포
3. 실제 LLM으로 통합 테스트

## 📝 참고사항

- MSW는 **개발 모드에서만** 활성화됨
- 프로덕션 빌드에서는 실제 백엔드 API 호출
- 시나리오 토글은 `localStorage`에 저장됨
