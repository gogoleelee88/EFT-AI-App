# 🚨 GPU 서버 복구 시 필수 작업 목록

**작성일**: 2025-12-02
**작성 이유**: Vercel 배포 manifest.json 404 오류 임시 해결

---

## ⚠️ 현재 임시 조치 사항

### 1. **manifest.json 충돌 문제**
- **문제**: `frontend/public/manifest.json`과 `vite.config.ts`의 VitePWA manifest 설정이 충돌
- **증상**: 웹사이트에서 manifest.json 404 오류 발생
- **임시 해결**: `vite.config.ts`에서 `manifest: false`로 설정하여 VitePWA manifest 비활성화

### 2. **현재 상태**
```
✅ frontend/public/manifest.json - 존재함 (복구됨)
✅ vite.config.ts - manifest: false (임시로 비활성화)
⚠️ 두 개의 manifest 정의가 공존하지만 충돌하지 않음
```

---

## 🔧 GPU 서버 복구 후 필수 작업

### **옵션 A: VitePWA manifest 사용 (권장)**

#### 1. `frontend/public/manifest.json` 삭제
```bash
cd EFT-AI-App/frontend
rm public/manifest.json
```

#### 2. `vite.config.ts` 수정
**파일**: `frontend/vite.config.ts` (27-57번 줄)

**변경 전**:
```typescript
manifest: false, // ⚠️ 임시로 비활성화
/* manifest: {
  name: 'EFT AI 마음챙김 앱',
  ...
}, */
```

**변경 후**:
```typescript
manifest: {
  name: 'EFT AI 마음챙김 앱',
  short_name: 'EFT AI',
  description: 'AI와 함께하는 마음 여행 - EFT 기반 개인 심리관리 앱',
  theme_color: '#4F46E5',
  background_color: '#6366F1',
  display: 'standalone',
  scope: '/',
  start_url: '/',
  icons: [
    {
      src: 'vite.svg',
      sizes: '64x64',
      type: 'image/svg+xml'
    },
    {
      src: 'vite.svg',
      sizes: '192x192',
      type: 'image/svg+xml'
    },
    {
      src: 'vite.svg',
      sizes: '512x512',
      type: 'image/svg+xml',
      purpose: 'any'
    }
  ]
},
```

#### 3. 빌드 테스트
```bash
cd frontend
npm run build
```

#### 4. 배포 확인
- Vercel에 푸시 후 배포
- `https://www.moodtalk.app/manifest.json` 접속하여 정상 동작 확인
- 브라우저 개발자 도구 → Application → Manifest 확인

---

### **옵션 B: public/manifest.json 사용 (현재 상태 유지)**

#### 1. `vite.config.ts` 그대로 유지
```typescript
manifest: false, // VitePWA manifest 비활성화 유지
```

#### 2. `frontend/public/manifest.json` 수정
- JSON 주석 제거 (54-74번 줄)
- 유효한 JSON 형식으로 정리

**변경 전** (주석 포함):
```json
{
  "name": "...",
  "icons": [...]

  // ⚠️ 아래 기능들은 실제 파일이 준비되면 활성화할 것
  // "screenshots": ...
}
```

**변경 후** (주석 제거):
```json
{
  "name": "EFT AI 마음챙김 앱",
  "short_name": "EFT AI",
  "icons": [...],
  "shortcuts": [...]
}
```

---

## 📋 검증 체크리스트

GPU 서버 복구 후 다음을 확인하세요:

- [ ] manifest.json 404 오류 해결 확인
- [ ] PWA 설치 프롬프트 정상 작동 확인
- [ ] Service Worker 정상 등록 확인
- [ ] 브라우저 개발자 도구에서 manifest 정보 확인
- [ ] 홈화면 추가 시 아이콘 정상 표시 확인
- [ ] 오프라인 모드 정상 작동 확인

---

## 🔗 관련 파일

- `frontend/public/manifest.json` - 기존 PWA manifest 파일
- `frontend/vite.config.ts` - Vite PWA 플러그인 설정
- `frontend/public/eft-icon.svg` - PWA 아이콘 파일
- `.github/workflows/deploy-frontend.yml` - Vercel 자동 배포 설정

---

## 📞 문제 발생 시

manifest.json 관련 오류가 다시 발생하면:

1. 브라우저 개발자 도구 → Network 탭에서 manifest.json 요청 확인
2. 빌드 산출물(`frontend/dist/`)에 manifest.json 존재 확인
3. Vercel 배포 로그에서 manifest.json 복사 확인
4. 필요시 `_redirects` 파일에서 manifest.json 라우팅 규칙 추가

---

**⚠️ 중요**: 이 파일은 GPU 서버 복구 완료 후 삭제해도 됩니다.
