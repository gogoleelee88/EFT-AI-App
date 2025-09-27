# EFT AI 서버

EFT(감정자유기법) 전문 심리상담 AI 서버입니다. Llama 3 기반으로 한국어 심리상담에 특화된 AI 모델을 제공합니다.

## 🚀 빠른 시작

### 1. 환경 설정

```bash
# Python 가상환경 생성 (권장)
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 의존성 설치
pip install -r requirements.txt

# 환경 변수 설정
cp .env.example .env
# .env 파일을 편집하여 필요한 설정 입력
```

### 2. 서버 실행

```bash
# 개발 모드 (자동 재로드, 디버그 로그)
python start.py --env dev --reload

# 운영 모드 (성능 최적화)
python start.py --env prod --model-preset llama3-8b-optimal

# 빠른 테스트 (가벼운 모델)
python start.py --model-preset llama2-7b-quick
```

### 3. API 테스트

서버 실행 후 다음 주소에서 테스트 가능:
- API 문서: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- 헬스 체크: http://localhost:8000/health

## 📖 API 사용법

### 기본 채팅 API

```bash
curl -X POST "http://localhost:8000/api/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "오늘 너무 스트레스받아서 힘들어요",
    "max_tokens": 400,
    "temperature": 0.7
  }'
```

### 감정 분석 API

```bash
curl -X POST "http://localhost:8000/api/analyze/emotion" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "회사에서 상사가 계속 야근시켜서 너무 화나요"
  }'
```

### 스트리밍 채팅 (실시간)

```javascript
// JavaScript 예시
const response = await fetch('http://localhost:8000/api/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: "불안한 마음을 달래고 싶어요"
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  console.log('AI 응답 청크:', chunk);
}
```

## 🏗️ 아키텍처

```
backend/
├── main.py              # FastAPI 메인 애플리케이션
├── start.py             # 서버 시작 스크립트
├── requirements.txt     # Python 의존성
├── .env.example         # 환경변수 템플릿
├── config/
│   └── settings.py      # 설정 관리
├── models/
│   └── chat_models.py   # Pydantic 모델들
├── services/
│   ├── ai_engine.py     # Llama 3 AI 엔진
│   ├── prompt_manager.py # EFT 전문 프롬프트 관리
│   └── emotion_analyzer.py # 감정 분석기
└── utils/
    └── logger.py        # 로깅 시스템
```

## ⚙️ 설정 옵션

### 모델 프리셋

- `llama2-7b-quick`: 빠른 테스트용 (6GB VRAM)
- `llama3-8b-optimal`: 권장 운영용 (12GB VRAM)  
- `llama3-70b-premium`: 고성능용 (40GB+ VRAM)

### 주요 환경변수

```env
# AI 모델
MODEL_NAME=meta-llama/Llama-3.1-8B-Instruct
DEVICE=auto              # cuda, cpu, auto
LOAD_IN_4BIT=true        # 메모리 절약
MAX_MEMORY=8GiB          # GPU 메모리 제한

# 서버
HOST=0.0.0.0
PORT=8000
DEBUG=true

# 로그
LOG_LEVEL=INFO
LOG_FILE=./logs/eft_ai_server.log

# 보안
SECRET_KEY=your-secret-key
ALLOWED_ORIGINS=["http://localhost:3000"]
```

## 🔧 개발 가이드

### 로컬 개발

```bash
# 개발 모드로 실행 (자동 재로드)
python start.py --env dev --reload --log-level DEBUG

# 특정 모델로 테스트
python start.py --model-preset llama2-7b-quick --reload
```

### 코드 구조

```python
# 새로운 API 엔드포인트 추가
@app.post("/api/my-feature")
async def my_feature(request: MyRequest):
    # 1. 요청 검증
    # 2. AI 엔진 호출  
    # 3. 응답 후처리
    # 4. 결과 반환
    pass
```

### 로깅

```python
from utils.logger import get_logger

logger = get_logger(__name__)

# 컨텍스트와 함께 로깅
with LogContext(logger, user_id=user_id, session_id=session_id):
    logger.info("사용자 요청 처리 중...")
```

## 🐳 Docker 배포

```dockerfile
# Dockerfile 예시 (추후 추가)
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["python", "start.py", "--env", "prod"]
```

## 📊 모니터링

### 성능 메트릭

- `/api/stats`: 모델 성능 통계
- `/health`: 서버 상태 체크
- Prometheus 메트릭 (선택사항)

### 로그 분석

```bash
# 실시간 로그 모니터링
tail -f logs/eft_ai_server.log

# 구조화된 로그 검색
grep "ERROR" logs/eft_ai_server_structured.jsonl
```

## 🔒 보안 고려사항

1. **API 키 관리**: `.env` 파일에 민감한 정보 저장
2. **CORS 설정**: 허용된 도메인만 접근 가능
3. **입력 검증**: 모든 사용자 입력 검증
4. **로그 마스킹**: 개인정보 로그 기록 방지

## 🚨 문제 해결

### 일반적인 문제들

**Q: 모델 로드 실패**
```bash
# CUDA 메모리 부족
export MAX_MEMORY=4GiB
python start.py --model-preset llama2-7b-quick

# Hugging Face 토큰 필요
export HUGGINGFACE_TOKEN=hf_your_token
```

**Q: 응답 속도 느림**
```bash
# GPU 사용 확인
nvidia-smi

# 4bit 양자화 활성화
export LOAD_IN_4BIT=true
```

**Q: 메모리 부족**
```bash
# CPU 모드로 실행
export DEVICE=cpu
python start.py
```

### 디버깅

```bash
# 디버그 모드로 실행
python start.py --log-level DEBUG --reload

# Python 인터프리터에서 직접 테스트
python -c "
from services.ai_engine import EFTAIEngine
engine = EFTAIEngine()
print('AI 엔진 초기화 성공')
"
```

## 📚 추가 자료

- [FastAPI 문서](https://fastapi.tiangolo.com/)
- [Transformers 문서](https://huggingface.co/docs/transformers)
- [Llama 모델 카드](https://huggingface.co/meta-llama)
- [EFT AR 홀리스틱 가이드](../docs/ar-holistic.md)

## 🤝 기여하기

1. 이슈 생성 또는 기존 이슈 확인
2. 기능 브랜치 생성: `git checkout -b feature/my-feature`
3. 변경사항 커밋: `git commit -m "Add my feature"`
4. 브랜치 푸시: `git push origin feature/my-feature`
5. Pull Request 생성

## 📄 라이선스

이 프로젝트는 MIT 라이선스 하에 제공됩니다. 자세한 내용은 LICENSE 파일을 참조하세요.