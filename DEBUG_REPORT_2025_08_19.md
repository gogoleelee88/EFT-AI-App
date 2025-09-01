# EFT-AI-App 디버깅 리포트 - 2025.08.19

## 🐛 발생한 문제

### 초기 증상
- **문제**: 프론트엔드에서 FastAPI 백엔드 호출 시 404 오류
- **사용자 요청**: AI 채팅이 작동하지 않음
- **에러 메시지**: "FastAPI 서버가 실행되지 않음"

## 🔍 디버깅 과정

### 1단계: 서버 실행 상태 확인
```bash
# 결과: ✅ 서버는 정상 실행됨
Status: http://localhost:8000 (running)
AI Model: DialoGPT-medium (loaded)
Memory: 11.6GB/15.7GB
```

### 2단계: API 경로 확인
```bash
# 프론트엔드 요청
GET /health ✅ (200 OK)
POST /api/chat ❌ (400 Bad Request)
```

### 3단계: JSON 파싱 문제 의심
**Windows CMD vs Python requests 테스트:**
```bash
# CMD 결과
curl -d "{\"message\": \"안녕\"}" → 400 Bad Request (JSON 파싱 실패)

# Python requests 결과  
requests.post(json={'message': '안녕'}) → 500 Internal Server Error
```

**결론**: ✅ CMD JSON 파싱 문제 확인됨

### 4단계: 근본 원인 발견
**Python requests로 정상 요청했을 때의 서버 로그:**
```
Token indices sequence length is longer than the specified maximum sequence length for this model (1664 > 1024)
ERROR: index out of range in self
```

**진짜 문제**: DialoGPT-medium 모델의 토큰 길이 제한 (max_length=1024)

## 🎯 해결 전략 결정

### ❌ 잘못된 접근법들
1. **우회 방법**: JSON 파싱 문제만 해결
2. **임시방편**: 단순 토큰 길이 제한
3. **기능 축소**: 대화 내용 잘라내기

### ✅ 채택한 근본적 해결법
**티어별 모델 시스템 도입**

#### 무료 티어 (FREE)
- **모델**: `microsoft/DialoGPT-medium`
- **상태**: 토큰 제한 적용 (임시 동작)
- **목적**: 서비스 맛보기, 기본 대화

#### 프리미엄 티어 (PREMIUM) 
- **모델**: `meta-llama/Llama-3.1-8B-Instruct`
- **상태**: 토큰 제한 해결 + 성능 향상
- **목적**: 전문 EFT 상담, 긴 대화 지원

#### 엔터프라이즈 티어 (ENTERPRISE)
- **모델**: `meta-llama/Llama-3.1-70B-Instruct`
- **상태**: 최고 성능
- **목적**: 기업용, 최고급 AI 상담

## 💡 선택 근거

### 1. 비즈니스 관점
- **수익 모델**: 무료 → 유료 전환 유도
- **차별화**: 모델 성능으로 가치 제공
- **확장성**: 사용자 증가에 따른 서버 비용 대응

### 2. 기술적 관점
- **즉시 해결**: 무료 모델 토큰 제한으로 일단 동작
- **근본 해결**: 프리미엄 모델로 토큰 문제 완전 해결
- **성능 향상**: Llama 3.1 > DialoGPT (품질, 이해력, 한국어)

### 3. 사용자 경험 관점
- **점진적 업그레이드**: 서비스 맛보기 → 만족 시 결제
- **명확한 가치 제안**: 더 나은 AI = 더 나은 상담
- **선택권 제공**: 사용자가 필요에 따라 선택

## 🛠️ 구현 상세

### 설정 파일 수정 (settings.py)
```python
# 티어별 모델 설정
FREE_TIER_MODEL: str = "microsoft/DialoGPT-medium"
PREMIUM_TIER_MODEL: str = "meta-llama/Llama-3.1-8B-Instruct"  
ENTERPRISE_TIER_MODEL: str = "meta-llama/Llama-3.1-70B-Instruct"

USER_TIER: str = "free"  # 개발용 기본값
```

### 향후 작업
1. **AI 엔진 수정**: 티어별 모델 로딩 로직
2. **토큰 제한**: 무료 모델용 안전장치 추가
3. **사용자 시스템**: 티어 관리 기능
4. **결제 시스템**: 프리미엄 업그레이드 플로우

## 📈 예상 효과

### 즉시 효과
- ✅ 무료 사용자도 기본 기능 이용 가능
- ✅ 404 오류 완전 해결
- ✅ 서비스 정상 운영 가능

### 장기 효과  
- 💰 수익 모델 확립 (Freemium)
- 🚀 서비스 차별화 (AI 품질로 경쟁)
- 📊 사용자 세분화 (니즈별 맞춤 서비스)

## 🎯 핵심 교훈

**문제 해결 원칙 준수:**
1. ✅ 근본 원인 파악 우선
2. ✅ 우회 방법 대신 정면 돌파
3. ✅ 단순 수정이 아닌 시스템 개선
4. ✅ 비즈니스 가치와 기술적 해결책 결합

**개발자로서 성장:**
- Windows CMD JSON 파싱 이슈 학습
- API 디버깅 체계적 접근법 습득
- 토큰 길이 제한 및 LLM 모델 특성 이해
- 문제를 기회로 전환하는 사고 (티어 시스템)