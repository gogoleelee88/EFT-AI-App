"""
EFT AI 서버 설정 관리
환경변수 및 모델 설정
"""

from pydantic_settings import BaseSettings
from typing import List, Optional, Dict
import os
from pathlib import Path

class Settings(BaseSettings):
    """서버 설정 클래스"""
    
    # 서버 기본 설정
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = True
    
    # CORS 설정 (개발/운영 분리)
    # 기본 개발용 화이트리스트 + 환경변수로 추가 도메인 주입 권장 (쉼표구분)
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]
    EXTRA_ALLOWED_ORIGINS: Optional[str] = None  # "https://example.com,https://app.example.com"
    
    # AI 모델 설정 (티어별 모델 시스템)
    MODEL_NAME: str = "microsoft/DialoGPT-medium"  # 기본 무료 모델
    MODEL_CACHE_DIR: str = "./models"  # 모델 캐시 디렉토리
    
    # 티어별 모델 설정
    FREE_TIER_MODEL: str = "microsoft/DialoGPT-medium"      # 무료: 기본 대화 (토큰 제한 필요)
    PREMIUM_TIER_MODEL: str = "meta-llama/Llama-3.1-8B-Instruct"  # 프리미엄: 실제 Llama 3.1
    ENTERPRISE_TIER_MODEL: str = "meta-llama/Llama-3.1-70B-Instruct"  # 기업: 최고급
    
    # A/B 테스트용 무료 모델 엔진들
    FREE_ENGINES: dict = {
        "engine_a": {
            "model": "meta-llama/Meta-Llama-3-8B-Instruct",
            "port": 8001,
            "description": "Llama-3-8B 엔진 A"
        },
        "engine_b": {
            "model": "Qwen/Qwen2.5-7B-Instruct",
            "port": 8002,
            "description": "Qwen2.5-7B 엔진 B"
        }
    }
    
    # A/B 테스트 로드밸런싱 전략 (4가지 지원)
    AB_TEST_STRATEGY: str = "round_robin"  # "round_robin", "random", "weighted", "sticky"
    
    # 현재 사용자 티어 (개발용 - 추후 사용자별 설정으로 변경)
    USER_TIER: str = "premium"  # "free", "premium", "enterprise" - Llama 3.1 승인 완료!
    
    # GPU/CPU 설정
    DEVICE: str = "auto"  # "cuda", "cpu", "auto"
    MAX_MEMORY: Optional[str] = None  # "12GiB" 형태로 설정 가능
    LOAD_IN_8BIT: bool = False  # 메모리 절약용 (비활성화)
    LOAD_IN_4BIT: bool = False   # 양자화 비활성화 (bitsandbytes 패키지 없음)
    
    # 생성 파라미터 기본값
    DEFAULT_MAX_TOKENS: int = 400
    DEFAULT_TEMPERATURE: float = 0.7
    DEFAULT_TOP_P: float = 0.9
    DEFAULT_TOP_K: int = 50
    
    # EFT 전문 설정
    EFT_EXPERTISE_LEVEL: str = "advanced"  # "basic", "intermediate", "advanced"
    KOREAN_CULTURE_CONTEXT: bool = True
    SAFETY_CHECK_ENABLED: bool = True
    
    # 데이터베이스 설정
    DATABASE_URL: str = "sqlite:///./eft_sessions.db"
    
    # 로깅 설정
    LOG_LEVEL: str = "INFO"
    LOG_FILE: str = "./logs/eft_ai_server.log"
    
    # API 키 (필요한 경우)
    HUGGINGFACE_TOKEN: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None  # 폴백용
    
    # 성능 최적화 설정
    BATCH_SIZE: int = 1
    MAX_CONCURRENT_REQUESTS: int = 10
    REQUEST_TIMEOUT: int = 120  # 초
    
    # vLLM 프록시 설정
    VLLM_CONNECT_TIMEOUT: float = 10.0  # 연결 타임아웃
    VLLM_READ_TIMEOUT: float = 120.0    # 읽기 타임아웃
    VLLM_HEALTH_CHECK_TIMEOUT: float = 5.0  # 헬스체크 타임아웃
    
    # Sticky 세션 설정 (사용자별 엔진 고정)
    STICKY_SESSION_TTL: int = 3600  # sticky 세션 유지 시간 (초)
    STICKY_SESSIONS: Dict[str, str] = {}  # 메모리 기반 sticky 매핑
    
    # Sticky 세션 설정 (사용자별 엔진 고정)
    STICKY_SESSION_TTL: int = 3600  # sticky 세션 유지 시간 (초)
    STICKY_SESSIONS: Dict[str, str] = {}  # 메모리 기반 sticky 매핑
    
    # Redis 설정 (다중 워커 환경 지원)
    REDIS_URL: Optional[str] = None  # "redis://localhost:6379/0"
    USE_REDIS_FOR_STICKY: bool = False
    USE_REDIS_FOR_RATE_LIMIT: bool = False
    
    # 운영 보안 설정
    INTERNAL_NETWORKS: List[str] = ["127.0.0.1", "localhost", "::1"]
    ADMIN_API_KEY: Optional[str] = None  # 관리자 API 키
    
    # 로깅 설정 확장
    ENABLE_REQUEST_LOGGING: bool = True  # 요청 로깅 개별 제어
    
    # 캐싱 설정
    RESPONSE_CACHE_TTL: int = 3600  # 1시간
    
    # 모니터링 설정
    ENABLE_PROMETHEUS: bool = True
    PROMETHEUS_PORT: int = 8001
    
    # 보안 설정
    SECRET_KEY: str = "your-secret-key-change-this"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    class Config:
        env_file = ".env"  # .env 파일 사용
        env_file_encoding = "utf-8"
        env_ignore_empty = True

# 설정 싱글톤
_settings = None

def get_settings() -> Settings:
    """설정 인스턴스 반환 (싱글톤 패턴)"""
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings

# 환경별 설정 오버라이드
def get_development_settings() -> Settings:
    """개발 환경용 설정"""
    settings = get_settings()
    settings.DEBUG = True
    settings.LOG_LEVEL = "DEBUG"
    # Llama 3.1 승인 완료! 이제 최고급 모델 사용 가능
    settings.MODEL_NAME = "meta-llama/Llama-3.1-8B-Instruct"  # Llama 3.1으로 업그레이드!
    settings.LOAD_IN_4BIT = False  # 성능 최대화
    return settings

def get_production_settings() -> Settings:
    """운영 환경용 설정"""
    settings = get_settings()
    settings.DEBUG = False
    settings.LOG_LEVEL = "WARNING"
    settings.MODEL_NAME = "meta-llama/Llama-3.1-8B-Instruct"  # 성능 모델
    settings.LOAD_IN_4BIT = False
    settings.ENABLE_PROMETHEUS = True
    return settings

# 모델별 설정 프리셋
MODEL_PRESETS = {
    # 빠른 테스트용
    "llama2-7b-quick": {
        "model_name": "meta-llama/Llama-2-7b-chat-hf",
        "load_in_4bit": True,
        "max_memory": "6GiB"
    },
    
    # 권장 운영용
    "llama3-8b-optimal": {
        "model_name": "meta-llama/Llama-3.1-8B-Instruct", 
        "load_in_4bit": False,
        "max_memory": "12GiB"
    },
    
    # 고성능용 (GPU 필수)
    "llama3-70b-premium": {
        "model_name": "meta-llama/Llama-3.1-70B-Instruct",
        "load_in_4bit": True,
        "max_memory": "40GiB"
    }
}

def apply_model_preset(preset_name: str) -> Settings:
    """모델 프리셋 적용"""
    settings = get_settings()
    
    if preset_name not in MODEL_PRESETS:
        raise ValueError(f"알 수 없는 프리셋: {preset_name}")
    
    preset = MODEL_PRESETS[preset_name]
    settings.MODEL_NAME = preset["model_name"]
    settings.LOAD_IN_4BIT = preset["load_in_4bit"]
    settings.MAX_MEMORY = preset["max_memory"]
    
    return settings