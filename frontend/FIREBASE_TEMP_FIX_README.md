# 🔧 임시 수정 기록 (2025-12-01)

## 수정 사항

### 1. `.env.development` 파일 생성
**목적**: Firebase `auth/invalid-api-key` 에러 해결 (12월 5일 발표용)

**원래 상태**:
- `.env.development` 파일 없음
- `firebase/config.ts`에서 `demo-api-key` 폴백 사용
- Firebase 초기화 실패로 콘솔 에러 발생

**임시 해결**:
```env
VITE_FIREBASE_API_KEY=AIzaSyDummy-Development-Key-Only-12345678
VITE_FIREBASE_AUTH_DOMAIN=eft-ai-dev.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=eft-ai-dev
VITE_FIREBASE_STORAGE_BUCKET=eft-ai-dev.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef123456
```

**복구 방법**:
1. 실제 Firebase 프로젝트 생성
2. Firebase Console에서 실제 키 복사
3. `.env.development`에 실제 값으로 교체
4. 이 파일 삭제: `FIREBASE_TEMP_FIX_README.md`

---

## 주의사항

⚠️ **현재 설정은 개발 전용 임시 설정입니다**
- Firebase 인증 실제로 작동 안 함
- 로그인 기능 사용 불가
- 12월 7일 GPU 서버 복구 후 실제 Firebase 설정 필요

---

## 원본 복구 (만약 문제 생기면)

### 옵션 1: `.env.development` 삭제
```bash
rm .env.development
```
→ Firebase 에러는 다시 나지만, 원래 상태로 복구됨

### 옵션 2: Firebase 완전 비활성화
`src/firebase/config.ts` 수정:
```ts
export const auth = null as any;
export const db = null as any;
export const storage = null as any;
```

---

## 타임라인

- **2025-12-01**: 임시 수정 (콘솔 에러 제거)
- **2025-12-05**: 발표 (PWA 홈페이지로 사용)
- **2025-12-07**: GPU 서버 복구, 실제 Firebase 설정 적용

---

## 파일 위치

- `.env.development` (이번에 생성)
- `.env.development.backup_YYYYMMDD_HHMMSS` (자동 백업)
- `src/firebase/config.ts` (수정 안 함, 그대로 유지)

---

**수정자**: Claude
**날짜**: 2025-12-01
**사유**: 12월 5일 발표용 긴급 수정
