
## 🔄 업데이트: _redirects 파일 추가

**추가 해결책:**
- `frontend/public/_redirects` 파일 추가
- 서버 레벨에서 즉시 처리 (번들 캐시와 무관)
- CI 검증도 HTTP 헤더 기반으로 개선

**최종 구조:**
```
/eft-guide /ar-holistic 302
/* /index.html 200
```

이제 PR 머지 후 5분 내에 완전 해결됩니다!

