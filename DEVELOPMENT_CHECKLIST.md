# EFT AI 개발 체크리스트

## 🚀 개발 시작 전 확인사항

### 환경 설정
- [ ] Python 3.8+ 설치 확인
- [ ] 프로젝트 루트에서 작업 중 (`C:\Users\lco20\Desktop\EFT-AI-App`)
- [ ] UTF-8 환경변수 설정 (`PYTHONUTF8=1`, `PYTHONIOENCODING=utf-8`)

### 의존성 확인
- [ ] `pip install -r backend/requirements.txt` 완료
- [ ] 주요 패키지 설치 확인: `fastapi`, `uvicorn`, `pydantic`, `openai`

## 🔧 코드 작업 후 확인사항

### 임포트 규칙 준수
- [ ] 모든 임포트는 `backend.*` 절대 경로 사용
- [ ] 레거시 상대 임포트 없음 (`from services.*`, `from models.*` 등)
- [ ] `python check-system.py`로 레거시 임포트 스캔 통과

### 코드 품질
- [ ] `python -m compileall -q backend` 통과 (구문 오류 없음)
- [ ] `backend/__init__.py` 파일 존재
- [ ] Pydantic 모델에서 `json_schema_extra` 사용 (v2 호환)

### 로깅 및 유니코드
- [ ] 한글/이모지 로그 정상 출력 확인
- [ ] 파일 로그 UTF-8 인코딩 적용
- [ ] 콘솔 로그 컬러 정상 작동

## 🧪 테스트 확인사항

### 서버 기동 테스트
- [ ] `uvicorn backend.main:app --reload` 정상 시작
- [ ] 또는 `.\run-dev.ps1` / `run-dev.bat` 스크립트 사용
- [ ] 시작업 로그에 이모지/한글 정상 출력
- [ ] 포트 8000에서 정상 리스닝

### API 엔드포인트 테스트
- [ ] http://127.0.0.1:8000/health → 200 OK
- [ ] http://127.0.0.1:8000/docs → API 문서 정상 표시
- [ ] http://127.0.0.1:8000/openapi.json → OpenAPI 스키마 반환
- [ ] `python smoke-test.py` 모든 테스트 통과

### 기능 테스트
- [ ] SUDS 저장 API 정상 작동
- [ ] vLLM 프록시 연결 준비 완료
- [ ] Engine A/B 시스템 초기화 완료
- [ ] 프롬프트 매니저 정상 로드
- [ ] 감정 분석기 정상 초기화

## 📦 배포 전 최종 확인

### 보안 및 설정
- [ ] `.env` 파일에 민감 정보 없음 (Git 제외)
- [ ] DEBUG 모드 해제 (운영 환경)
- [ ] CORS 설정 운영 도메인으로 변경
- [ ] API 키 인증 시스템 작동 확인

### 성능 및 안정성
- [ ] 메모리 사용량 정상 범위
- [ ] 로그 파일 크기 관리 설정
- [ ] 회로차단기 시스템 작동 확인
- [ ] vLLM 서버 연결 상태 확인

### 문서화
- [ ] API 문서 (/docs) 최신 상태 반영
- [ ] README.md 업데이트
- [ ] CHANGELOG 작성 (주요 변경사항)

## 🛠️ 유용한 명령어들

### 개발 시작
```bash
# 시스템 상태 체크
python check-system.py

# 개발 서버 시작 (UTF-8)
.\run-dev.ps1
# 또는
run-dev.bat
```

### 테스트 실행
```bash
# 스모크 테스트
python smoke-test.py

# 컴파일 체크
python -m compileall -q backend

# 레거시 임포트 스캔 (수동)
grep -REn "^[[:space:]]*(from|import)[[:space:]]+(services|models|routers|clients|config|utils)\b" backend
```

### 서버 관리
```bash
# 표준 실행
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000

# 운영 실행 (리로드 없음)
uvicorn backend.main:app --host 0.0.0.0 --port 8000

# 헬스체크
curl http://127.0.0.1:8000/health
```

## 🚨 트러블슈팅

### 자주 발생하는 문제들

**1. ModuleNotFoundError: No module named 'backend'**
- 해결: 프로젝트 루트에서 실행하는지 확인
- 해결: `backend/__init__.py` 파일 존재 확인

**2. UnicodeEncodeError (cp949)**
- 해결: UTF-8 환경변수 설정 후 재시작
- 해결: `run-dev.ps1` 스크립트 사용

**3. SUDSResponse not defined**
- 해결: `backend/models/suds.py`에 모델 정의 확인
- 해결: `main.py`에서 import 확인

**4. 레거시 임포트 오류**
- 해결: `from services.*` → `from backend.services.*`
- 해결: `python check-system.py`로 일괄 스캔

## 📞 지원

문제가 발생하면:
1. `python check-system.py` 실행하여 시스템 상태 확인
2. `python smoke-test.py` 실행하여 API 상태 확인
3. 로그 파일 `./logs/eft_ai_server.log` 확인
4. 위 체크리스트 항목들 재확인