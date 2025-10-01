# 🌐 Cloudflare Cache Rules 설정 가이드

## 🎯 목적: HTML 캐시 방지로 리다이렉트 즉시 반영

### 1. Cache Rules 설정

**Cloudflare 대시보드 → Rules → Cache Rules → Create rule**

#### Rule 1: HTML 캐시 방지
```
Rule name: Bypass HTML Cache

When incoming requests match:
- Content Type equals "text/html"

Then:
- Cache status: Bypass
- TTL: 0 seconds
```

#### Rule 2: 정적 자원 캐시 최적화 (선택사항)
```
Rule name: Static Assets Cache

When incoming requests match:
- File extension is one of: js, css, png, jpg, svg, ico, woff2

Then:
- Cache status: Cache
- TTL: 1 month (2592000 seconds)
```

### 2. Page Rules 대안 (구 인터페이스)

**Rules → Page Rules → Create Page Rule**

```
URL: *.moodtalk.app/*.html
Settings:
- Cache Level: Bypass
```

```
URL: *.moodtalk.app/*
Settings:
- Cache Level: Cache Everything
- Edge Cache TTL: 1 month
```

## 🔄 설정 후 확인 방법

### 브라우저에서 테스트:
```bash
# HTML 응답 헤더 확인
curl -I https://www.moodtalk.app/

# 예상 결과:
# CF-Cache-Status: DYNAMIC (HTML은 캐시 안 됨)
# Cache-Control: no-cache 또는 max-age=0
```

### 정적 자원 확인:
```bash
# CSS/JS 파일 헤더 확인
curl -I https://www.moodtalk.app/assets/index-*.js

# 예상 결과:
# CF-Cache-Status: HIT (정적 자원은 캐시됨)
# Cache-Control: max-age=2592000
```

## ⚡ 효과

1. **HTML 즉시 반영**: 리다이렉트 규칙이 즉시 적용됨
2. **성능 최적화**: 정적 자원은 계속 캐시되어 빠른 로딩
3. **PWA 호환**: 서비스워커와 충돌 없음

## 🚨 중요 주의사항

- **HTML만 캐시 방지**: 정적 자원(JS/CSS/이미지)은 계속 캐시됨
- **SEO 영향 없음**: 검색엔진은 항상 최신 HTML을 받음
- **성능 영향 최소**: HTML은 작고 빠르게 생성됨

## 📋 설정 체크리스트

- [ ] Cache Rules → HTML 캐시 방지 규칙 생성
- [ ] Redirect Rules → /eft-guide 리다이렉트 확인
- [ ] Purge Everything → 기존 캐시 정리
- [ ] 브라우저 테스트 → 리다이렉트 즉시 동작 확인

---

**완료 후 결과**: `/eft-guide` 접근 시 Cloudflare에서 즉시 `/ar-holistic`로 302 리다이렉트