# 배포 후 자가검증 가이드

## 📋 개요

이 문서는 `deploy_postcheck.sh` 스크립트 사용법과 Nginx 캐싱 설정을 설명합니다.

---

## 🚀 빠른 시작

### 1. 스크립트 실행 권한 부여

```bash
chmod +x deploy_postcheck.sh
```

### 2. 배포 후 검증 실행

```bash
bash deploy_postcheck.sh
```

---

## 📊 실행 예시

### ✅ 성공 케이스

```text
========================================
  배포 후 자가검증 스크립트
  2025-10-02 11:23:45
========================================

[STEP] A. Extracting bundle path from index.html
[INFO] Downloaded index.html (5303 bytes)
[INFO] Extracted: /assets/index-BcWyEr4G.js ✓

[STEP] B. Comparing Origin vs CDN hash
[INFO] Origin: http://127.0.0.1:8000/assets/index-BcWyEr4G.js
[INFO] Origin: HTTP 200 ✓
[INFO] CDN: https://moodtalk.app/assets/index-BcWyEr4G.js
[INFO] CDN: HTTP 200 ✓
[INFO] Computing SHA256 hashes...
[INFO] Origin SHA256: 8f3d2a1b4c5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a
[INFO] CDN    SHA256: 8f3d2a1b4c5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a
[INFO] Hash match ✓ (Origin == CDN)

[STEP] C. Checking for legacy keywords
[INFO] Downloading bundle from CDN...
[INFO] Bundle size: 547667 bytes
[INFO] No legacy references ✓

[STEP] D. Validating Cache-Control headers
[INFO] Checking hashed bundle headers...
[INFO] Hashed bundle: Cache-Control ✓ (public, max-age=31536000, immutable)
[INFO] Checking index.html headers...
[INFO] index.html: Cache-Control ✓ (no-cache, no-store, must-revalidate)

========================================
[INFO] 🎉 All checks passed!
[INFO]   Bundle: /assets/index-BcWyEr4G.js
[INFO]   Status: Ready for production
========================================
```

### ❌ 실패 케이스 - 금칙어 발견

```text
[STEP] C. Checking for legacy keywords
[INFO] Downloading bundle from CDN...
[INFO] Bundle size: 547667 bytes
[ERROR] Found legacy keyword: 'Cmcu9lgI'
[ERROR]   → ...import{a as Cmcu9lgI}from"./vendor-abc123.js";function init(){console.log("legacy")}...
[ERROR] Legacy keyword check failed
[ERROR]   Bundle contains references to old files
```

### ❌ 실패 케이스 - 해시 불일치

```text
[STEP] B. Comparing Origin vs CDN hash
[INFO] Origin SHA256: 8f3d2a1b4c5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a
[INFO] CDN    SHA256: 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2
[ERROR] Hash mismatch!
[ERROR]   Origin and CDN serve different files
[ERROR]   This indicates cache inconsistency or deployment issue
```

---

## 🔧 검증 항목

### A. 번들 경로 추출
- `https://moodtalk.app/index.html`에서 `/assets/index-{hash}.js` 추출
- 패턴: `/assets/index-[A-Za-z0-9_-]+\.js`
- 실패 시: 즉시 종료 (exit 1)

### B. 해시 무결성 검증
- **오리진**: `http://127.0.0.1:8000/assets/...`
- **CDN**: `https://moodtalk.app/assets/...`
- 양쪽 모두 HTTP 200 응답 확인
- SHA256 해시 일치 여부 검증

### C. 금칙어 검사
현재 금칙어 리스트:
```bash
LEGACY_KEYWORDS=(
    "Cmcu9lgI"        # 구버전 index 번들 해시
    "eft-guide"       # 레거시 경로
)
```

**금칙어 추가 방법**: 스크립트 상단 `LEGACY_KEYWORDS` 배열에 문자열 추가

### D. 캐시 헤더 검증
- **해시 번들**: `immutable` 또는 `max-age=31536000` 포함 여부
- **index.html**: `no-cache` 또는 `no-store` 포함 여부

---

## 🌐 Nginx 설정 적용

### 1. 설정 파일 복사

```bash
sudo cp nginx-cache-config.conf /etc/nginx/sites-available/moodtalk.app
sudo ln -sf /etc/nginx/sites-available/moodtalk.app /etc/nginx/sites-enabled/
```

### 2. 설정 검증

```bash
sudo nginx -t
```

예상 출력:
```text
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### 3. Nginx 재시작

```bash
sudo systemctl reload nginx
# 또는
sudo nginx -s reload
```

---

## 📌 핵심 캐싱 정책

| 리소스 타입 | Cache-Control | 설명 |
|------------|---------------|------|
| `/assets/*-{hash}.js` | `public, max-age=31536000, immutable` | 1년 캐싱, 재검증 생략 |
| `/assets/*` (일반) | `public, max-age=3600` | 1시간 캐싱 |
| `*.html` | `no-cache, no-store, must-revalidate` | 캐싱 금지 |
| API (`/api/*`, `/v1/*`) | `no-store, no-cache` | 캐싱 금지 |

---

## 🔍 문제 해결

### 스크립트가 번들을 찾지 못함

**원인**: index.html이 빌드되지 않았거나 경로 패턴이 다름

**해결**:
```bash
# 프론트엔드 빌드 확인
cd frontend
npm run build

# index.html 내용 확인
curl https://moodtalk.app/index.html | grep -o '/assets/index-[^"]*\.js'
```

### 해시 불일치 오류

**원인**: CDN 캐시가 오래된 파일을 제공 중

**해결**:
```bash
# Cloudflare 캐시 퍼지 (Cloudflare 사용 시)
curl -X POST "https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/purge_cache" \
  -H "Authorization: Bearer {API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}'

# Nginx 로컬 캐시 삭제
sudo rm -rf /var/cache/nginx/*
sudo systemctl reload nginx
```

### 금칙어 발견

**원인**: 프론트엔드 빌드에서 레거시 참조가 제거되지 않음

**해결**:
```bash
# 1. node_modules 및 빌드 캐시 완전 삭제
cd frontend
rm -rf node_modules .vite dist

# 2. 클린 설치 및 빌드
npm ci
npm run build

# 3. 재배포
rsync -avz --delete dist/ user@server:/path/to/static-frontend/
```

---

## 🔐 보안 권장사항

### 1. HTTPS 강제
Nginx 설정에서 HTTP → HTTPS 리다이렉트 활성화:
```nginx
server {
    listen 80;
    server_name moodtalk.app;
    return 301 https://$server_name$request_uri;
}
```

### 2. 보안 헤더 추가
```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

---

## 📞 지원

문제 발생 시:
1. `deploy_postcheck.sh` 실행 로그 확인
2. `journalctl -u nginx -n 50` 로그 확인
3. Cloudflare 대시보드에서 캐시 상태 확인

---

**마지막 업데이트**: 2025-10-02
**버전**: 1.0.0
