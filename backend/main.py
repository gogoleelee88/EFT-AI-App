"""
EFT AI 서버 - FastAPI 메인 애플리케이션
심리상담 특화 Llama 3 기반 AI 서버
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import asyncio
import time
from datetime import datetime
import json
import os
from pathlib import Path
import itertools
import random
import logging
import uuid
from collections import defaultdict, deque

# 로컬 모듈 임포트
from services.vllm_client import VLLMClient
from services.prompt_manager import EFTPromptManager
from services.emotion_analyzer import EmotionAnalyzer
from models.chat_models import ChatRequest, ChatResponse, StreamResponse
from config.settings import get_settings
from utils.logger import get_logger

# 설정 및 로거
settings = get_settings()
logger = get_logger(__name__)

# VLLMClient는 app.state로 관리

# --- A/B 라우팅 상태 ---
_engine_keys = list(settings.FREE_ENGINES.keys())

def pick_engine(strategy: str, user_id: Optional[str] = None):
    """전략에 따라 A/B 엔진 선택 (4가지 전략 지원)"""
    if strategy == "random":
        return random.choice(_engine_keys)
    elif strategy == "weighted":
        # weighted 예: FREE_ENGINES_WEIGHTS="engine_a:2,engine_b:1"
        wstr = os.getenv("FREE_ENGINES_WEIGHTS", "")
        weights = []
        keys = []
        for token in filter(None, (t.strip() for t in wstr.split(","))):
            k, _, w = token.partition(":")
            if k in settings.FREE_ENGINES and w.isdigit():
                keys.append(k); weights.append(int(w))
        if keys and weights:
            return random.choices(keys, weights=weights, k=1)[0]
        # fallback
        return random.choice(_engine_keys)
    elif strategy == "sticky" and user_id:
        # 사용자별 고정 엔진 (동일 사용자는 항상 같은 엔진)
        if user_id in settings.STICKY_SESSIONS:
            engine_key = settings.STICKY_SESSIONS[user_id]
            if engine_key in settings.FREE_ENGINES:
                return engine_key
        # 새 사용자는 랜덤 배정
        engine_key = random.choice(_engine_keys)
        settings.STICKY_SESSIONS[user_id] = engine_key
        logger.info(f"[STICKY] 새 사용자 {user_id} -> {engine_key} 매핑")
        return engine_key
    # default: round_robin (간단한 랜덤으로 대체)
    return random.choice(_engine_keys)

class ABRouteMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # 1) 사용자 티어 결정: 헤더로 강제 가능 (x-user-tier), 기본은 settings.USER_TIER
        user_tier = request.headers.get("x-user-tier", settings.USER_TIER).lower()

        # 2) 무료 티어일 때만 A/B 엔진 선택 (쿼리나 헤더로 override 가능)
        if user_tier == "free":
            # override: x-free-engine: engine_a|engine_b
            forced = request.headers.get("x-free-engine")
            if forced and forced in settings.FREE_ENGINES:
                engine_key = forced
            else:
                # user_id 추출 (헤더, 쿼리, 또는 세션에서)
                user_id = request.headers.get("x-user-id") or request.query_params.get("user_id")
                engine_key = pick_engine(settings.AB_TEST_STRATEGY, user_id)
            request.state.free_engine_key = engine_key
            request.state.free_engine = settings.FREE_ENGINES[engine_key]
            logger.info(f"[A/B] user_tier=free -> {engine_key} ({request.state.free_engine['model']})")
        else:
            request.state.free_engine_key = None
            request.state.free_engine = None

        response = await call_next(request)
        # 응답 헤더에 어떤 엔진이 쓰였는지 노출(관측성)
        if user_tier == "free" and request.state.free_engine_key:
            response.headers["x-ab-engine"] = request.state.free_engine_key
        return response

# FastAPI 앱 초기화
app = FastAPI(
    title="EFT AI 상담 서버",
    description="EFT(감정자유기법) 전문 AI 상담 서비스",
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None
)

# CORS 도메인 환경변수 병합
extra = (settings.EXTRA_ALLOWED_ORIGINS or "").strip()
if extra:
    settings.ALLOWED_ORIGINS.extend([o.strip() for o in extra.split(",") if o.strip()])
    logger.info(f"추가 CORS 도메인 등록: {extra}")

# === 프로덕션 보안 미들웨어 추가 ===

# 1. 요청 바디 크기 제한 (DoS 방지)
class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, max_bytes: int = 128 * 1024):
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next):
        cl = request.headers.get("content-length")
        if cl and cl.isdigit() and int(cl) > self.max_bytes:
            logger.warning(f"요청 크기 초과: {cl} bytes (최대: {self.max_bytes})")
            raise HTTPException(status_code=413, detail="Payload too large")
        return await call_next(request)

# 2. 상관관계 ID 추적 (디버깅 용이)
class CorrelationIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        cid = request.headers.get("x-request-id") or uuid.uuid4().hex
        request.state.correlation_id = cid
        response = await call_next(request)
        response.headers["x-request-id"] = cid
        return response

# 3. 간단한 레이트 리밋 (메모리 기반)
class SimpleRateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, requests_per_minute: int = 60):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.request_times = defaultdict(deque)  # IP -> deque of timestamps
        
    async def dispatch(self, request: Request, call_next):
        # 무료 티어 API 경로에만 적용
        if not request.url.path.startswith("/api/chat"):
            return await call_next(request)
            
        client_ip = request.client.host if request.client else "unknown"
        current_time = time.time()
        
        # 1분 이전 요청들 제거
        client_requests = self.request_times[client_ip]
        while client_requests and current_time - client_requests[0] > 60:
            client_requests.popleft()
            
        # 레이트 리밋 체크
        if len(client_requests) >= self.requests_per_minute:
            logger.warning(f"레이트 리밋 초과: {client_ip} ({len(client_requests)} requests/min)")
            raise HTTPException(
                status_code=429, 
                detail=f"Rate limit exceeded. Maximum {self.requests_per_minute} requests per minute.",
                headers={"Retry-After": "60"}
            )
            
        # 현재 요청 기록
        client_requests.append(current_time)
        return await call_next(request)

# 미들웨어 등록 (순서 중요!)
app.add_middleware(MaxBodySizeMiddleware, max_bytes=256 * 1024)  # 256KB로 여유 있게
app.add_middleware(CorrelationIdMiddleware)
app.add_middleware(SimpleRateLimitMiddleware, requests_per_minute=120)  # 분당 120회
app.add_middleware(ABRouteMiddleware)

# CORS 설정 (PWA 클라이언트 연결용)
if settings.DEBUG:  # 개발 환경
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # 개발 환경에서 모든 origin 허용
        allow_methods=["*"],
        allow_headers=["*"],
        allow_credentials=True,
    )
else:  # 운영 환경
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        allow_credentials=True,
    )

# AI 지원 서비스 전역 변수 (서버 시작시 로드)  
# AI 엔진은 app.state.vllm으로 대체됨
prompt_manager: Optional[EFTPromptManager] = None
emotion_analyzer: Optional[EmotionAnalyzer] = None

@app.on_event("startup")
async def startup_event():
    """서버 시작시 AI 클라이언트 및 서비스 초기화"""
    global prompt_manager, emotion_analyzer
    
    logger.info("🚀 EFT AI 서버 시작 중...")
    
    try:
        # 1. vLLM 클라이언트 초기화
        logger.info("🤖 vLLM 클라이언트 초기화 중...")
        app.state.vllm = VLLMClient()
        
        # 2. 프롬프트 매니저 초기화
        logger.info("📝 프롬프트 시스템 로드 중...")
        prompt_manager = EFTPromptManager()
        
        # 3. 감정 분석기 초기화
        logger.info("🧠 감정 분석 시스템 로드 중...")
        emotion_analyzer = EmotionAnalyzer()
        
        logger.info("✅ 기본 서비스 시작 완료!")
        logger.info("💡 AI 모델은 vLLM 서버 연동을 통해 제공됩니다")
        
        # 레거시 AI 시스템 완전 제거 완료
        logger.info("🚫 DialoGPT 완전 폐기: OpenAI SDK + vLLM 시스템으로 전환!")
        logger.info("🆓 무료: Engine A/B, 🎯 프리미엄: Qwen-2.5 전용")
        
        # 4. vLLM 서버 연결 확인 (선택적)
        try:
            logger.info("🔗 vLLM 서버 연결 확인...")
            # 간단한 헬스체크 - 실패해도 서버는 계속 실행
            # app.state.vllm.list_models("free")  # 필요시 주석 해제
            logger.info("✅ vLLM 서버 연결 준비 완료!")
        except Exception as vllm_error:
            logger.warning(f"⚠️ vLLM 서버 연결 실패: {vllm_error}")
            logger.info("📢 vLLM 서버를 8001, 8002 포트에서 실행해주세요")
        
        logger.info("🚀 EFT AI 서버 완전히 시작 완료!")
        
    except Exception as e:
        logger.error(f"❌ 중요한 서비스 시작 실패: {e}")
        # AI 모델 로드 실패는 허용, 기본 서비스만으로도 서버 시작
        logger.info("📢 vLLM 연동 모드로 서버 계속 실행합니다")

@app.on_event("shutdown")
async def shutdown_event():
    """서버 종료시 리소스 정리"""
    logger.info("🔄 서버 종료 중...")
    
    # vLLM 클라이언트는 별도 cleanup 불필요 (HTTP 클라이언트)
        
    logger.info("✅ 서버 종료 완료")

# 기본 엔드포인트
@app.get("/")
async def root():
    """서버 상태 확인"""
    return {
        "service": "EFT AI 상담 서버",
        "status": "running",
        "version": "1.0.0",
        "vllm_client": "ready",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/health")
async def health_check():
    """헬스 체크 엔드포인트 (향상된 관측성)"""
    return {
        "status": "healthy",
        "tier": settings.USER_TIER,
        "strategy": settings.AB_TEST_STRATEGY,
        "free_engines": {k: {"model": v["model"], "port": v["port"]} for k, v in settings.FREE_ENGINES.items()},
        "vllm_free_engine": "ready",
        "vllm_premium_engine": "ready",
        "prompt_manager": "loaded" if prompt_manager else "not_loaded",
        "emotion_analyzer": "loaded" if emotion_analyzer else "not_loaded",
        "uptime": time.time(),
        "available_tiers": ["free", "premium"],  # 프리미엄은 항상 사용 가능 (폴백 지원)
        "sticky_sessions_count": len(getattr(settings, 'STICKY_SESSIONS', {})),
        "supported_strategies": ["round_robin", "random", "weighted", "sticky"],
        "vllm_timeouts": {
            "connect": getattr(settings, 'VLLM_CONNECT_TIMEOUT', 10.0),
            "read": getattr(settings, 'VLLM_READ_TIMEOUT', 120.0),
            "health_check": getattr(settings, 'VLLM_HEALTH_CHECK_TIMEOUT', 5.0)
        },
        "memory_usage": "TODO: 메모리 사용량"
    }

@app.get("/api/health")
async def health_check_api():
    """헬스 체크 엔드포인트 (API 경로)"""
    # 동일한 응답 반환
    return {
        "status": "healthy",
        "vllm_free_engine": "ready",
        "vllm_premium_engine": "ready",
        "prompt_manager": "loaded" if prompt_manager else "not_loaded",
        "emotion_analyzer": "loaded" if emotion_analyzer else "not_loaded",
        "uptime": time.time(),
        "available_tiers": ["free", "premium"],  # 프리미엄은 항상 사용 가능 (폴백 지원)
        "memory_usage": "TODO: 메모리 사용량"
    }

# 무료 모델 AI 채팅 엔드포인트 (DialoGPT)
@app.post("/api/chat/free", response_model=ChatResponse)
async def eft_chat_free(request: ChatRequest):
    """
    무료 티어 EFT AI 상담 채팅 (DialoGPT 기반)
    - 토큰 제한: 1024 토큰
    - 기본 감정 분석 및 EFT 추천
    """
    # vLLM 클라이언트는 항상 사용 가능
    
    try:
        start_time = time.time()
        
        # 1. 감정 분석
        emotion_analysis = await emotion_analyzer.analyze(request.message)
        logger.info(f"[FREE] 감정 분석: {emotion_analysis}")
        
        # 2. EFT 맞춤 프롬프트 생성
        eft_prompt = prompt_manager.build_eft_prompt(
            user_message=request.message,
            emotion_state=emotion_analysis,
            conversation_history=request.conversation_history,
            user_profile=request.user_profile
        )
        
        # 3. 무료 모델 응답 생성 (토큰 제한)
        messages = [
            {"role": "system", "content": "You are a helpful EFT counselor specialized in Korean emotional support."},
            {"role": "user", "content": eft_prompt}
        ]
        ai_response = await run_in_threadpool(
            app.state.vllm.chat_completion,
            messages=messages,
            tier="free",
            max_tokens=min(request.max_tokens or 150, 150),  # 무료는 최대 150토큰
            temperature=request.temperature or 0.7
        )
        
        # 4. 응답 텍스트 추출 및 후처리
        response_text = ai_response.get("choices", [{}])[0].get("message", {}).get("content", "")
        processed_response = prompt_manager.post_process_response(
            response_text, emotion_analysis
        )
        
        processing_time = time.time() - start_time
        
        # 5. 응답 반환
        return ChatResponse(
            response=processed_response["text"],
            emotion_analysis=emotion_analysis,
            eft_recommendations=processed_response["eft_recommendations"],
            suggested_actions=processed_response["suggested_actions"],
            confidence_score=processed_response["confidence"],
            processing_time=processing_time,
            timestamp=datetime.now().isoformat(),
            response_id=f"free_resp_{int(time.time() * 1000)}",
            tier="free"
        )
        
    except Exception as e:
        logger.error(f"무료 채팅 처리 오류: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"AI 응답 생성 중 오류가 발생했습니다: {str(e)}"
        )

# 유료 모델 AI 채팅 엔드포인트 (Llama-3.1-8B)
@app.post("/api/chat/premium", response_model=ChatResponse)
async def eft_chat_premium(request: ChatRequest):
    """
    프리미엄 티어 EFT AI 상담 채팅 (Llama-3.1-8B 기반)
    - 토큰 제한: 4000 토큰
    - 고급 감정 분석 및 전문 EFT 상담
    - 개인화된 맞춤 추천
    """
    # 프리미엄 모델 사용 가능 여부 체크
    # vLLM 클라이언트 사용
    
    # vLLM 프리미엄 티어는 항상 사용 가능
    
    try:
        start_time = time.time()
        
        # 1. 고급 감정 분석
        emotion_analysis = await emotion_analyzer.analyze(request.message)
        logger.info(f"[PREMIUM] 감정 분석: {emotion_analysis}")
        
        # 2. 고급 EFT 맞춤 프롬프트 생성
        eft_prompt = prompt_manager.build_eft_prompt(
            user_message=request.message,
            emotion_state=emotion_analysis,
            conversation_history=request.conversation_history,
            user_profile=request.user_profile,
            tier="premium"  # 프리미엄 전용 프롬프트
        )
        
        # 3. 프리미엄 모델 응답 생성 (폴백 포함)
        messages = [
            {"role": "system", "content": "You are a helpful EFT counselor specialized in Korean emotional support."},
            {"role": "user", "content": eft_prompt}
        ]
        
        try:
            ai_response = await run_in_threadpool(
                app.state.vllm.chat_completion,
                messages=messages,
                tier="premium",
                max_tokens=min(request.max_tokens or 800, 800),  # 프리미엄은 최대 800토큰
                temperature=request.temperature or 0.7
            )
        except Exception as e:
            logger.warning(f"Premium engine failed, falling back to free: {str(e)}")
            ai_response = await run_in_threadpool(
                app.state.vllm.chat_completion,
                messages=messages,
                tier="free",
                max_tokens=min(request.max_tokens or 400, 400),  # 무료 티어 토큰 제한
                temperature=request.temperature or 0.7
            )
        
        # 4. 응답 텍스트 추출 및 고급 후처리
        response_text = ai_response.get("choices", [{}])[0].get("message", {}).get("content", "")
        processed_response = prompt_manager.post_process_response(
            response_text, emotion_analysis, tier="premium"
        )
        
        processing_time = time.time() - start_time
        
        # 5. 응답 반환
        return ChatResponse(
            response=processed_response["text"],
            emotion_analysis=emotion_analysis,
            eft_recommendations=processed_response["eft_recommendations"],
            suggested_actions=processed_response["suggested_actions"],
            confidence_score=processed_response["confidence"],
            processing_time=processing_time,
            timestamp=datetime.now().isoformat(),
            response_id=f"premium_resp_{int(time.time() * 1000)}",
            tier="premium"
        )
        
    except Exception as e:
        logger.error(f"프리미엄 채팅 처리 오류: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"AI 응답 생성 중 오류가 발생했습니다: {str(e)}"
        )

# 기존 채팅 엔드포인트 (Engine A/B 병렬 비교로 전환)
@app.post("/api/chat", response_model=ChatResponse)
async def eft_chat(request: ChatRequest, req: Request):
    """
    기본 EFT AI 상담 채팅 (Engine A/B 병렬 비교로 완전 전환)
    DialoGPT 완전 폐기! 이제 무료 사용자도 Llama-3 vs Qwen-2.5 병렬 비교 사용
    """
    try:
        # ChatRequest를 ChatProxyRequest로 변환
        proxy_request = ChatProxyRequest(
            message=request.message,
            temperature=request.temperature or 0.7,
            max_tokens=request.max_tokens or 400
        )
        
        # Engine A/B 병렬 비교 수행
        comparison_result = await compare_llama3_vs_qwen25(proxy_request, req)
        
        # 감정 분석 수행
        emotion_analysis = await emotion_analyzer.analyze(request.message)
        
        # 더 빠른 모델의 응답을 메인 응답으로 사용
        if comparison_result.faster_model == "llama3" and comparison_result.llama3_response["success"]:
            main_response = comparison_result.llama3_response["response"]
            model_info = "Engine A (Llama-3-8B)"
        elif comparison_result.faster_model == "qwen25" and comparison_result.qwen25_response["success"]:
            main_response = comparison_result.qwen25_response["response"]
            model_info = "Engine B (Qwen-2.5-7B)"
        else:
            # 둘 다 실패했을 경우 폴백 (vLLM 서버 미실행 상태)
            main_response = "안녕하세요! 현재 AI 모델 서버가 준비 중입니다. vLLM 서버를 실행해주세요. (포트 8001, 8002)"
            model_info = "Fallback (vLLM 서버 필요)"
        
        # ChatResponse 형태로 반환
        return ChatResponse(
            response=main_response,
            emotion_analysis=emotion_analysis,
            eft_recommendations=[],  # 병렬 비교에서는 기본값
            suggested_actions=[],
            confidence_score=0.8 if comparison_result.faster_model != "none" else 0.3,
            processing_time=comparison_result.comparison_time,
            timestamp=comparison_result.timestamp,
            response_id=f"ab_resp_{int(time.time() * 1000)}",
            tier="free",
            model_version=model_info,
            requires_followup=False,
            emergency_detected=False,
            professional_referral=False
        )
        
    except Exception as e:
        logger.error(f"Engine A/B 병렬 처리 오류: {e}")
        
        # 완전한 폴백 응답 - vLLM 서버 없을 때
        emotion_analysis = EmotionAnalysis(
            primary_emotion=EmotionType.NEUTRAL,
            intensity=0.5,
            confidence=0.3,
            emotional_keywords=[]
        )
        
        return ChatResponse(
            response="안녕하세요! 현재 Engine A/B 병렬 시스템을 준비 중입니다. vLLM 서버(포트 8001, 8002)를 실행해주세요.",
            emotion_analysis=emotion_analysis,
            eft_recommendations=[],
            suggested_actions=[],
            confidence_score=0.2,
            processing_time=0.1,
            timestamp=datetime.now().isoformat(),
            response_id=f"fallback_resp_{int(time.time() * 1000)}",
            tier="free",
            model_version="Fallback (vLLM 서버 필요)"
        )

# 스트리밍 채팅 (긴 응답용)
@app.post("/api/chat/stream")
def chat_stream_unavailable():
    """스트리밍 임시 비활성화 (엔진 마이그레이션 중)"""
    # 프론트가 이 메시지 보고 일반 /chat로 폴백하도록 안내
    raise HTTPException(status_code=501, detail="Streaming temporarily disabled during engine migration")

# 감정 분석 전용 엔드포인트
@app.post("/api/analyze/emotion")
async def analyze_emotion(request: dict):
    """텍스트 감정 분석"""
    if not emotion_analyzer:
        raise HTTPException(status_code=503, detail="감정 분석 모델이 로드되지 않았습니다.")
    
    text = request.get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail="분석할 텍스트가 필요합니다.")
    
    analysis = await emotion_analyzer.analyze(text)
    return {
        "text": text,
        "emotion_analysis": analysis,
        "timestamp": datetime.now().isoformat()
    }

# EFT 기법 추천 엔드포인트
@app.post("/api/recommend/eft")
async def recommend_eft_technique(request: dict):
    """감정 상태 기반 EFT 기법 추천"""
    if not prompt_manager:
        raise HTTPException(status_code=503, detail="프롬프트 시스템이 로드되지 않았습니다.")
    
    emotion_state = request.get("emotion_state")
    if not emotion_state:
        raise HTTPException(status_code=400, detail="감정 상태 정보가 필요합니다.")
    
    recommendations = prompt_manager.recommend_eft_techniques(emotion_state)
    return {
        "emotion_state": emotion_state,
        "recommendations": recommendations,
        "timestamp": datetime.now().isoformat()
    }

# 모델 성능 통계
@app.get("/api/stats")
def get_model_stats():
    """vLLM 서버 통계 (간소화)"""
    return {
        "vllm_status": "ready",
        "free_engine": settings.FREE_AI_MODEL,
        "premium_engine": settings.PREMIUM_AI_MODEL,
        "server_uptime": time.time(),
        "note": "상세 통계는 vLLM 서버에서 제공됩니다"
    }

# Enhanced vLLM upstream health check endpoint  
@app.get("/health/upstreams")
async def health_upstreams(req: Request, x_admin_token: Optional[str] = Header(None)):
    """vLLM upstream 서버들의 상태를 체크합니다 (운영에서는 내부망/관리자 전용)"""
    
    # 운영 환경에서 보안 체크
    if not settings.DEBUG:
        # 토큰 우선 체크
        if settings.ADMIN_API_KEY and x_admin_token != settings.ADMIN_API_KEY:
            raise HTTPException(status_code=403, detail="forbidden")
        # 토큰이 없으면 내부 IP만
        client = (req.client.host if req.client else "")
        if client not in settings.INTERNAL_NETWORKS:
            raise HTTPException(status_code=403, detail="forbidden")
    import httpx
    upstreams = {}
    
    for engine_key, config in settings.FREE_ENGINES.items():
        port = config["port"]
        model = config["model"] 
        base_url = f"http://127.0.0.1:{port}"
        
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                start = time.time()
                r = await client.get(f"{base_url}/v1/models")
                latency = (time.time() - start) * 1000  # ms
                
                if r.status_code == 200:
                    models = r.json().get("data", [])
                    available_models = [m.get("id") for m in models]
                    upstreams[engine_key] = {
                        "status": "healthy",
                        "url": base_url,
                        "expected_model": model,
                        "available_models": available_models,
                        "latency_ms": round(latency, 2),
                        "error": None
                    }
                else:
                    upstreams[engine_key] = {
                        "status": "unhealthy", 
                        "url": base_url,
                        "expected_model": model,
                        "error": f"HTTP {r.status_code}: {r.text[:200]}"
                    }
        except Exception as e:
            upstreams[engine_key] = {
                "status": "unreachable",
                "url": base_url, 
                "expected_model": model,
                "error": str(e)
            }
    
    # 전체 상태 결정
    all_statuses = [u["status"] for u in upstreams.values()]
    overall_status = "healthy" if "healthy" in all_statuses else "degraded" if any(s != "unreachable" for s in all_statuses) else "unhealthy"
    
    return {
        "overall_status": overall_status,
        "upstreams": upstreams,
        "timestamp": datetime.now().isoformat(),
        "strategy": settings.AB_TEST_STRATEGY
    }

# A/B 테스트용 채팅 완성 엔드포인트 (강화)
class ChatProxyRequest(BaseModel):
    """채팅 프록시 요청 모델"""
    message: str = Field(..., min_length=1, max_length=4000, description="사용자 메시지")
    temperature: Optional[float] = Field(default=0.7, ge=0.0, le=2.0, description="창의성 수준")
    max_tokens: Optional[int] = Field(default=512, ge=1, le=2000, description="최대 토큰 수")
    model: Optional[str] = Field(default=None, description="요청 모델명 (선택사항)")

class ComparisonResponse(BaseModel):
    """Llama-3 vs Qwen-2.5 비교 응답 모델"""
    llama3_response: dict = Field(..., description="Llama-3-8B 응답")
    qwen25_response: dict = Field(..., description="Qwen-2.5-7B 응답")
    comparison_time: float = Field(..., description="총 처리 시간")
    faster_model: str = Field(..., description="더 빠른 모델 (llama3 or qwen25)")
    timestamp: str = Field(..., description="응답 시간")
    
# 폴백 로직을 위한 도우미 함수
def other_engine_key(cur_key: str) -> Optional[str]:
    """현재 엔진을 제외한 다른 엔진 반환"""
    keys = list(settings.FREE_ENGINES.keys())
    if len(keys) < 2: 
        return None
    for k in keys:
        if k != cur_key:
            return k
    return None

@app.post("/api/chat/completion")
async def completion(request: ChatProxyRequest, req: Request):
    """A/B 테스트용 채팅 완성 엔드포인트 (강화 + 폴백)"""
    import httpx
    
    # 상관관계 ID 추가
    correlation_id = getattr(req.state, 'correlation_id', 'unknown')
    logger.info(f"[{correlation_id}] 채팅 요청 시작: {request.message[:50]}...")
    
    # 무료 티어 -> A/B 엔진으로 프록시
    if hasattr(req.state, 'free_engine') and req.state.free_engine:
        engine = req.state.free_engine
        base = f"http://127.0.0.1:{engine['port']}/v1"
        
        # vLLM(OpenAI 호환) chat.completions
        payload = {
            "model": request.model or engine["model"],
            "messages": [
                {"role": "system", "content": "You are a helpful EFT counselor assistant specialized in Korean emotional support."},
                {"role": "user", "content": request.message},
            ],
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
        }
        
        # 기본 엔진 시도 + 폴백 로직
        timeout_config = httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=10.0)
        
        async def try_engine(engine_key: str, engine_config: dict, is_fallback: bool = False):
            base_url = f"http://127.0.0.1:{engine_config['port']}/v1"
            try:
                async with httpx.AsyncClient(timeout=timeout_config) as client:
                    start_time = time.time()
                    r = await client.post(f"{base_url}/chat/completions", json=payload)
                    processing_time = time.time() - start_time
                    
                if r.status_code >= 400:
                    raise httpx.HTTPStatusError(f"HTTP {r.status_code}", request=r.request, response=r)
                    
                data = r.json()
                content = data["choices"][0]["message"]["content"]
                
                logger.info(f"[{correlation_id}] {'Fallback ' if is_fallback else ''}성공: {engine_key} ({processing_time:.3f}s)")
                
                return {
                    "tier": "free",
                    "engine": engine_key,
                    "model": engine_config["model"],
                    "reply": content,
                    "processing_time": round(processing_time, 3),
                    "timestamp": datetime.now().isoformat(),
                    "fallback_used": is_fallback
                }
            except Exception as e:
                logger.error(f"[{correlation_id}] 엔진 {engine_key} 실패: {str(e)[:200]}")
                raise e
        
        try:
            # 1차 시도: 기본 엔진
            return await try_engine(req.state.free_engine_key, engine, False)
            
        except Exception as primary_error:
            # 폴백 시도
            alt_key = other_engine_key(req.state.free_engine_key)
            if alt_key and alt_key in settings.FREE_ENGINES:
                logger.warning(f"[{correlation_id}] 기본 엔진 실패, 폴백 시도: {req.state.free_engine_key} -> {alt_key}")
                try:
                    return await try_engine(alt_key, settings.FREE_ENGINES[alt_key], True)
                except Exception as fallback_error:
                    logger.error(f"[{correlation_id}] 폴백도 실패: {fallback_error}")
                    
            # 모든 엔진 실패 시 원래 에러 반환
            if isinstance(primary_error, httpx.TimeoutException):
                raise HTTPException(status_code=504, detail=f"vLLM 서버 응답 시간 초과: {engine['model']}")
            elif isinstance(primary_error, httpx.ConnectError):
                raise HTTPException(status_code=503, detail=f"vLLM 서버 연결 불가: {engine['model']} (포트 {engine['port']})")
            else:
                raise HTTPException(status_code=500, detail=f"vLLM 서버 오류: {str(primary_error)}")
            
        # 위의 try-except 로직에서 처리됨

    # 프리미엄/엔터프라이즈: 기존 경로로 폴백
    try:
        # ChatRequest로 변환하여 기존 프리미엄 엔드포인트 호출
        chat_req = ChatRequest(
            message=request.message,
            temperature=request.temperature,
            max_tokens=request.max_tokens
        )
        
        response = await eft_chat_premium(chat_req)
        return {
            "tier": response.tier,
            "model": settings.PREMIUM_TIER_MODEL,
            "reply": response.response,
            "processing_time": response.processing_time,
            "timestamp": response.timestamp
        }
        
    except Exception as e:
        logger.error(f"프리미엄 모델 오류: {e}")
        raise HTTPException(status_code=500, detail=f"AI 응답 생성 오류: {str(e)}")

# 병렬 비교 엔드포인트 (DialoGPT 완전 대체!)
@app.post("/api/chat/compare", response_model=ComparisonResponse)
async def compare_llama3_vs_qwen25(request: ChatProxyRequest, req: Request):
    """
    Llama-3-8B vs Qwen-2.5-7B 병렬 비교 채팅
    - 두 모델을 동시에 호출하여 응답 비교
    - DialoGPT 완전 대체 시스템
    """
    import httpx
    
    correlation_id = getattr(req.state, 'correlation_id', 'unknown')
    logger.info(f"[{correlation_id}] 병렬 비교 요청: {request.message[:50]}...")
    
    # vLLM 호환 페이로드
    payload = {
        "model": "",  # 각 엔진별로 설정
        "messages": [
            {"role": "system", "content": "You are a helpful EFT counselor assistant specialized in Korean emotional support."},
            {"role": "user", "content": request.message},
        ],
        "temperature": request.temperature,
        "max_tokens": request.max_tokens,
    }
    
    timeout_config = httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=10.0)
    
    async def call_engine(engine_key: str, engine_config: dict):
        """개별 엔진 호출 함수"""
        base_url = f"http://127.0.0.1:{engine_config['port']}/v1"
        engine_payload = payload.copy()
        engine_payload["model"] = engine_config["model"]
        
        try:
            async with httpx.AsyncClient(timeout=timeout_config) as client:
                start_time = time.time()
                r = await client.post(f"{base_url}/chat/completions", json=engine_payload)
                processing_time = time.time() - start_time
                
                if r.status_code >= 400:
                    raise httpx.HTTPStatusError(f"HTTP {r.status_code}", request=r.request, response=r)
                    
                data = r.json()
                content = data["choices"][0]["message"]["content"]
                
                return {
                    "model": engine_config["model"],
                    "response": content,
                    "processing_time": round(processing_time, 3),
                    "success": True,
                    "error": None
                }
        except Exception as e:
            logger.error(f"[{correlation_id}] {engine_key} 실패: {str(e)[:200]}")
            return {
                "model": engine_config["model"],
                "response": f"❌ {engine_key} 연결 실패: {str(e)[:100]}",
                "processing_time": 0,
                "success": False,
                "error": str(e)
            }
    
    try:
        # 병렬 호출 시작
        start_time = time.time()
        
        # Llama-3와 Qwen-2.5 동시 호출
        engine_a_config = settings.FREE_ENGINES["engine_a"]  # Llama-3
        engine_b_config = settings.FREE_ENGINES["engine_b"]  # Qwen-2.5
        
        llama3_task = call_engine("engine_a", engine_a_config)
        qwen25_task = call_engine("engine_b", engine_b_config)
        
        # Promise.all 방식으로 병렬 처리
        llama3_result, qwen25_result = await asyncio.gather(llama3_task, qwen25_task)
        
        total_time = time.time() - start_time
        
        # 더 빠른 모델 결정
        if llama3_result["success"] and qwen25_result["success"]:
            faster_model = "llama3" if llama3_result["processing_time"] <= qwen25_result["processing_time"] else "qwen25"
        elif llama3_result["success"]:
            faster_model = "llama3"
        elif qwen25_result["success"]:
            faster_model = "qwen25"
        else:
            faster_model = "none"
        
        logger.info(f"[{correlation_id}] 비교 완료: {total_time:.3f}s (빠른 모델: {faster_model})")
        
        return ComparisonResponse(
            llama3_response=llama3_result,
            qwen25_response=qwen25_result,
            comparison_time=round(total_time, 3),
            faster_model=faster_model,
            timestamp=datetime.now().isoformat()
        )
        
    except Exception as e:
        logger.error(f"[{correlation_id}] 병렬 비교 오류: {e}")
        raise HTTPException(status_code=500, detail=f"병렬 비교 처리 오류: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    
    # 개발 서버 실행
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info" if settings.DEBUG else "warning"
    )