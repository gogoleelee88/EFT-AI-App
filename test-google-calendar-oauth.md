# 구글 캘린더 OAuth 403 오류 해결 가이드

## 📋 체크리스트

### ✅ Google Cloud Console 설정 완료 여부

- [ ] **Google Calendar API 활성화**
  - 링크: https://console.cloud.google.com/apis/library/calendar-json.googleapis.com
  - "API enabled" 확인

- [ ] **OAuth Client ID Redirect URI 등록**
  - 링크: https://console.cloud.google.com/apis/credentials
  - Client ID: `YOUR_GOOGLE_OAUTH_CLIENT_ID`
  - Redirect URI: `http://localhost:8000/api/spec/google/callback`

- [ ] **OAuth 동의 화면 테스트 사용자 추가**
  - 링크: https://console.cloud.google.com/apis/credentials/consent
  - Publishing status: "Testing"
  - Test users: 본인 Gmail 주소 추가

## 🧪 테스트 방법

### 1. 백엔드 서버 실행 확인

```bash
# 터미널에서 확인
curl http://localhost:8000/health
# 또는
curl http://localhost:8000/api/spec/google/status
```

예상 응답:
```json
{"connected": false}  // 아직 연동 전
```

### 2. OAuth 인증 URL 받기

```bash
# 로그인된 상태에서 (쿠키 포함)
curl -X GET http://localhost:8000/api/spec/google/auth \
  -H "Cookie: access_token=YOUR_JWT_TOKEN"
```

예상 응답:
```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?..."
}
```

### 3. 브라우저에서 OAuth 플로우 테스트

1. **프론트엔드 앱 실행**:
   ```bash
   npm run dev
   ```

2. **로그인 후 일정 관리 페이지 접속**:
   ```
   http://localhost:5173/plan/day
   ```

3. **"Google 캘린더 연동" 버튼 클릭**

4. **Google 동의 화면 확인**:
   - ✅ 성공: 권한 요청 화면 표시
   - ❌ 실패 (403): "앱이 차단됨" 또는 "unauthorized_client" 오류

5. **동의 후 리다이렉트**:
   ```
   http://localhost:8000/api/spec/google/callback?code=...&state=...
   ```
   - ✅ 성공: `/plan/day?google=connected`로 리다이렉트
   - ❌ 실패: 403 오류 또는 "redirect_uri_mismatch"

### 4. 연동 상태 확인

```bash
curl -X GET http://localhost:8000/api/spec/google/status \
  -H "Cookie: access_token=YOUR_JWT_TOKEN"
```

예상 응답:
```json
{"connected": true}  // 연동 완료!
```

## 🚨 오류별 해결 방법

### 오류 1: `redirect_uri_mismatch`

**증상**:
```
Error 400: redirect_uri_mismatch
The redirect URI in the request, http://localhost:8000/api/spec/google/callback, 
does not match the ones authorized for the OAuth client.
```

**원인**: OAuth Client ID의 Redirect URI가 등록되지 않음

**해결**:
1. https://console.cloud.google.com/apis/credentials
2. Client ID 클릭
3. Authorized redirect URIs에 `http://localhost:8000/api/spec/google/callback` 추가
4. SAVE

---

### 오류 2: `access_denied` 또는 403

**증상**:
```
Error 403: access_denied
This app is blocked
```

**원인**: OAuth 동의 화면이 "Testing" 모드이고 테스트 사용자가 아님

**해결**:
1. https://console.cloud.google.com/apis/credentials/consent
2. Test users 섹션에서 ADD USERS
3. 본인 Gmail 주소 추가
4. SAVE

---

### 오류 3: `unauthorized_client`

**증상**:
```
Error 401: unauthorized_client
Client is unauthorized to retrieve access tokens using this method
```

**원인**: OAuth Client ID 설정 문제

**해결**:
1. OAuth Client ID의 Application type이 "Web application"인지 확인
2. Client ID와 Client Secret이 `.env` 파일과 일치하는지 확인

---

### 오류 4: Calendar API 권한 오류

**증상**:
```
Google Calendar API has not been used in project ... before or it is disabled
```

**원인**: Google Calendar API가 활성화되지 않음

**해결**:
1. https://console.cloud.google.com/apis/library/calendar-json.googleapis.com
2. ENABLE API 클릭

---

## 📊 설정 확인 스크립트

다음 명령으로 현재 설정 상태를 확인할 수 있습니다:

```bash
# 백엔드 환경변수 확인
grep GOOGLE backend/.env

# 예상 출력:
# GOOGLE_CLIENT_ID=YOUR_GOOGLE_OAUTH_CLIENT_ID
# GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_OAUTH_CLIENT_SECRET
# GOOGLE_REDIRECT_URI=http://localhost:8000/api/spec/google/callback
```

## 🎯 최종 확인 사항

설정 완료 후 다음을 확인하세요:

1. ✅ Google Calendar API 활성화됨
2. ✅ OAuth Client ID Redirect URI: `http://localhost:8000/api/spec/google/callback` 등록됨
3. ✅ OAuth 동의 화면 테스트 사용자에 Gmail 추가됨
4. ✅ `.env` 파일의 Client ID/Secret이 정확함
5. ✅ 백엔드 서버 실행 중 (`localhost:8000`)
6. ✅ 프론트엔드 서버 실행 중 (`localhost:5173`)

## 💡 성공 시나리오

```
[사용자] → [프론트엔드] → "Google 캘린더 연동" 버튼 클릭
         ↓
[백엔드] → GET /api/spec/google/auth
         ↓
[Google] → OAuth 동의 화면 표시
         ↓ (사용자 동의)
[Google] → 리다이렉트: http://localhost:8000/api/spec/google/callback?code=...
         ↓
[백엔드] → code로 토큰 교환 → DB 저장
         ↓
[프론트엔드] → /plan/day?google=connected 리다이렉트
         ✅ 연동 완료!
```
