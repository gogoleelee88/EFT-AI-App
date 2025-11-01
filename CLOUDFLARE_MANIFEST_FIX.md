# Cloudflare로 manifest.json CORS 문제 해결하기

## 🎯 문제 상황
- URL: `https://moodtalk.app/meditation`
- 오류: `Access to manifest at 'https://www.moodtalk.app/manifest.json' has been blocked by CORS policy`
- 원인: moodtalk.app → www.moodtalk.app 리다이렉트로 인한 크로스 오리진 문제

## ✅ Cloudflare Transform Rules로 해결 (sudo 불필요!)

### 1단계: Cloudflare 대시보드 접속

```
https://dash.cloudflare.com
```

1. 로그인
2. **moodtalk.app** 도메인 선택

### 2단계: Transform Rules 생성

**경로**: `Rules` → `Transform Rules` → `Modify Response Header`

**버튼 클릭**: `Create rule`

### 3단계: Rule 설정

#### Rule 이름
```
manifest-cors-fix
```

#### When incoming requests match...

**Field**: `URI Path`
**Operator**: `equals`
**Value**: `/manifest.json`

또는 더 넓게:

**Field**: `URI Path`
**Operator**: `ends with`
**Value**: `.json`

#### Then...

**Operation**: `Set static`

**Header name**: `Access-Control-Allow-Origin`
**Value**: `*`

#### 추가 헤더 (선택사항)

**+ Set static**:
- **Header name**: `Access-Control-Allow-Methods`
- **Value**: `GET, OPTIONS`

**+ Set static**:
- **Header name**: `Access-Control-Allow-Headers`
- **Value**: `Content-Type`

### 4단계: Rule 저장

**버튼 클릭**: `Deploy`

---

## 🧪 테스트 방법

### 1. 즉시 테스트 (캐시 우회)

```bash
curl -I "https://www.moodtalk.app/manifest.json?nocache=$(date +%s)"
```

**확인할 헤더**:
```
Access-Control-Allow-Origin: *
```

### 2. 브라우저에서 테스트

1. 브라우저 캐시 완전 삭제:
   - Chrome: `Ctrl+Shift+Delete` → "캐시된 이미지 및 파일" 체크 → "전체 기간" → 삭제

2. 페이지 접속:
   ```
   https://www.moodtalk.app/meditation
   ```

3. F12 → Console 탭 확인
   - CORS 오류 없어야 함 ✅

### 3. 캐시 퍼지 (필요시)

Cloudflare 대시보드:
1. `Caching` → `Configuration`
2. `Purge Everything` 클릭
3. 또는 특정 파일만: `Purge by URL`
   - URL: `https://www.moodtalk.app/manifest.json`

---

## 📊 설정 스크린샷 예시

```
┌─────────────────────────────────────────────────┐
│ Create Transform Rule                           │
├─────────────────────────────────────────────────┤
│ Rule name: manifest-cors-fix                    │
│                                                 │
│ When incoming requests match...                 │
│ ┌─────────────────────────────────────────────┐ │
│ │ Field       │ Operator │ Value              │ │
│ │ URI Path    │ equals   │ /manifest.json     │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ Then...                                         │
│ ┌─────────────────────────────────────────────┐ │
│ │ Set static header                           │ │
│ │ Access-Control-Allow-Origin: *              │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│          [Cancel]           [Deploy]            │
└─────────────────────────────────────────────────┘
```

---

## 🔍 문제 해결

### 문제 1: "Rule이 적용 안 됨"

**해결**:
1. Cloudflare 캐시 퍼지
2. 브라우저 캐시 완전 삭제
3. 5분 대기 (전파 시간)

### 문제 2: "여전히 CORS 오류"

**확인**:
```bash
# 헤더 직접 확인
curl -I https://www.moodtalk.app/manifest.json

# CORS 헤더 있는지 확인
curl -I https://www.moodtalk.app/manifest.json | grep -i "access-control"
```

### 문제 3: "Rule 생성 권한 없음"

**해결**:
- Cloudflare 계정 소유자에게 권한 요청
- 또는 관리자 권한 필요

---

## ✅ 성공 기준

1. **curl 테스트**:
   ```bash
   curl -I https://www.moodtalk.app/manifest.json
   ```

   **응답에 포함되어야 함**:
   ```
   HTTP/2 200
   access-control-allow-origin: *
   content-type: application/manifest+json
   ```

2. **브라우저 테스트**:
   - F12 Console에 CORS 오류 없음 ✅
   - Network 탭에서 manifest.json HTTP 200 ✅
   - /meditation 페이지 정상 로드 ✅

3. **PWA 기능**:
   - 홈 화면에 추가 프롬프트 정상 작동 ✅
   - manifest.json 정보 정상 읽음 ✅

---

## 🚀 대안 방법 (Transform Rules가 안 되는 경우)

### 방법 1: Cloudflare Workers

```javascript
// Worker 코드
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const response = await fetch(request)

  if (request.url.endsWith('/manifest.json')) {
    const newResponse = new Response(response.body, response)
    newResponse.headers.set('Access-Control-Allow-Origin', '*')
    return newResponse
  }

  return response
}
```

**Route**: `moodtalk.app/manifest.json`

### 방법 2: Page Rules (무료 플랜 3개 제한)

1. `Rules` → `Page Rules`
2. URL: `*moodtalk.app/manifest.json`
3. Setting: `Cache Level` → `Standard`
4. (Transform Rules가 더 좋음)

---

## 📝 최종 체크리스트

- [ ] Cloudflare 대시보드 접속 완료
- [ ] Transform Rule 생성 완료
- [ ] Rule 이름: `manifest-cors-fix`
- [ ] URI Path equals `/manifest.json`
- [ ] Header: `Access-Control-Allow-Origin: *`
- [ ] Rule Deploy 완료
- [ ] 캐시 퍼지 완료
- [ ] curl 테스트 통과
- [ ] 브라우저 테스트 통과
- [ ] /meditation 페이지 정상 작동

---

## 🎯 예상 완료 시간

**5~10분** (Cloudflare 전파 시간 포함)

Transform Rule 생성: 2분
캐시 퍼지: 1분
테스트: 2분
전파 대기: 5분
