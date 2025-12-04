# MSW (Mock Service Worker) 비활성화 가이드

## MSW가 뭔가요?
MSW는 개발 중에 **실제 백엔드 없이도** API 테스트를 할 수 있게 해주는 모의(Mock) 서버입니다.
현재 프로젝트에서는 개발 모드에서 자동으로 활성화되어 있습니다.

## 언제 비활성화하나요?
- ✅ 실제 백엔드 서버(FastAPI)를 테스트하고 싶을 때
- ✅ GPU 서버 연결해서 진짜 AI 응답을 받고 싶을 때
- ✅ STRICT6 EFT 스크립트가 제대로 생성되는지 확인하고 싶을 때

---

## 방법 1: 환경변수로 비활성화 (추천)

### `.env.local` 파일 생성/수정
```bash
# frontend/.env.local 파일에 추가
VITE_ENABLE_MSW=false
```

### 서버 재시작
```bash
# Ctrl+C로 서버 중지 후
npm run dev
```

---

## 방법 2: 코드에서 직접 비활성화

### `frontend/src/main.tsx` 수정
```typescript
// 21번 줄 근처
async function enableMocking() {
  // ❌ 기존 코드
  // if (import.meta.env.DEV) {

  // ✅ 새 코드 (MSW 완전 비활성화)
  if (false) {  // <-- 이렇게 변경
    const { worker } = await import('./mocks/browser');
    return worker.start();
  }
}
```

### 저장 후 자동 새로고침
브라우저가 자동으로 새로고침되고 MSW가 비활성화됩니다.

---

## 방법 3: 브라우저 콘솔에서 임시 비활성화

### 개발자 도구 열기 (F12)
```javascript
// 콘솔에서 실행
localStorage.setItem('msw-disabled', 'true');
location.reload();
```

### 다시 활성화하려면
```javascript
localStorage.removeItem('msw-disabled');
location.reload();
```

---

## MSW가 비활성화되었는지 확인하는 방법

### 1. 브라우저 콘솔 확인
```
✅ MSW 활성화: "[MSW] Mocking enabled."
✅ MSW 비활성화: 위 메시지가 안 보임
```

### 2. Network 탭 확인
```
✅ MSW 활성화:
   - 요청이 즉시 완료 (0~1ms)
   - Response에 "MSW Mock" 표시

✅ MSW 비활성화:
   - 요청이 실제 서버로 감 (100ms+)
   - Response에 백엔드 데이터 표시
```

### 3. API 응답 확인
```javascript
// STRICT6 요청 시
✅ MSW: response_id에 "mock_" 접두사 있음
✅ 실제 백엔드: response_id에 UUID 형태
```

---

## 주의사항

### ⚠️ MSW 비활성화 시 필요한 것
1. **백엔드 서버 실행 중이어야 함**
   ```bash
   # 포트 8000에서 실행 중인지 확인
   curl http://localhost:8000/api/health
   ```

2. **프론트엔드 Vite 설정 확인**
   ```typescript
   // vite.config.ts - proxy 설정 필요
   server: {
     proxy: {
       '/api': 'http://localhost:8000'
     }
   }
   ```

3. **CORS 설정 확인**
   백엔드에서 `localhost:5173` (또는 5174) 허용되어야 함

---

## 문제 해결

### "Failed to fetch" 에러
- 백엔드 서버가 실행 중인지 확인: `http://localhost:8000`
- Vite proxy 설정 확인
- CORS 설정 확인

### 여전히 Mock 데이터가 나옴
- 브라우저 캐시 삭제 (Ctrl+Shift+R)
- Service Worker 해제: DevTools > Application > Service Workers > Unregister
- 포트 변경해서 재시작

### 백엔드 연결은 되는데 STRICT6가 안 됨
- 백엔드 로그 확인: `[STRICT6] EFT 스크립트 생성 완료` 메시지 있는지
- 요청 본문에 `strict_intake` 필드 제대로 들어가는지 확인
- Network 탭에서 응답에 `eft_script` 필드 있는지 확인

---

## 개발 팁

### MSW는 언제 유용한가요?
- ✅ 백엔드 개발 전 프론트 먼저 개발할 때
- ✅ GPU 서버 없이 UI만 테스트할 때
- ✅ 특정 시나리오(에러 상황 등) 테스트할 때
- ✅ 오프라인 개발할 때

### 실제 백엔드는 언제 써야 하나요?
- ✅ 통합 테스트할 때
- ✅ 실제 AI 응답 품질 확인할 때
- ✅ 성능 테스트할 때
- ✅ 배포 전 최종 테스트할 때

---

## 현재 상태 (2025-12-04)

- ✅ MSW 핸들러에 `eft_script` 필드 추가 완료
- ✅ 백엔드 서버 정상 실행 중 (포트 8000)
- ✅ 프론트엔드 정상 실행 중 (포트 5174)
- ✅ STRICT6 로직 백엔드에 구현됨

**MSW를 비활성화하지 않아도 이제 STRICT6가 작동합니다!**
하지만 실제 백엔드를 테스트하려면 위 방법으로 비활성화하세요.
