# 구글 캘린더 OAuth 403 오류 디버깅 가이드

## 🔍 정확한 오류 원인 찾기

### 1. 백엔드 OAuth URL 확인

**브라우저 주소창에 직접 입력**:
```
http://localhost:8000/api/spec/google/auth
```

**예상 결과**:
```json
{
  "detail": "로그인이 필요합니다."
}
```
또는 (로그인된 경우):
```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?..."
}
```

만약 `authUrl`이 반환되면, **그 URL을 복사**해서 확인하세요:
- `client_id=` 있는지
- `redirect_uri=http://localhost:8000/api/spec/google/callback` 정확한지
- `scope=https://www.googleapis.com/auth/calendar.events` 있는지

---

### 2. 브라우저 Network 탭 디버깅

1. **F12 (개발자 도구)** 열기
2. **Network 탭** 선택
3. **"Preserve log"** 체크 ✅
4. **Google 캘린더 연동 버튼 클릭**
5. **빨간색 403 요청 찾기**
6. **클릭 후 확인**:
   - Headers → Request URL
   - Response → 오류 메시지

---

### 3. 가능한 403 오류 원인

#### A. "OAuth client was not found"
**원인**: Client ID가 비활성화되었거나 삭제됨
**해결**: 
```
https://console.cloud.google.com/apis/credentials
→ Client ID 상태 확인
→ 필요시 새로 생성
```

#### B. "This app is blocked"
**원인**: OAuth 동의 화면 설정 문제
**해결**:
```
https://console.cloud.google.com/apis/credentials/consent
→ "게시됨" 또는 "테스트 중" 확인
→ 테스트 사용자 추가 (테스트 중인 경우)
```

#### C. "redirect_uri_mismatch"
**원인**: Redirect URI 불일치
**해결**:
```
백엔드 .env: http://localhost:8000/api/spec/google/callback
Google Console: 동일한 URI 등록 확인
```

#### D. "Invalid parameter value for redirect_uri"
**원인**: 잘못된 형식의 Redirect URI
**해결**:
```
슬래시 확인: /api/spec/google/callback (맞음)
슬래시 2개: //api/spec/google/callback (틀림)
```

---

## 🧪 간단한 테스트

### 백엔드 헬스체크
```bash
curl http://localhost:8000/health
```

예상 응답:
```json
{"status": "healthy"}
```

### 프론트엔드 확인
```
http://localhost:5173
```

로그인 후 개발자 도구 콘솔에서:
```javascript
fetch('/api/spec/google/auth', {
  credentials: 'include'
}).then(r => r.json()).then(console.log)
```

정상이면:
```json
{"authUrl": "https://accounts.google.com/o/oauth2/v2/auth?..."}
```

---

## 🔧 최종 해결책

모든 설정이 정확한데도 403이 발생한다면:

### 1. OAuth Client ID 새로 만들기 (가장 확실)

```
1. https://console.cloud.google.com/apis/credentials
2. "사용자 인증 정보 만들기" → "OAuth 클라이언트 ID"
3. 웹 애플리케이션 선택
4. 승인된 리디렉션 URI:
   - http://localhost:8000/api/spec/google/callback
   - https://moodtalk.app/api/spec/google/callback
5. 만들기
6. 새 Client ID/Secret 복사
7. backend/.env 업데이트
8. 백엔드 재시작
```

### 2. OAuth 동의 화면 초기화

```
1. https://console.cloud.google.com/apis/credentials/consent
2. "앱 수정" 클릭
3. 모든 단계 다시 설정:
   - 앱 이름, 이메일
   - 범위: calendar.events
   - 테스트 사용자: 본인 Gmail
4. 저장
```

### 3. 브라우저 완전 초기화

```
1. Chrome 설정 → 개인정보 및 보안
2. 쿠키 및 기타 사이트 데이터
3. "모든 사이트 데이터 보기"
4. "accounts.google.com" 검색
5. 모든 Google 쿠키 삭제
6. 브라우저 재시작
7. 시크릿 모드에서 테스트
```

---

## 📊 체크리스트

- [ ] 백엔드 서버 실행 중 (localhost:8000)
- [ ] 프론트엔드 서버 실행 중 (localhost:5173)
- [ ] Google Calendar API 활성화
- [ ] OAuth Client ID 존재 및 활성화
- [ ] 승인된 리디렉션 URI 정확히 등록
- [ ] OAuth 동의 화면 설정 완료
- [ ] 범위: calendar.events 추가
- [ ] 테스트 사용자 추가 (테스트 중인 경우)
- [ ] .env 파일 Client ID/Secret 정확
- [ ] 백엔드 서버 재시작 (env 변경 후)
- [ ] 브라우저 캐시 삭제

---

## 🎯 다음 단계

1. **브라우저 Network 탭에서 정확한 오류 URL 확인**
2. **위 가이드에서 해당 오류 찾아서 해결**
3. **여전히 안 되면: OAuth Client ID 새로 만들기**
