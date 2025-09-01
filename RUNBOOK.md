# EFT AI 상담 서비스 운영 매뉴얼 (RUNBOOK)

## 🚀 **부팅 순서 (필수 준수)**

### **1단계: vLLM 엔진 실행 (WSL2)**
```bash
# WSL2 Ubuntu에서 실행
source ~/vllm-venv/bin/activate

# 터미널 A - Engine A (Llama-3-8B)
python -m vllm.entrypoints.openai.api_server \
  --model meta-llama/Meta-Llama-3-8B-Instruct \
  --dtype auto --max-model-len 4096 --gpu-memory-utilization 0.9 \
  --port 8001

# 터미널 B - Engine B (Qwen2.5-7B)  
python -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen2.5-7B-Instruct \
  --dtype auto --max-model-len 4096 --gpu-memory-utilization 0.9 \
  --port 8002
```

### **2단계: 업스트림 상태 확인**
```bash
curl http://127.0.0.1:8000/health/upstreams
```
**✅ 성공 조건:** 두 엔진 모두 `"status": "healthy"` 반환

### **3단계: 백엔드 서버 실행 (Windows)**
```bash
cd "C:\Users\lco20\Desktop\EFT-AI-App\backend"
set PYTHONUTF8=1 && python main.py
```

### **4단계: API 문서 확인**
- 브라우저: http://127.0.0.1:8000/docs

### **5단계: 프론트엔드 실행**
```bash
cd "C:\Users\lco20\Desktop\EFT-AI-App\frontend"
npm run dev
```
- 브라우저: http://localhost:5173

---

## 🔧 **환경변수 설정표**

### **개발 환경 (.env)**
```bash
# 필수
HUGGINGFACE_TOKEN=hf_YOUR_TOKEN_HERE
DEBUG=true
HOST=0.0.0.0
PORT=8000

# A/B 테스트
AB_TEST_STRATEGY=round_robin
FREE_ENGINES_WEIGHTS=engine_a:1,engine_b:1

# 추가 CORS (운영시)
EXTRA_ALLOWED_ORIGINS=https://your-domain.com,https://app.your-domain.com

# 보안 (운영시)
ADMIN_API_KEY=super-secret-admin-key
USE_REDIS_FOR_STICKY=false
USE_REDIS_FOR_RATE_LIMIT=false
```

### **운영 환경 (추가 설정)**
```bash
DEBUG=false
ADMIN_API_KEY=production-admin-secret-key
REDIS_URL=redis://localhost:6379/0
USE_REDIS_FOR_STICKY=true
USE_REDIS_FOR_RATE_LIMIT=true
```

---

## 🧪 **테스트 커맨드 모음**

### **기본 상담 API**
```bash
curl -X POST http://127.0.0.1:8000/api/chat/completion \
  -H "Content-Type: application/json" \
  -H "x-user-tier: free" \
  -d '{"message":"요즘 불안해서 상담이 필요해요"}'
```

### **엔진 강제 선택**
```bash
# Engine A 강제
curl -X POST http://127.0.0.1:8000/api/chat/completion \
  -H "Content-Type: application/json" \
  -H "x-user-tier: free" \
  -H "x-free-engine: engine_a" \
  -d '{"message":"Llama-3 엔진으로 테스트"}'

# Engine B 강제
curl -X POST http://127.0.0.1:8000/api/chat/completion \
  -H "Content-Type: application/json" \
  -H "x-user-tier: free" \
  -H "x-free-engine: engine_b" \
  -d '{"message":"Qwen2.5 엔진으로 테스트"}'
```

### **Sticky 세션 테스트**
```bash
# 사용자 123 - 첫 번째 호출
curl -X POST http://127.0.0.1:8000/api/chat/completion \
  -H "Content-Type: application/json" \
  -H "x-user-tier: free" \
  -H "x-user-id: user123" \
  -d '{"message":"Sticky 테스트 1회차"}'

# 사용자 123 - 두 번째 호출 (같은 엔진이어야 정상)
curl -X POST http://127.0.0.1:8000/api/chat/completion \
  -H "Content-Type: application/json" \
  -H "x-user-tier: free" \
  -H "x-user-id: user123" \
  -d '{"message":"Sticky 테스트 2회차"}'
```

### **헬스체크 모음**
```bash
# 기본 서버 상태
curl http://127.0.0.1:8000/health

# vLLM 업스트림 상태 (개발환경)
curl http://127.0.0.1:8000/health/upstreams

# vLLM 업스트림 상태 (운영환경)
curl -H "x-admin-token: your-admin-key" \
     http://127.0.0.1:8000/health/upstreams
```

---

## 🚨 **문제해결 가이드**

### **vLLM 엔진 연결 실패**
```bash
# 포트 사용 확인
netstat -ano | findstr "8001\|8002"

# WSL2에서 vLLM 재시작
pkill -f vllm
# 위의 엔진 실행 명령어 재실행
```

### **백엔드 서버 오류**
```bash
# 로그 확인
tail -f C:\Users\lco20\Desktop\EFT-AI-App\backend\logs\eft_ai_server.log

# 포트 8000 사용 확인
netstat -ano | findstr :8000
```

### **CORS 오류 (프론트엔드)**
- `EXTRA_ALLOWED_ORIGINS` 환경변수에 프론트엔드 도메인 추가
- 개발: `http://localhost:5173,http://127.0.0.1:5173`

---

## ⚡ **성능 튜닝**

### **vLLM 최적화**
```bash
# GPU 메모리 사용률 조정
--gpu-memory-utilization 0.8  # 메모리 부족시 낮추기

# 모델 길이 조정  
--max-model-len 2048  # 메모리 절약시 낮추기

# 배치 크기 조정
--max-num-batched-tokens 4096
```

### **백엔드 최적화**
```bash
# 멀티워커 실행 (운영환경)
uvicorn main:app --workers 4 --host 0.0.0.0 --port 8000

# 프로세스별 리소스 제한
--limit-memory 2GB --limit-cpu 2
```

---

## 🔒 **보안 체크리스트**

- [ ] `ADMIN_API_KEY` 설정 (운영환경)
- [ ] `DEBUG=false` 설정 (운영환경)  
- [ ] HTTPS 인증서 설정
- [ ] 방화벽 규칙: 8001/8002 포트는 내부망만
- [ ] 로그 파일 권한 600 설정
- [ ] `.env` 파일 `.gitignore` 확인

---

## 📊 **모니터링 지표**

### **핵심 메트릭**
- 응답 시간: `processing_time` < 3초
- 에러율: < 1%
- 가용성: > 99.9%
- vLLM 메모리 사용률: < 90%

### **알림 조건**
- 업스트림 `status != "healthy"`
- 연속 5회 API 실패
- 응답 시간 > 10초
- 메모리 사용률 > 95%

---

**✅ AC: 신규 기기도 이 문서만 보고 1회에 기동 성공**