# 🔥 Firebase 설정 가이드

## 1. Firebase 프로젝트 생성

1. [Firebase 콘솔](https://console.firebase.google.com)에 접속
2. "프로젝트 추가" 클릭
3. 프로젝트 이름: `eft-ai-app` (또는 원하는 이름)
4. Google Analytics 설정 (선택사항)
5. 프로젝트 생성 완료

## 2. 웹 앱 추가

1. Firebase 프로젝트 대시보드에서 웹 아이콘 `</>` 클릭
2. 앱 닉네임: `EFT AI App Frontend`
3. Firebase Hosting 설정 (체크하지 않음)
4. 앱 등록 완료

## 3. 환경변수 설정

1. Firebase 설정 정보 복사
2. 프로젝트 루트에 `.env` 파일 생성:

```bash
# .env 파일 생성
cp .env.example .env
```

3. `.env` 파일에 Firebase 설정값 입력:

```env
VITE_FIREBASE_API_KEY=your_actual_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

## 4. Authentication 설정

1. Firebase 콘솔 → Authentication → 시작하기
2. Sign-in method 탭 → Google 제공업체 활성화
3. 프로젝트 지원 이메일 설정
4. 저장

### Google OAuth 설정 추가사항:

1. **승인된 JavaScript 출처** 추가:
   - `http://localhost:5173` (개발용)
   - `https://your-domain.com` (배포용)

2. **승인된 리디렉션 URI** 추가:
   - `http://localhost:5173` (개발용)
   - `https://your-domain.com` (배포용)

## 5. Firestore Database 설정

1. Firebase 콘솔 → Firestore Database → 데이터베이스 만들기
2. **테스트 모드**로 시작 (개발용)
3. 지역 선택: `asia-northeast3 (Seoul)` 권장

### 보안 규칙 설정 (나중에 프로덕션용으로 변경):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 사용자 본인의 데이터만 읽기/쓰기 가능
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // AI 대화 데이터 (사용자 본인만)
    match /conversations/{userId}/messages/{messageId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // 통찰 데이터 (사용자 본인만)
    match /insights/{userId}/personal/{insightId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 6. Storage 설정

1. Firebase 콘솔 → Storage → 시작하기
2. 테스트 모드로 시작
3. 지역: `asia-northeast3 (Seoul)`

## 7. 개발 서버 실행

```bash
# 의존성 설치
npm install

# 개발 서버 시작
npm run dev
```

## 8. 배포 준비 (나중에)

### Firestore 보안 규칙 강화:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 인증된 사용자만 자신의 데이터 접근
    match /users/{userId} {
      allow read, write: if request.auth != null 
        && request.auth.uid == userId
        && validateUserData(request.resource.data);
    }
  }
  
  function validateUserData(data) {
    return data.keys().hasAll(['uid', 'email', 'level', 'xp', 'gems'])
      && data.level is number
      && data.xp is number
      && data.gems is number;
  }
}
```

### Environment 변수 (프로덕션):
```env
VITE_FIREBASE_API_KEY=production_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-prod-project.firebaseapp.com
# ... 프로덕션 설정값들
```

## 🔒 보안 체크리스트

- [ ] `.env` 파일이 `.gitignore`에 포함되어 있는지 확인
- [ ] Firebase 보안 규칙이 적절히 설정되어 있는지 확인
- [ ] Google OAuth 승인된 도메인이 올바르게 설정되어 있는지 확인
- [ ] 프로덕션 환경에서는 테스트 모드 해제
- [ ] API 키 노출 방지 확인

## 🚨 문제 해결

### 인증 오류
- Google OAuth 설정 확인
- 승인된 도메인 리스트 확인
- 브라우저 팝업 차단 해제

### Firestore 권한 오류
- 보안 규칙 확인
- 사용자 인증 상태 확인
- 올바른 컬렉션/문서 경로 사용

### 환경변수 인식 안됨
- `.env` 파일 위치 확인 (frontend 폴더 내)
- `VITE_` 접두사 확인
- 개발 서버 재시작

---

**✅ 설정 완료 후 Google 로그인이 정상 작동하면 EFT AI 앱 개발 시작!**