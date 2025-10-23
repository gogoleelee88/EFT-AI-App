# 또는 vim/vi/VSCode 사용

# => "from routers.compare ..." 라인을
#    "from backend.routers.compare ..." 로 수정 후 저장
"""
EFT AI 서버 - FastAPI 메인 애플리케이션
심리상담 특화 Llama 3 기반 AI 서버
"""

from backend.routers.health import router as health_router

from fastapi import FastAPI, HTTPException, BackgroundTasks, Request, Header
from fastapi.staticfiles import StaticFiles
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send, Message
from starlette.requests import Request as StarletteRequest
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Literal
import asyncio
import time
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import itertools
import random
import re
import logging
import uuid
from uuid import uuid4
from collections import defaultdict, deque

# 로컬 모듈 임포트 (절대 임포트 유지)
from backend.services.vllm_client import VLLMClient
from backend.services.vllm_proxy import get_vllm_proxy
from backend.services.prompt_manager import EFTPromptManager
from backend.services.emotion_analyzer import EmotionAnalyzer
from backend.services.memory_system import (
    build_context,
    update_running_summary,
    save_turn,
    get_memory_system,
    get_memory_stats,
)
from backend.models.chat_models import ChatRequest, ChatResponse, StreamResponse
from backend.utils.action_builder import build_actions
from backend.models.action_tokens import TokenParser, TokenProcessor, ActionToken, ActionTokenType
from backend.models.suds import SUDSType, SUDSEntry, SUDSRequest, SUDSResponse
from backend.services.suds_logger import append_suds
from backend.config.settings import get_settings
from backend.utils.logger import get_logger
# Premium router removed - using only free tier /api/chat endpoint

# 설정 및 로거
settings = get_settings()
logger = get_logger(__name__)

# --- 데이터 파일 경로 준비 ---
DATA_DIR = Path(__file__).resolve().parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
SUDS_FILE = DATA_DIR / "suds_events.jsonl"
NOTICES_FILE = DATA_DIR / "notices.json"

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

# SUDS 타입은 models.suds에서 임포트

# VLLMClient는 app.state로 관리

# --- ask_suds 자동 방출 헬퍼 함수 ---
def _maybe_emit_ask_suds(user_text: str, assistant_text: str) -> Optional[dict]:
    """
    사용자의 요청/숫자(0~10) 또는 어시스턴트의 '0~10 평가' 유도 문구가 있을 때
    액션 토큰 {"type":"ask_suds", "payload":{"measurement_type":"check"}}을 반환.
    매칭 실패 시 None.
    """
    try:
        t_user = (user_text or "").strip()
        t_ai = (assistant_text or "").strip()

        # 1) 한국어/일반 유도문 감지 (0~10 / 0에서 10 / 0-10)
        if re.search(r"0\s*[-~]\s*10|0에서\s*10|0\s*~\s*10", t_ai):
            return {"type": "ask_suds", "payload": {"measurement_type": "check"}}

        # 2) 사용자가 숫자만 입력 (0~10)
        if re.fullmatch(r"\s*(?:10|[0-9])\s*", t_user):
            return {"type": "ask_suds", "payload": {"measurement_type": "check"}}

        # 3) 사용자 키워드
        if re.search(r"(평가|점수|몇\s*점|suds)", t_user, flags=re.I):
            return {"type": "ask_suds", "payload": {"measurement_type": "check"}}
    except Exception:
        pass
    return None

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

# 0. 바디 재주입 미들웨어 (최우선 배치)
class IdempotentBodyMiddleware(BaseHTTPMiddleware):
    """
    Downstream 미들웨어/핸들러가 request body를 여러 번 읽어도 안전하도록
    body를 캐싱하고 receive 이벤트를 replay해 준다.
    """

    async def dispatch(self, request: Request, call_next):
        # 원본 receive를 잡아두고, body를 한 번 읽어 캐싱
        body = await request.body()

        async def receive() -> Message:
            # 캐싱된 body를 한 번만 내려보내고, 이후엔 빈 바디를 반환
            nonlocal body
            message: Message = {"type": "http.request", "body": body, "more_body": False}
            body = b""  # 다음 호출부터는 빈 바디
            return message

        # 새 Request로 교체 (replay 가능한 receive 주입)
        request = StarletteRequest(request.scope, receive)
        return await call_next(request)

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
app.include_router(health_router)  # <- health first
# ⚠️ StaticFiles mount는 모든 API 라우트 정의 후 파일 끝에 배치
# 🔍 미들웨어 스택 진단 로그 추가
def _dump_middleware(tag: str):
    """미들웨어 스택 진단 로그"""
    # 사용자 등록 목록
    logger.info("MIDDLEWARE-USER[%s]: %s", tag, [mw.cls.__name__ for mw in app.user_middleware])
    # 빌드된 스택 추적
    node = app.middleware_stack
    names = []
    while getattr(node, "app", None) is not None:
        names.append(type(node).__name__)
        node = node.app
    logger.info("MIDDLEWARE-BUILT[%s]: %s", tag, " -> ".join(names))

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

# 2. Trace ID 발급/전파 시스템 (운영 관측성)
class TraceIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # 요청에서 trace_id 추출 또는 생성
        trace_id = (
            request.headers.get("x-trace-id") or
            request.headers.get("x-request-id") or
            request.headers.get("traceparent", "").split("-")[1] if request.headers.get("traceparent") else None or
            uuid.uuid4().hex
        )

        # request.state에 저장
        request.state.trace_id = trace_id
        request.state.correlation_id = trace_id  # 기존 호환성

        start_time = time.time()
        response = await call_next(request)
        processing_time = (time.time() - start_time) * 1000

        # 응답 헤더에 trace_id 추가
        response.headers["x-trace-id"] = trace_id
        response.headers["x-request-id"] = trace_id  # 기존 호환성
        response.headers["x-processing-time"] = f"{processing_time:.2f}ms"

        return response

# 3. 강화된 레이트 리밋 (운영급)
class EnhancedRateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp,
                 requests_per_minute: int = 60,
                 chat_requests_per_minute: int = 10,
                 burst_requests_per_second: int = 10):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.chat_requests_per_minute = chat_requests_per_minute
        self.burst_requests_per_second = burst_requests_per_second

        # IP별 요청 기록 (분단위/초단위)
        self.request_times_minute = defaultdict(deque)
        self.request_times_second = defaultdict(deque)
        self.chat_request_times = defaultdict(deque)

        # 차단된 IP 목록 (자동 해제)
        self.blocked_ips = {}

    def _is_blocked(self, ip: str) -> bool:
        """IP 차단 상태 확인 및 자동 해제"""
        if ip in self.blocked_ips:
            if time.time() < self.blocked_ips[ip]:
                return True
            else:
                del self.blocked_ips[ip]
                logger.info(f"IP {ip} 차단 해제")
        return False

    def _block_ip(self, ip: str, duration: int = 300):
        """IP 차단 (기본 5분)"""
        self.blocked_ips[ip] = time.time() + duration
        logger.warning(f"IP {ip} {duration}초 차단")

    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"
        current_time = time.time()
        path = request.url.path

        # 차단된 IP 체크
        if self._is_blocked(client_ip):
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "IP가 일시적으로 차단되었습니다.",
                    "trace_id": getattr(request.state, "trace_id", None)
                },
                headers={"Retry-After": "300"}
            )

        # 1. 초당 버스트 제한 (DDoS 방지)
        second_requests = self.request_times_second[client_ip]
        while second_requests and current_time - second_requests[0] > 1:
            second_requests.popleft()

        if len(second_requests) >= self.burst_requests_per_second:
            self._block_ip(client_ip, 60)  # 1분 차단
            logger.warning(f"초당 버스트 제한 초과: {client_ip} ({len(second_requests)} req/s)")
            return JSONResponse(
                status_code=429,
                content={
                    "detail": f"Too many requests per second (max {self.burst_requests_per_second})",
                    "trace_id": getattr(request.state, "trace_id", None)
                },
                headers={"Retry-After": "60"}
            )

        # 2. 분당 일반 제한
        minute_requests = self.request_times_minute[client_ip]
        while minute_requests and current_time - minute_requests[0] > 60:
            minute_requests.popleft()

        if len(minute_requests) >= self.requests_per_minute:
            logger.warning(f"분당 제한 초과: {client_ip} ({len(minute_requests)} req/min)")
            return JSONResponse(
                status_code=429,
                content={
                    "detail": f"Rate limit exceeded. Maximum {self.requests_per_minute} requests per minute",
                    "trace_id": getattr(request.state, "trace_id", None)
                },
                headers={"Retry-After": "60"}
            )

        # 3. 채팅 API 특별 제한 (프리미엄 사용자 별도 한도)
        if "/chat" in path or "/ab/chat" in path:
            # 프리미엄 API 키 확인
            api_key = request.headers.get("x-api-key")
            is_premium = (api_key == settings.PREMIUM_API_KEY) if api_key else False

            # 프리미엄 사용자는 더 높은 한도 적용
            chat_limit = self.chat_requests_per_minute * 3 if is_premium else self.chat_requests_per_minute

            chat_requests = self.chat_request_times[client_ip]
            while chat_requests and current_time - chat_requests[0] > 60:
                chat_requests.popleft()

            if len(chat_requests) >= chat_limit:
                tier = "premium" if is_premium else "free"
                logger.warning(f"채팅 API 제한 초과 ({tier}): {client_ip} ({len(chat_requests)} chat/min, 한도: {chat_limit})")
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": f"Chat API rate limit ({tier}): maximum {chat_limit} requests per minute",
                        "trace_id": getattr(request.state, "trace_id", None)
                    },
                    headers={"Retry-After": "60"}
                )
            chat_requests.append(current_time)

        # 요청 기록
        second_requests.append(current_time)
        minute_requests.append(current_time)

        # 정상 처리
        response = await call_next(request)

        # 응답 헤더에 Rate Limit 정보 추가
        remaining = max(0, self.requests_per_minute - len(minute_requests))
        response.headers["X-RateLimit-Limit"] = str(self.requests_per_minute)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(int(current_time + 60))

        return response

# 4. API 키 인증 미들웨어 (MVP 리뷰어 보호)
class APIKeyAuthMiddleware(BaseHTTPMiddleware):
    """
    전역 API 키 미들웨어.
    - public_paths: 전역 인증 제외 경로
    - 일반 + 프리미엄 키 모두 허용 (헤더: X-API-Key)
    - 프리미엄 엔드포인트(/api/chat/premium...)는 전역 미들웨어 제외 (엔드포인트 내부에서 PremiumAuth로 재검증)
    """
    def __init__(self, app: ASGIApp, settings, public_paths: set[str]):
        super().__init__(app)
        self.settings = settings
        self.api_key = settings.API_KEY
        self.premium_key = getattr(settings, "PREMIUM_API_KEY", None)
        self.public_paths = public_paths

        logger.info(f"🔐 API 키 인증 미들웨어 초기화 (일반 키: {'설정됨' if self.api_key else '미설정'}, 프리미엄 키: {'설정됨' if self.premium_key else '미설정'})")

    async def dispatch(self, request: Request, call_next):
        path = request.scope.get("path", "/")

        # 1) 완전 공개 경로
        if path in self.public_paths:
            return await call_next(request)

        # 2) 프리미엄 엔드포인트는 전역 미들웨어 패스(내부 의존성에서 검증)
        if (path.startswith("/api/chat") or
            path.startswith("/api/validate") or
            path.startswith("/api/premium")):
            return await call_next(request)

        # 3) 그 외는 전역 키 검사
        #    일반/프리미엄 키 모두 허용 (둘 중 하나 맞으면 통과)
        header_key = request.headers.get("x-api-key")
        if not header_key:
            logger.warning(f"🚫 API 키 누락: {request.client.host if request.client else 'unknown'} -> {path}")
            return JSONResponse(
                status_code=401,
                content={
                    "detail": "Missing X-API-Key",
                    "message": "X-API-Key 헤더가 필요합니다",
                    "trace_id": getattr(request.state, "trace_id", None)
                }
            )

        if header_key != (self.api_key or "") and header_key != (self.premium_key or ""):
            logger.warning(f"🚫 잘못된 API 키: {request.client.host if request.client else 'unknown'} -> {path}")
            return JSONResponse(
                status_code=401,
                content={
                    "detail": "Invalid X-API-Key",
                    "message": "올바른 API 키를 제공해주세요",
                    "trace_id": getattr(request.state, "trace_id", None)
                }
            )

        # 인증 성공
        request.state.authenticated = True
        logger.info(f"✅ API 키 인증 성공: {request.client.host if request.client else 'unknown'} -> {path}")

        return await call_next(request)

# 미들웨어 등록 (순서 중요!)
app.add_middleware(MaxBodySizeMiddleware, max_bytes=256 * 1024)  # 256KB로 여유 있게
app.add_middleware(TraceIdMiddleware)
# 🔐 Global APIKeyAuthMiddleware: FORCE-DISABLED for Premium-Only System
# 프리미엄 전용 시스템에서는 전역 API 키 인증 완전 비활성화
# 모든 프리미엄 엔드포인트는 PremiumAuth dependency로 개별 인증
logger.info("🚫 Global APIKeyAuthMiddleware: FORCE-DISABLED (Premium-only system)")

# app.add_middleware(
#     APIKeyAuthMiddleware,
#     settings=settings,
#     public_paths={
#         "/",
#         "/health",
#         "/v1/health",
#         "/api/health",
#         "/docs",
#         "/redoc",
#         "/openapi.json",
#         "/v1/health/engines",
#         "/api/chat/premium",
#         "/api/chat/premium/shadow",
#     },
# )
app.add_middleware(EnhancedRateLimitMiddleware,
                   requests_per_minute=120,      # 일반 API 분당 120회
                   chat_requests_per_minute=20,  # 채팅 API 분당 20회
                   burst_requests_per_second=15) # 초당 최대 15회 (DDoS 방지)
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
        allow_headers=["Authorization", "Content-Type", "X-API-Key"],
        allow_credentials=True,
    )

# 🔧 IdempotentBodyMiddleware 등록 (최우선 실행 - 마지막 등록)
# FastAPI는 미들웨어를 역순으로 실행하므로, 첫 번째로 실행하려면 마지막에 등록
app.add_middleware(IdempotentBodyMiddleware)
logger.info("🔧 IdempotentBodyMiddleware: 최우선 배치 완료 (body 캐싱)")

# Premium router removed - free tier /api/chat is the primary endpoint

# AI 지원 서비스 전역 변수 (서버 시작시 로드)  
# AI 엔진은 app.state.vllm으로 대체됨
prompt_manager: Optional[EFTPromptManager] = None
emotion_analyzer: Optional[EmotionAnalyzer] = None

@app.on_event("startup")
async def startup_event():
    """서버 시작시 AI 클라이언트 및 서비스 초기화"""
    global prompt_manager, emotion_analyzer

    logger.info("🚀 EFT AI 서버 시작 중...")

    # 🔍 미들웨어 스택 진단 로그
    _dump_middleware("startup")

    # 🎛️ 프리미엄 라우팅 설정 로그
    logger.info(
        "premium: mode=%s engine=%s A=%s B=%s timeout=%ss retry=%s",
        settings.PREMIUM_MODE,
        settings.VLLM_PREMIUM_ENGINE,
        settings.VLLM_ENGINE_A_URL,
        settings.VLLM_ENGINE_B_URL,
        settings.PREMIUM_REQUEST_TIMEOUT,
        settings.PREMIUM_MAX_RETRIES,
    )

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

# 글로벌 예외 핸들러 (trace_id 포함)
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    trace_id = getattr(request.state, "trace_id", None)
    logger.error(f"[{trace_id}] 처리되지 않은 예외: {exc}", exc_info=True)

    payload = {
        "detail": "Internal Server Error",
        "error_type": type(exc).__name__
    }
    if trace_id:
        payload["trace_id"] = trace_id

    return JSONResponse(
        status_code=500,
        content=payload
    )

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    trace_id = getattr(request.state, "trace_id", None)
    client_ip = request.client.host if request.client else "unknown"

    # 구조화된 로깅
    logger.warning(
        "[%s] HTTP 예외: %s - %s",
        trace_id, exc.status_code, exc.detail,
        extra={
            "event": "http_exception",
            "trace_id": trace_id,
            "client_ip": client_ip,
            "status_code": exc.status_code,
            "detail": exc.detail,
            "path": request.url.path,
            "method": request.method
        }
    )

    payload = {
        "detail": exc.detail,
        "status_code": exc.status_code
    }
    if trace_id:
        payload["trace_id"] = trace_id

    return JSONResponse(
        status_code=exc.status_code,
        content=payload
    )

# JSON 파싱 실패 전용 예외 핸들러
from pydantic import ValidationError
from fastapi.exceptions import RequestValidationError

@app.exception_handler(ValidationError)
async def validation_exception_handler(request: Request, exc: ValidationError):
    trace_id = getattr(request.state, "trace_id", None)
    client_ip = request.client.host if request.client else "unknown"

    # 요청 바디 안전하게 로깅 (최대 200자)
    try:
        body = await request.body()
        safe_body = body.decode("utf-8", "replace")[:200]
    except:
        safe_body = "읽기 실패"

    logger.warning(
        "[%s] JSON 파싱 실패: %s",
        trace_id, str(exc),
        extra={
            "event": "validation_error",
            "trace_id": trace_id,
            "client_ip": client_ip,
            "path": request.url.path,
            "method": request.method,
            "content_type": request.headers.get("content-type"),
            "body_preview": safe_body,
            "error_count": len(exc.errors())
        }
    )

    return JSONResponse(
        status_code=422,
        content={
            "detail": "Request validation failed",
            "errors": exc.errors(),
            "trace_id": trace_id
        }
    )

@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(request: Request, exc: RequestValidationError):
    trace_id = getattr(request.state, "trace_id", None)
    client_ip = request.client.host if request.client else "unknown"

    # 요청 바디 안전하게 로깅 (최대 200자)
    try:
        body = await request.body()
        safe_body = body.decode("utf-8", "replace")[:200]
    except:
        safe_body = "읽기 실패"

    logger.warning(
        "[%s] 요청 검증 실패: %s",
        trace_id, str(exc),
        extra={
            "event": "request_validation_error",
            "trace_id": trace_id,
            "client_ip": client_ip,
            "safe_body": safe_body,
            "error_count": len(exc.errors())
        }
    )

    return JSONResponse(
        status_code=422,
        content={
            "detail": "JSON payload validation failed. Expected format: {\"message\":\"텍스트\",\"temperature\":0.7,\"max_tokens\":300}",
            "errors": exc.errors(),
            "trace_id": trace_id,
            "example_payload": {
                "message": "안녕하세요",
                "temperature": 0.7,
                "max_tokens": 300
            }
        }
    )

# 기본 엔드포인트 (StaticFiles가 / 를 처리하도록 주석 처리)
# @app.get("/")
# async def root():
#     """서버 상태 확인"""
#     return {
#         "service": "EFT AI 상담 서버",
#         "status": "running",
#         "version": "1.0.0",
#         "vllm_client": "ready",
#         "timestamp": datetime.now().isoformat()
#     }

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

# === v1 API 네임스페이스 (운영화) ===
proxy = get_vllm_proxy()

@app.get("/v1/health/engines")
async def health_engines_v1(request: Request):
    """Engine A/B 헬스체크 - v1"""
    result = await proxy.health_check_engines(request=request)
    return {
        "api_version": "v1",
        "engines": result,
        "schema_version": "1.0"
    }

@app.post("/suds", response_model=SUDSResponse, tags=["suds"])
async def save_suds(req: SUDSRequest):
    """SUDS 저장 엔드포인트"""
    trace_id = str(uuid4())
    now = _now_iso()

    entry = SUDSEntry(
        trace_id=trace_id,
        type=req.type,
        score=req.score,
        session_id=req.session_id,
        user_id=req.user_id,
        saved_at=now,
        timestamp=now,
    )
    try:
        append_suds(entry)
    except Exception as e:
        logger.exception(f"SUDS save failed: {trace_id}")
        raise HTTPException(status_code=500, detail="SUDS 저장 실패")

    # 구조적 로깅
    logger.info("SUDS saved", extra={
        "event": "suds_saved",
        "trace_id": trace_id,
        "session_id": req.session_id,
        "user_id": req.user_id,
        "score": req.score,
        "type": req.type,
        "saved_at": now,
    })

    return SUDSResponse(
        ok=True,
        trace_id=trace_id,
        saved_at=now,
    )

@app.get("/suds/by-session/{session_id}", response_model=List[SUDSEntry], tags=["suds"])
async def list_suds_by_session(session_id: str):
    """세션별 SUDS 조회 엔드포인트"""
    items = read_suds_by_session(session_id)
    return items

@app.post("/api/memory/{session_id}/suds", tags=["memory"])
async def record_suds_memory(session_id: str, payload: dict):
    """
    메모리 시스템에 SUDS 측정값 기록
    payload: { "turn_id": str, "measurement_type": "pre"|"post"|"check", "suds_value": int }
    """
    try:
        ms = get_memory_system()
        ms.record_suds_measurement(
            session_id=session_id,
            turn_id=payload.get("turn_id") or f"ui_{int(time.time() * 1000)}",
            suds_value=int(payload["suds_value"]),
            measurement_type=payload.get("measurement_type", "check"),
        )

        # 러닝 서머리 갱신 (SUDS 변화 반영)
        updated_summary = update_running_summary(session_id)

        logger.info(f"SUDS 기록 완료: {session_id} - {payload.get('measurement_type')}={payload['suds_value']}")

        return {
            "ok": True,
            "session_id": session_id,
            "turn_id": payload.get("turn_id"),
            "measurement_type": payload.get("measurement_type"),
            "suds_value": payload["suds_value"],
            "updated_summary": updated_summary
        }

    except Exception as e:
        logger.exception(f"SUDS 기록 오류: {session_id}")
        return JSONResponse(
            {"ok": False, "error": str(e), "session_id": session_id},
            status_code=400
        )

@app.get("/api/memory/{session_id}/stats")
async def get_session_memory_stats(session_id: str):
    """메모리 통계 조회 (디버깅/분석용)"""
    try:
        stats = get_memory_stats(session_id)
        return {
            "ok": True,
            "session_id": session_id,
            "stats": stats
        }
    except Exception as e:
        logger.exception(f"메모리 통계 조회 오류: {session_id}")
        return JSONResponse(
            {"ok": False, "error": str(e), "session_id": session_id},
            status_code=500
        )

@app.post("/v1/ab/chat")
async def chat_ab_v1(payload: dict, request: Request):
    """Engine A/B 병렬 채팅 - v1"""
    result = await proxy.chat_ab_parallel(payload, request=request)
    # v1 스키마 래핑
    return {
        "api_version": "v1",
        "data": result,
        "schema_version": "1.0"
    }

@app.post("/v1/chat/{engine}")
async def chat_single_v1(engine: str, payload: dict, request: Request):
    """단일 엔진 채팅 - v1"""
    result = await proxy.chat_single_engine(engine, payload, request=request)
    return {
        "api_version": "v1",
        "engine": engine,
        "data": result,
        "schema_version": "1.0"
    }

# 레거시 지원 (임시)
@app.get("/health/engines")
async def health_engines_legacy(request: Request):
    """레거시 지원 - 곧 제거 예정"""
    return await proxy.health_check_engines(request=request)

@app.post("/ab/chat")
async def chat_ab_legacy(payload: dict, request: Request):
    """레거시 지원 - 곧 제거 예정"""
    return await proxy.chat_ab_parallel(payload, request=request)

@app.post("/chat/{engine}")
async def chat_single_legacy(engine: str, payload: dict, request: Request):
    """레거시 지원 - 곧 제거 예정"""
    return await proxy.chat_single_engine(engine, payload, request=request)

@app.get("/v1/health")
async def health_check_v1():
    """v1 헬스 체크 엔드포인트 (표준화된 응답)"""
    return {
        "api_version": "v1",
        "status": "healthy",
        "version": "1.0.0",
        "services": {
            "vllm_free_engine": "ready",
            "vllm_premium_engine": "ready",
            "prompt_manager": "loaded" if prompt_manager else "not_loaded",
            "emotion_analyzer": "loaded" if emotion_analyzer else "not_loaded"
        },
        "metadata": {
            "uptime": time.time(),
            "available_tiers": ["free", "premium"],
            "memory_usage": "TODO: 메모리 사용량"
        },
        "schema_version": "1.0",
        "deprecated_endpoints": ["/api/health", "/health"]
    }

@app.get("/api/health")
async def health_check_api():
    """레거시 API 헬스 체크 (v1으로 리다이렉션 안내)"""
    return {
        "status": "healthy",
        "deprecation_notice": "이 엔드포인트는 곧 폐기됩니다. /v1/health를 사용해주세요.",
        "redirect_to": "/v1/health",
        "vllm_free_engine": "ready",
        "vllm_premium_engine": "ready",
        "prompt_manager": "loaded" if prompt_manager else "not_loaded",
        "emotion_analyzer": "loaded" if emotion_analyzer else "not_loaded",
        "uptime": time.time(),
        "available_tiers": ["free", "premium"]
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
    기본 EFT AI 상담 채팅 (Engine A/B 병렬 비교 + 메모리 시스템 v1)
    DialoGPT 완전 폐기! 이제 무료 사용자도 Llama-3 vs Qwen-2.5 병렬 비교 사용
    """
    try:
        # 🧠 메모리 시스템: 컨텍스트 구축
        session_id = request.session_id or f"session_{int(time.time() * 1000)}"
        user_id = getattr(request.user_profile, 'user_id', None) if request.user_profile else None
        context = build_context(session_id=session_id, user_id=user_id, k=5)

        logger.info(f"대화 컨텍스트: {session_id} ({context['context_stats']['total_turns']}턴)")

        meta = {"session_id": session_id, "user_id": user_id}

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
            raw_response = comparison_result.llama3_response["response"]
            model_info = "Engine A (Llama-3-8B)"
        elif comparison_result.faster_model == "qwen25" and comparison_result.qwen25_response["success"]:
            raw_response = comparison_result.qwen25_response["response"]
            model_info = "Engine B (Qwen-2.5-7B)"
        else:
            # 둘 다 실패했을 경우 폴백 (vLLM 서버 미실행 상태)
            raw_response = "안녕하세요! 현재 AI 모델 서버가 준비 중입니다. vLLM 서버를 실행해주세요. (포트 8001, 8002)"
            model_info = "Fallback (vLLM 서버 필요)"

        # 🔥 토큰 파이프라인 처리
        tokens = TokenParser.extract_tokens(raw_response)
        clean_response = TokenParser.remove_tokens(raw_response)

        # 토큰 실행 (컨텍스트 전달)
        token_context = {
            "session_id": request.session_id,
            "user_id": getattr(request.user_profile, 'user_id', None) if request.user_profile else None,
            "message": request.message,
            "emotion_analysis": emotion_analysis
        }
        action_results = await TokenProcessor().process_tokens(tokens, context=token_context)

        # 로깅 (운영 관측성)
        logger.info(f"토큰 처리 완료: {len(tokens)}개 토큰, {len(action_results.get('executed_actions', []))}개 액션 실행")

        # 🧠 메모리 시스템: 대화 턴 저장
        turn_id = f"turn_{int(time.time() * 1000)}"
        save_turn(
            session_id=session_id,
            turn_id=turn_id,
            user_message=request.message,
            ai_response=clean_response,
            emotion_analysis=emotion_analysis.__dict__ if hasattr(emotion_analysis, '__dict__') else emotion_analysis,
            actions=action_results.get("executed_actions", [])
        )

        # 🧠 메모리 시스템: running_summary 업데이트
        updated_summary = update_running_summary(session_id)
        logger.info(f"대화 기록 저장 완료: {session_id}/{turn_id}")

        # ask_suds 자동 방출 (조건 충족 시)
        executed_actions: List[Dict[str, Any]] = list(action_results.get("executed_actions", []))

        actions_from_builder = build_actions(request.message, meta) or []
        executed_actions.extend(actions_from_builder)

        try:
            ask = _maybe_emit_ask_suds(
                user_text=request.message,
                assistant_text=clean_response
            )
            if ask:
                executed_actions.append(ask)
        except Exception:
            pass

        # ChatResponse 형태로 반환 (토큰 처리 결과 포함)
        return ChatResponse(
            response=clean_response,  # 🔥 토큰 제거된 깔끔한 텍스트
            emotion_analysis=emotion_analysis,
            eft_recommendations=[],  # 병렬 비교에서는 기본값
            suggested_actions=[],
            actions=executed_actions,  # 🔥 토큰 실행 결과 + ask_suds 자동 방출
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
            actions=[],  # 폴백 시에는 액션 없음
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

# SUDS 모델들은 models.suds에서 임포트됨

def append_suds(entry: SUDSEntry) -> None:
    # JSON Lines로 한 줄씩 누적 저장
    with SUDS_FILE.open("a", encoding="utf-8") as f:
        f.write(entry.json(ensure_ascii=False) + "\n")

def read_suds_by_session(session_id: str) -> List[SUDSEntry]:
    results: List[SUDSEntry] = []
    if not SUDS_FILE.exists():
        return results
    with SUDS_FILE.open("r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            try:
                obj = json.loads(line)
                if obj.get("session_id") == session_id:
                    results.append(SUDSEntry(**obj))
            except Exception:
                # 손상된 라인은 무시(로그만)
                logger.warning(f"Malformed SUDS line: {line[:120]}")
                pass
    return results

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

# 병렬 비교 엔드포인트는 backend.routers.compare로 이동됨 (중복 제거)

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

app.include_router(health_router)  # health endpoints first-class

# ===================================================================
# StaticFiles 마운트 (모든 API 라우트 이후에 배치)
# ===================================================================
# 프론트엔드 별도 배포 시 디렉터리가 없을 수 있으므로 존재할 때만 마운트
static_dir = Path("backend/static-frontend")
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
    logger.info(f"📂 StaticFiles 마운트 완료: {static_dir}")
else:
    logger.info(f"📂 StaticFiles 마운트 스킵: {static_dir} 디렉터리 없음 (프론트엔드 별도 배포 시 정상)")

from backend.routers.compare import router as compare_router
app.include_router(compare_router)
