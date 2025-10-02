# 배포 후 자가검증 가이드 - EFT AI App

## 📋 개요

이 문서는 moodtalk.app의 배포 후 자가검증 프로세스를 설명합니다. Service Worker와 캐시 정책의 올바른 동작을 보장합니다.

**업데이트**: 2025-10-02 (Service Worker 2단계 교체 시스템 대응)

---

## 🎯 검증 목표

### 핵심 검증 항목
1. **Service Worker**: `no-store` (항상 최신 버전)
2. **index.html**: `no-store` (빌드마다 즉시 반영)
3. **번들 파일 (/assets/*)**: `max-age=31536000, immutable` (1년 캐싱)
4. **Cloudflare 캐시 상태**: sw.js/index.html은 BYPASS, assets는 HIT

---

## 🚀 빠른 시작

### 1. 스크립트 실행 권한 부여

```bash
chmod +x deploy_postcheck.sh
```

### 2. 배포 후 검증 실행

```bash
./deploy_postcheck.sh
```

---

## 📊 실행 예시

### ✅ 성공 케이스 (Service Worker 검증 포함)

```text
========================================
  배포 후 자가검증 스크립트
  Updated: 2025-10-02 (SW Check)
  2025-10-02 13:45:12
========================================

[STEP] A. Extracting bundle path from index.html
[INFO] Downloaded index.html (5303 bytes)
[INFO] Extracted: /assets/index-BcWyEr4G.js ✓

[STEP] B. Checking CDN availability
[INFO] CDN: https://moodtalk.app/assets/index-BcWyEr4G.js
[INFO] CDN: HTTP 200 ✓
[INFO] Computing CDN SHA256 hash...
[INFO] CDN SHA256: 8f3d2a1b4c5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a
[INFO] CDN bundle available ✓

[STEP] C. Checking for legacy keywords
[INFO] Downloading bundle from CDN...
[INFO] Bundle size: 547667 bytes
[INFO] No legacy references ✓

[STEP] D. Validating Cache-Control headers (SW + Assets)

[INFO] 1) Checking sw.js (CRITICAL)...
[INFO] sw.js: Cache-Control ✓ (no-store)
[INFO] sw.js: cf-cache-status ✓ (BYPASS)
[INFO] sw.js: Service-Worker-Allowed ✓

[INFO] 2) Checking index.html...
[INFO] index.html: Cache-Control ✓ (no-cache, no-store, must-revalidate)
[INFO] index.html: cf-cache-status ✓ (DYNAMIC)

[INFO] 3) Checking hashed bundle (/assets/index-BcWyEr4G.js)...
[INFO] Hashed bundle: Cache-Control ✓ (public, max-age=31536000, immutable)
[INFO] Hashed bundle: cf-cache-status (HIT)

[INFO] All cache headers validated ✓

========================================
[INFO] 🎉 All checks passed!
[INFO]   Bundle: /assets/index-BcWyEr4G.js
[INFO]   Service Worker: Verified ✓
[INFO]   Cache Headers: Validated ✓
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

### ❌ 실패 케이스 - Service Worker가 캐시됨

```text
[STEP] D. Validating Cache-Control headers (SW + Assets)

[INFO] 1) Checking sw.js (CRITICAL)...
[ERROR] sw.js: Cloudflare is caching! (cf-cache-status: HIT/EXPIRED)
[ERROR]   Must be BYPASS or DYNAMIC
cf-cache-status: HIT
[ERROR] Cache header validation failed (1 errors)
[ERROR]   Check Cloudflare Cache Rules and Nginx config
```

**해결책**: Cloudflare Cache Rules에서 sw.js Bypass Rule을 최상단으로 이동

---

## 🔧 검증 항목 (2025-10-02 업데이트)

### A. 번들 경로 추출
- `https://moodtalk.app/index.html`에서 `/assets/index-{hash}.js` 추출
- 패턴: `/assets/index-[A-Za-z0-9_-]+\.js`
- 실패 시: 즉시 종료 (exit 1)

### B. CDN 가용성 확인
- **CDN**: `https://moodtalk.app/assets/...`
- HTTP 200 응답 확인
- SHA256 해시 무결성 검증

### C. 금칙어 검사
현재 금칙어 리스트:
```bash
LEGACY_KEYWORDS=(
    "Cmcu9lgI"        # 구버전 index 번들 해시
    "eft-guide"       # 레거시 경로
)
```

**금칙어 추가 방법**: 스크립트 상단 `LEGACY_KEYWORDS` 배열에 문자열 추가

### D. 캐시 헤더 검증 (Service Worker 포함!)

#### 1) Service Worker (최우선 검증!)
- **URL**: `https://moodtalk.app/sw.js`
- **Cache-Control**: `no-store` 필수
- **cf-cache-status**: `BYPASS` 또는 `DYNAMIC` (HIT면 오류!)
- **Service-Worker-Allowed**: `/` (스코프 루트 허용)

#### 2) index.html
- **URL**: `https://moodtalk.app/index.html`
- **Cache-Control**: `no-cache` 또는 `no-store`
- **cf-cache-status**: `BYPASS` 또는 `DYNAMIC`

#### 3) 해시 번들
- **URL**: `https://moodtalk.app/assets/index-{hash}.js`
- **Cache-Control**: `immutable` + `max-age=31536000`
- **cf-cache-status**: `HIT` (재요청 시)

**⚠️ 중요**: Service Worker 검증 실패 시 전체 검증 실패 (fail_count++)

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

## 📌 핵심 캐싱 정책 (Service Worker 포함)

| 리소스 타입 | Cache-Control | cf-cache-status | 설명 |
|------------|---------------|-----------------|------|
| `/sw.js` | `no-store, no-cache, must-revalidate, max-age=0` | BYPASS/DYNAMIC | **절대 캐시 금지!** |
| `/index.html` | `no-cache, no-store, must-revalidate` | BYPASS/DYNAMIC | 캐싱 금지 |
| `/assets/*-{hash}.js` | `public, max-age=31536000, immutable` | HIT (재요청 시) | 1년 캐싱, 재검증 생략 |
| 이미지 (png, jpg 등) | `public, max-age=2592000` | HIT | 30일 캐싱 |
| API (`/api/*`, `/v1/*`) | `no-store, no-cache` | BYPASS | 캐싱 금지 |

**⚠️ 최우선 규칙**: Service Worker는 항상 최신 버전을 제공해야 합니다!

---

## 🔍 문제 해결

### 1. Service Worker가 캐시됨 (cf-cache-status: HIT)

**증상**:
```text
[ERROR] sw.js: Cloudflare is caching! (cf-cache-status: HIT/EXPIRED)
[ERROR]   Must be BYPASS or DYNAMIC
```

**원인**: Cloudflare Cache Rule 순서가 잘못되었거나 Rule이 없음

**해결**:
1. Cloudflare 대시보드 → Rules → Cache Rules
2. "Bypass Cache - Service Worker" Rule을 **최상단**으로 이동
3. Rule 내용 확인:
   - URI Path equals `/sw.js`
   - Cache eligibility: Bypass cache
4. Purge Cache → Custom Purge → `/sw.js` 입력 후 제거
5. 재확인: `curl -I https://moodtalk.app/sw.js`

**참고**: [CLOUDFLARE_CACHE_RULES.md](./CLOUDFLARE_CACHE_RULES.md) 문서 참조

---

### 2. 스크립트가 번들을 찾지 못함

**원인**: index.html이 빌드되지 않았거나 경로 패턴이 다름

**해결**:
```bash
# 프론트엔드 빌드 확인
cd frontend
npm run build

# index.html 내용 확인
curl https://moodtalk.app/index.html | grep -o '/assets/index-[^"]*\.js'
```

---

### 3. 금칙어 발견

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
# (배포 방법은 프로젝트마다 다름)
```

---

### 4. Cloudflare 캐시 제거 방법

**Purge Everything (전체 삭제)**:
```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/purge_cache" \
  -H "Authorization: Bearer {API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}'
```

**Custom Purge (특정 파일만)**:
```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/purge_cache" \
  -H "Authorization: Bearer {API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{
    "files": [
      "https://moodtalk.app/sw.js",
      "https://moodtalk.app/index.html"
    ]
  }'
```

---

### 5. Nginx 로컬 캐시 삭제

```bash
# Nginx 캐시 디렉토리 삭제
sudo rm -rf /var/cache/nginx/*

# Nginx 재시작
sudo systemctl reload nginx
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

## 📋 배포 체크리스트

### 배포 전
- [ ] 프론트엔드 빌드 완료 (`npm run build`)
- [ ] Nginx 설정 적용 (`nginx-cache-config.conf`)
- [ ] Cloudflare Cache Rules 4개 설정 완료
- [ ] Cache Rule 순서 확인 (sw.js → index.html → assets → images)

### 배포 직후
- [ ] Cloudflare에서 sw.js Purge Cache 실행
- [ ] Cloudflare에서 index.html Purge Cache 실행
- [ ] `./deploy_postcheck.sh` 스크립트 실행
- [ ] 브라우저 DevTools에서 헤더 확인
- [ ] Service Worker 등록 상태 확인 (Application → Service Workers)

### 일주일 후
- [ ] Cloudflare Analytics에서 캐시 HIT Rate 확인
- [ ] assets/* HIT Rate > 90% 확인
- [ ] sw.js BYPASS 100% 확인
- [ ] 사용자 피드백 모니터링

---

## 📚 관련 문서

- [Nginx 캐시 설정](./nginx-cache-config.conf) - Nginx 전체 설정
- [Cloudflare Cache Rules](./CLOUDFLARE_CACHE_RULES.md) - Cloudflare 설정 가이드
- [Service Worker 마이그레이션](./SERVICE_WORKER_MIGRATION_GUIDE.md) - SW 교체 전략

---

## 📞 지원

문제 발생 시:
1. `deploy_postcheck.sh` 실행 로그 확인
2. `journalctl -u nginx -n 50` 로그 확인
3. Cloudflare Analytics에서 캐시 상태 확인
4. GitHub Issues에 문의

---

---

## 🔧 모니터링 시스템 통합 (2025-10-02 추가)

### 배포 후 모니터링 자동화

배포 검증과 함께 모니터링 시스템을 통해 지속적인 상태 확인이 가능합니다.

#### 1. systemd 자동재시작 설정 완료
```bash
# 서비스 상태 확인
systemctl --user status eft-api

# 자동 재시작 테스트
kill -9 <PID>
sleep 3
systemctl --user status eft-api  # 3초 내 자동 재시작 확인
```

**설정 위치**: `~/.config/systemd/user/eft-api.service`
- `Restart=always`, `RestartSec=3`
- 메모리 제한: 2GB, CPU: 200%
- StartLimitBurst: 10회 (재시작 폭풍 방지)

#### 2. 헬스체크 엔드포인트
```bash
# API 헬스체크
curl https://moodtalk.app/api/health
# 응답: {"ok":true,"ts":"2025-10-02T06:23:47Z","service":"eft-ai"}

# 응답 시간 측정
time curl -sS https://moodtalk.app/api/health
```

**성공 기준**:
- HTTP 200 응답
- 응답 시간 < 1초
- cf-cache-status: DYNAMIC (캐시 안 됨)

#### 3. Boot Smoke Test (확장 검증)
```bash
cd ~/tocmood/moodtalk-public/monitoring
./boot-smoke-test.sh
```

**검증 항목**:
- ✅ API /health 응답 시간 측정
- ✅ LLM 서버 상태 (선택사항)
- ✅ 정적 번들 Cloudflare 캐시 상태
- ✅ 금칙어 스캔 (localhost, 구버전)
- ✅ Service Worker 캐시 정책
- ✅ index.html 캐시 정책

#### 4. Uptime-Kuma 설치 (권장)
```bash
# Docker 권한 설정 (최초 1회)
sudo usermod -aG docker $USER
# 재로그인 필요

# Uptime-Kuma 설치
cd ~/tocmood/moodtalk-public/monitoring
./uptime-kuma-setup.sh

# 웹 UI 접속
http://localhost:3001
```

**모니터 설정**:
- API Health: https://moodtalk.app/api/health (60초)
- Frontend: https://moodtalk.app (5분)
- LLM Health: https://moodtalk.app/llm/health (2분)

#### 5. 일일 운영 체크리스트
```bash
# 서비스 상태
systemctl --user status eft-api

# 최근 에러 확인
journalctl --user -u eft-api --since "1 hour ago" -p err --no-pager | wc -l

# 디스크 사용량
df -h

# Boot Smoke Test
./monitoring/boot-smoke-test.sh
```

**성공 기준**:
- [ ] 서비스 Active (running)
- [ ] 최근 1시간 에러 < 5건
- [ ] 디스크 사용량 < 80%
- [ ] Smoke Test 통과

### 문제 발생 시 2분 내 정보 수집
```bash
cd ~/tocmood/moodtalk-public/monitoring
./extended-diagnostic.sh
# → ~/eft-diagnostics/diagnostic_YYYYMMDD_HHMMSS.log 생성
```

**관련 문서**:
- [모니터링 시스템 README](./monitoring/README.md)
- [운영 체크리스트](./monitoring/operational-checklist.md)
- [인시던트 대응 플레이북](./monitoring/incident-response-playbook.md)
- [로그 빠른 질의](./monitoring/log-quick-queries.md)

---

**마지막 업데이트**: 2025-10-02
**버전**: 3.0.0 (모니터링 시스템 통합)
