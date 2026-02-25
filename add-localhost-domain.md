# Firebase Console에서 localhost 도메인 추가하기

## 웹 인터페이스 방법 (가장 쉬움)

1. **링크 접속**:
   ```
   https://console.firebase.google.com/project/totemic-cursor-447402-e7/authentication/settings
   ```

2. **단계별 안내**:
   - 왼쪽 메뉴에서 **Authentication** (🔐 인증) 클릭
   - 상단 탭에서 **Settings** (⚙️ 설정) 클릭
   - 페이지 아래로 스크롤하여 **Authorized domains** 섹션 찾기
   
3. **도메인 추가**:
   - **Add domain** (도메인 추가) 버튼 클릭
   - 입력창에 `localhost` 입력
   - **Add** 버튼 클릭

4. **확인**:
   - 도메인 목록에 다음이 표시되어야 함:
     ✅ localhost
     ✅ totemic-cursor-447402-e7.firebaseapp.com
     ✅ totemic-cursor-447402-e7.web.app

## 스크린샷 참고

예시 화면:
```
┌─────────────────────────────────────────┐
│ Authorized domains                      │
├─────────────────────────────────────────┤
│ These domains are authorized to use     │
│ your project's authentication service.  │
│                                         │
│ [Add domain]                            │
│                                         │
│ ✅ localhost                            │
│ ✅ totemic-cursor-447402-e7.firebase... │
│ ✅ totemic-cursor-447402-e7.web.app     │
└─────────────────────────────────────────┘
```

## 추가 설정 (Google Cloud Console)

만약 위 설정만으로 해결되지 않으면:

1. **Google Cloud Console 접속**:
   ```
   https://console.cloud.google.com/apis/credentials?project=totemic-cursor-447402-e7
   ```

2. **OAuth 2.0 Client ID 설정**:
   - "Web client (auto created by Google Service)" 클릭
   - **Authorized JavaScript origins** 섹션:
     - `http://localhost` 추가
     - `http://localhost:5173` 추가
     - `http://127.0.0.1:5173` 추가
   
3. **Authorized redirect URIs** 섹션:
   - `http://localhost:5173/__/auth/handler` 추가
   - `http://localhost/__/auth/handler` 추가

## 테스트

설정 완료 후 5분 정도 기다린 뒤:

1. **브라우저 캐시 삭제**:
   - F12 → Application → Clear site data

2. **개발 서버에서 테스트**:
   ```bash
   npm run dev
   ```
   - 브라우저에서 http://localhost:5173 접속
   - Google 로그인 시도

3. **성공 확인**:
   - 콘솔에 "로그인 성공" 메시지 표시
   - 403 오류 없음
   - accountchooser 리소스 정상 로딩

## 문제 해결

### "설정이 반영되지 않아요"
- 5-10분 대기 후 재시도
- 브라우저 시크릿 모드에서 테스트

### "여전히 unauthorized-domain 오류"
- Firebase Console에서 도메인 철자 확인: `localhost` (공백 없음)
- Google Cloud Console OAuth 설정도 확인

### "팝업이 차단되었어요"
- 브라우저 주소창 오른쪽 팝업 아이콘 클릭
- "이 사이트의 팝업 항상 허용" 선택
