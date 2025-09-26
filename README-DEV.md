# EFT AI 백엔드 개발 가이드

## 🚀 빠른 시작

### 1. 시스템 상태 확인
```bash
python check-system-simple.py
```

### 2. 개발 서버 시작
```bash
# PowerShell
.\run-dev.ps1

# Command Prompt
run-dev.bat

# 수동 실행
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

### 3. 기본 테스트
```bash
python smoke-test.py
```

## 📍 주요 엔드포인트

- **서버**: http://127.0.0.1:8000
- **API 문서**: http://127.0.0.1:8000/docs
- **헬스체크**: http://127.0.0.1:8000/health
- **OpenAPI 스키마**: http://127.0.0.1:8000/openapi.json

## 🛠️ 개발 도구들

### 실행 스크립트
- `run-dev.ps1` - PowerShell 개발 서버 시작
- `run-dev.bat` - CMD 개발 서버 시작

### 체크 도구
- `check-system-simple.py` - 시스템 상태 간단 체크
- `smoke-test.py` - API 엔드포인트 기본 테스트

### 문서
- `DEVELOPMENT_CHECKLIST.md` - 개발 체크리스트
- `README-DEV.md` - 이 파일

## ✅ 주요 해결된 문제들

1. **✅ backend.* 절대 임포트 통일**
2. **✅ UTF-8 유니코드 로깅 완전 해결**
3. **✅ Pydantic v2 호환성 수정**
4. **✅ SUDSRequest/SUDSResponse 모델 정의**
5. **✅ FastAPI 서버 완전 안정화**

## 🔧 트러블슈팅

### 자주 발생하는 문제

**1. ModuleNotFoundError: No module named 'backend'**
```bash
# 해결: 프로젝트 루트에서 실행
cd C:\Users\lco20\Desktop\EFT-AI-App
uvicorn backend.main:app --reload
```

**2. UnicodeEncodeError (cp949)**
```bash
# 해결: UTF-8 환경변수 설정
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
# 또는 run-dev.ps1 / run-dev.bat 사용
```

**3. 서버 시작 실패**
```bash
# 1. 시스템 상태 체크
python check-system-simple.py

# 2. 포트 충돌 확인
netstat -an | findstr :8000

# 3. 의존성 재설치
pip install -r backend/requirements.txt
```

## 🏗️ 아키텍처 개요

### 디렉토리 구조
```
backend/
├── main.py              # FastAPI 메인 애플리케이션
├── config/
│   └── settings.py      # 애플리케이션 설정
├── services/
│   ├── vllm_client.py   # vLLM 클라이언트
│   ├── vllm_proxy.py    # vLLM 프록시
│   ├── prompt_manager.py # 프롬프트 관리
│   └── emotion_analyzer.py # 감정 분석
├── models/
│   ├── chat_models.py   # 채팅 모델
│   ├── suds.py         # SUDS 모델
│   └── action_tokens.py # 액션 토큰 모델
├── utils/
│   └── logger.py        # UTF-8 로깅 시스템
└── routers/
    └── premium.py       # 프리미엄 라우터
```

### 주요 기능
- **Engine A/B 시스템**: 무료 사용자를 위한 병렬 AI 비교
- **프리미엄 티어**: Qwen-2.5-7B 전용 고품질 AI
- **SUDS 시스템**: 감정 상태 저장 및 추적
- **UTF-8 로깅**: 한글/이모지 완벽 지원
- **프롬프트 관리**: EFT 전문 프롬프트 시스템

## 📊 개발 상태

### ✅ 완료된 기능
- [x] FastAPI 서버 구조
- [x] vLLM 클라이언트/프록시
- [x] UTF-8 유니코드 로깅
- [x] SUDS 모델 및 API
- [x] 프롬프트 관리 시스템
- [x] 감정 분석 시스템
- [x] Engine A/B 병렬 시스템
- [x] 개발 편의 스크립트들

### 🔄 진행 중
- [ ] vLLM 서버 연동 테스트
- [ ] 프론트엔드 연결
- [ ] 운영 환경 설정

### 📋 향후 계획
- [ ] 모니터링 시스템
- [ ] 성능 최적화
- [ ] 보안 강화
- [ ] 테스트 자동화

## 🤝 기여 가이드

1. **개발 전**: `DEVELOPMENT_CHECKLIST.md` 확인
2. **코드 작성**: backend.* 절대 임포트 사용
3. **테스트**: `python smoke-test.py` 실행
4. **커밋 전**: 모든 체크리스트 항목 확인

---

💡 **팁**: 개발 시작할 때마다 `python check-system-simple.py`를 실행하여 환경을 확인하세요!