from __future__ import annotations

import os
import json
from typing import Dict, List, Optional

from pydantic import Field, ValidationInfo, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ALLOWED_PREMIUM_MODE = {"proxy", "direct"}
ALLOWED_ENGINE = {"A", "B", "AB"}
ALLOWED_MODULE_MODE = {"lite", "pro"}
ALLOWED_PROPOSAL_LLM_PROVIDER = {"auto", "openai", "vllm", "mock"}
ALLOWED_SOFT_NUDGE_MODE = {"prod", "demo"}


def _coerce_list_env(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [str(v).strip() for v in value if str(v).strip()]
    if not isinstance(value, str):
        return [str(value).strip()]

    raw = value.strip()
    if not raw:
        return []

    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(v).strip() for v in parsed if str(v).strip()]
    except (json.JSONDecodeError, TypeError):
        pass

    return [item.strip() for item in raw.split(",") if item.strip()]


class Settings(BaseSettings):
    """Application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = True

    ALLOWED_ORIGINS: List[str] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://localhost:5173",
            "http://localhost:5174",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:5174",
            "https://eft-ai-app-frontend-4ia5.vercel.app",
            "https://app.moodtalk.app",
            "https://www.moodtalk.app",
            "https://moodtalk.app",
        ]
    )
    EXTRA_ALLOWED_ORIGINS: Optional[str] = None

    MODEL_NAME: str = "microsoft/DialoGPT-medium"
    MODEL_CACHE_DIR: str = "./models"

    FREE_TIER_MODEL: str = "ENGINE_AB_ONLY"
    PREMIUM_TIER_MODEL: str = "meta-llama/Llama-3.1-8B-Instruct"
    ENTERPRISE_TIER_MODEL: str = "meta-llama/Llama-3.1-70B-Instruct"

    FREE_ENGINES: Dict[str, Dict[str, object]] = Field(
        default_factory=lambda: {
            "engine_a": {
                "model": "meta-llama/Meta-Llama-3-8B-Instruct",
                "port": 8001,
                "description": "Llama-3-8B engine A",
            },
            "engine_b": {
                "model": "Qwen/Qwen2.5-7B-Instruct",
                "port": 8002,
                "description": "Qwen2.5-7B engine B",
            },
        }
    )

    AB_TEST_STRATEGY: str = "round_robin"
    USER_TIER: str = "premium"

    DEVICE: str = "auto"
    MAX_MEMORY: Optional[str] = None
    LOAD_IN_8BIT: bool = False
    LOAD_IN_4BIT: bool = False

    DEFAULT_MAX_TOKENS: int = 400
    DEFAULT_TEMPERATURE: float = 0.7
    DEFAULT_TOP_P: float = 0.9
    DEFAULT_TOP_K: int = 50

    MODULE_MODE: str = Field("lite", env="MODULE_MODE")

    EFT_EXPERTISE_LEVEL: str = "advanced"
    KOREAN_CULTURE_CONTEXT: bool = True
    SAFETY_CHECK_ENABLED: bool = True

    DATABASE_URL: str = "sqlite:///./eft_sessions.db"

    LOG_LEVEL: str = "INFO"
    LOG_FILE: str = "./logs/eft_ai_server.log"

    HUGGINGFACE_TOKEN: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = Field("gpt-5.2pro", env="OPENAI_MODEL")
    PROPOSAL_LLM_PROVIDER: str = Field("auto", env="PROPOSAL_LLM_PROVIDER")
    PROPOSAL_OPENAI_MODEL: str = Field("gpt-5.2pro", env="PROPOSAL_OPENAI_MODEL")
    PROPOSAL_VLLM_BASE_URL: str = Field("http://127.0.0.1:8001", env="PROPOSAL_VLLM_BASE_URL")
    PROPOSAL_VLLM_MODEL: str = Field(
        "meta-llama/Llama-3.1-8B-Instruct",
        env="PROPOSAL_VLLM_MODEL",
    )
    PROPOSAL_LLM_TIMEOUT_SEC: float = Field(20.0, env="PROPOSAL_LLM_TIMEOUT_SEC")
    YOUTUBE_API_KEY: Optional[str] = Field(default=None, env="YOUTUBE_API_KEY")
    GOOGLE_MAPS_API_KEY: Optional[str] = Field(default=None, env="GOOGLE_MAPS_API_KEY")
    KAKAO_REST_API_KEY: Optional[str] = Field(default=None, env="KAKAO_REST_API_KEY")
    BACKEND_BASE_URL: str = Field("http://localhost:8000", env="BACKEND_BASE_URL")

    QWEN_TTS_API_KEY: Optional[str] = Field(default=None, env="Qwen_TTS_API_KEY")
    QWEN_TTS_BASE_URL: str = Field(
        default="https://dashscope-intl.aliyuncs.com/api/v1",
        env="QWEN_TTS_BASE_URL",
    )
    QWEN_TTS_MODEL: str = Field(default="qwen3-tts-flash", env="QWEN_TTS_MODEL")
    QWEN_TTS_VOICE: str = Field(default="Cherry", env="QWEN_TTS_VOICE")
    QWEN_TTS_LANGUAGE_TYPE: str = Field(
        default="Korean",
        env="QWEN_TTS_LANGUAGE_TYPE",
    )

    API_KEY: Optional[str] = Field(default=None, env="API_KEY")
    PREMIUM_API_KEY: Optional[str] = Field(default=None, env="PREMIUM_API_KEY")

    FREE_AI_BASE_URL: str = Field("http://localhost:8001/v1", env="FREE_AI_BASE_URL")
    PREMIUM_AI_BASE_URL: str = Field("http://localhost:8002/v1", env="PREMIUM_AI_BASE_URL")
    FREE_AI_MODEL: str = Field("meta-llama/Llama-3.1-8B-Instruct", env="FREE_AI_MODEL")
    PREMIUM_AI_MODEL: str = Field("Qwen/Qwen2.5-7B-Instruct", env="PREMIUM_AI_MODEL")

    BATCH_SIZE: int = 1
    MAX_CONCURRENT_REQUESTS: int = 10

    PREMIUM_MODE: str = Field("proxy", env="PREMIUM_MODE")
    VLLM_PREMIUM_ENGINE: str = Field("B", env="VLLM_PREMIUM_ENGINE")

    VLLM_ENGINE_A_URL: str = Field("http://127.0.0.1:8001", env="VLLM_ENGINE_A_URL")
    VLLM_ENGINE_B_URL: str = Field("http://127.0.0.1:8002", env="VLLM_ENGINE_B_URL")

    PREMIUM_REQUEST_TIMEOUT: int = Field(30, env="PREMIUM_REQUEST_TIMEOUT")
    PREMIUM_MAX_RETRIES: int = Field(1, env="PREMIUM_MAX_RETRIES")

    MEMORY_STATS_RECENT_K: int = Field(10, description="Recent memory stats size")
    MEMORY_MAX_TURNS: int = Field(100, description="Max number of memory turns")

    MEMORY_FILE_PATH: str = Field(
        "./data/memory/conversations.jsonl",
        description="Conversation memory path",
    )
    MEMORY_SUMMARY_PATH: str = Field(
        "./data/memory/summaries.json",
        description="Summary memory path",
    )
    REQUEST_TIMEOUT: int = 120

    VLLM_CONNECT_TIMEOUT: float = 10.0
    VLLM_READ_TIMEOUT: float = 120.0
    VLLM_HEALTH_CHECK_TIMEOUT: float = 5.0

    STICKY_SESSION_TTL: int = 3600
    STICKY_SESSIONS: Dict[str, str] = Field(default_factory=dict)

    REDIS_URL: Optional[str] = None
    USE_REDIS_FOR_STICKY: bool = False
    USE_REDIS_FOR_RATE_LIMIT: bool = False

    INTERNAL_NETWORKS: List[str] = Field(default_factory=lambda: ["127.0.0.1", "localhost", "::1"])
    ADMIN_API_KEY: Optional[str] = None

    ENABLE_REQUEST_LOGGING: bool = True
    RESPONSE_CACHE_TTL: int = 3600

    ENABLE_PROMETHEUS: bool = True
    PROMETHEUS_PORT: int = 8001

    SECRET_KEY: Optional[str] = Field(default=None, env="SECRET_KEY")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    JWT_ALG: str = "HS256"

    COOKIE_NAME_ACCESS: str = "access_token"
    COOKIE_NAME_REFRESH: str = "refresh_token"
    COOKIE_SECURE: bool = True
    COOKIE_SAMESITE: str = "none"
    COOKIE_DOMAIN: Optional[str] = None

    FIREBASE_PROJECT_ID: Optional[str] = None
    FIREBASE_CREDENTIALS_JSON: Optional[str] = None

    NOTION_CLIENT_ID: Optional[str] = None
    NOTION_CLIENT_SECRET: Optional[str] = None
    NOTION_REDIRECT_URI: Optional[str] = None
    GOOGLE_REDIRECT_URI: Optional[str] = None
    GOOGLE_REDIRECT_URIS: List[str] = Field(default_factory=list, env="GOOGLE_REDIRECT_URIS")
    NOTION_REDIRECT_URIS: List[str] = Field(default_factory=list, env="NOTION_REDIRECT_URIS")
    NOTION_OAUTH_BASE_URL: str = "https://api.notion.com/v1/oauth"
    NOTION_API_BASE_URL: str = "https://api.notion.com/v1"
    NOTION_API_VERSION: str = "2022-06-28"
    NOTION_USER_DB_NAME: str = "MoodTalk Users"
    BASE_FRONTEND_URL: str = Field("http://localhost:3000", env="BASE_FRONTEND_URL")

    FRONTEND_URL: str = "http://localhost:5173"
    FRONTEND_DASHBOARD_URL: str = "http://localhost:5173/dashboard"
    SOFT_NUDGE_MODE: str = Field("prod", env="SOFT_NUDGE_MODE")
    SOFT_NUDGE_PROD_MIN_SESSION_SECONDS: int = Field(15 * 60, env="SOFT_NUDGE_PROD_MIN_SESSION_SECONDS")
    SOFT_NUDGE_DEMO_MIN_SESSION_SECONDS: int = Field(30, env="SOFT_NUDGE_DEMO_MIN_SESSION_SECONDS")
    SOFT_NUDGE_MOVEMENT_WINDOW_SECONDS: int = Field(180, env="SOFT_NUDGE_MOVEMENT_WINDOW_SECONDS")
    SOFT_NUDGE_COOLDOWN_MINUTES: int = Field(15, env="SOFT_NUDGE_COOLDOWN_MINUTES")
    SOFT_NUDGE_MAX_PER_SESSION: int = Field(1, env="SOFT_NUDGE_MAX_PER_SESSION")
    ENCRYPTION_KEY: Optional[str] = None
    SECURITY_STRICT_MISSION_RUN: bool = Field(False, env="SECURITY_STRICT_MISSION_RUN")

    REMINDER_DEFAULT_TZ: str = Field("Asia/Seoul", env="REMINDER_DEFAULT_TZ")
    REMINDER_IN_PROCESS_ENABLED: bool = Field(True, env="REMINDER_IN_PROCESS_ENABLED")
    REMINDER_TICK_SECONDS: int = Field(60, env="REMINDER_TICK_SECONDS")
    REMINDER_CLAIM_LIMIT: int = Field(100, env="REMINDER_CLAIM_LIMIT")
    REMINDER_LOCK_SECONDS: int = Field(55, env="REMINDER_LOCK_SECONDS")
    REMINDER_MAX_ATTEMPTS: int = Field(3, env="REMINDER_MAX_ATTEMPTS")
    REMINDER_BACKOFF_BASE_SECONDS: int = Field(60, env="REMINDER_BACKOFF_BASE_SECONDS")

    WEBPUSH_VAPID_PUBLIC_KEY: Optional[str] = Field(default=None, env="WEBPUSH_VAPID_PUBLIC_KEY")
    WEBPUSH_VAPID_PRIVATE_KEY: Optional[str] = Field(default=None, env="WEBPUSH_VAPID_PRIVATE_KEY")
    WEBPUSH_VAPID_CLAIMS_SUB: str = Field("mailto:admin@example.com", env="WEBPUSH_VAPID_CLAIMS_SUB")
    ENABLE_FCM_PUSH: bool = Field(True, env="ENABLE_FCM_PUSH")

    @field_validator("PREMIUM_MODE")
    @classmethod
    def _check_premium_mode(cls, value: str) -> str:
        v = (value or "").lower()
        if v not in ALLOWED_PREMIUM_MODE:
            raise ValueError(f"PREMIUM_MODE must be one of {ALLOWED_PREMIUM_MODE}, got: {value}")
        return v

    @field_validator("MODULE_MODE")
    @classmethod
    def _check_module_mode(cls, value: str) -> str:
        v = (value or "lite").lower()
        if v not in ALLOWED_MODULE_MODE:
            raise ValueError(f"MODULE_MODE must be one of {ALLOWED_MODULE_MODE}, got: {value}")
        return v

    @field_validator("VLLM_PREMIUM_ENGINE")
    @classmethod
    def _check_engine(cls, value: str) -> str:
        v = (value or "").upper()
        if v not in ALLOWED_ENGINE:
            raise ValueError(f"VLLM_PREMIUM_ENGINE must be one of {ALLOWED_ENGINE}, got: {value}")
        return v

    @field_validator("PROPOSAL_LLM_PROVIDER")
    @classmethod
    def _check_proposal_llm_provider(cls, value: str) -> str:
        v = (value or "auto").lower()
        if v not in ALLOWED_PROPOSAL_LLM_PROVIDER:
            raise ValueError(
                f"PROPOSAL_LLM_PROVIDER must be one of {ALLOWED_PROPOSAL_LLM_PROVIDER}, got: {value}"
            )
        return v

    @field_validator("SOFT_NUDGE_MODE")
    @classmethod
    def _check_soft_nudge_mode(cls, value: str) -> str:
        v = (value or "prod").lower()
        if v not in ALLOWED_SOFT_NUDGE_MODE:
            raise ValueError(f"SOFT_NUDGE_MODE must be one of {ALLOWED_SOFT_NUDGE_MODE}, got: {value}")
        return v

    @field_validator("VLLM_ENGINE_A_URL", "VLLM_ENGINE_B_URL")
    @classmethod
    def _strip_trailing_slash(cls, value: str) -> str:
        return (value or "").rstrip("/")

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def _coerce_allowed_origins(cls, value: object) -> list[str]:
        return _coerce_list_env(value)

    @field_validator("GOOGLE_REDIRECT_URIS", "NOTION_REDIRECT_URIS", mode="before")
    @classmethod
    def _coerce_redirect_uri_lists(cls, value: object) -> list[str]:
        return _coerce_list_env(value)

    @field_validator("COOKIE_SECURE", mode="after")
    @classmethod
    def _normalize_cookie_secure(cls, value: bool, info: ValidationInfo) -> bool:
        """
        Development 환경에서는 기본적으로 Secure 쿠키를 비활성화해
        http://localhost 테스트에서 로그인 쿠키가 소실되는 문제를 방지한다.
        """
        if "COOKIE_SECURE" in os.environ:
            return value

        if info.data.get("DEBUG", False):
            return False
        return value


    @field_validator("COOKIE_SAMESITE", mode="after")
    @classmethod
    def _normalize_cookie_samesite(cls, value: str, info: ValidationInfo) -> str:
        normalized = (value or "none").strip().lower()
        if normalized not in {"strict", "lax", "none"}:
            normalized = "none"
        if normalized == "none" and not bool(info.data.get("COOKIE_SECURE", False)):
            return "lax"
        return normalized


_settings: Optional[Settings] = None


def get_settings() -> Settings:
    """Return singleton settings with late dotenv recovery for SECRET_KEY."""
    global _settings
    if _settings is None:
        _settings = Settings()
    else:
        secret_in_env = (os.getenv("SECRET_KEY") or "").strip()
        if not ((_settings.SECRET_KEY or "").strip()) and secret_in_env:
            _settings = Settings()
    return _settings


def get_development_settings() -> Settings:
    settings = get_settings()
    settings.DEBUG = True
    settings.LOG_LEVEL = "DEBUG"
    settings.MODEL_NAME = "meta-llama/Llama-3.1-8B-Instruct"
    settings.LOAD_IN_4BIT = False
    return settings


def get_production_settings() -> Settings:
    settings = get_settings()
    settings.DEBUG = False
    settings.LOG_LEVEL = "WARNING"
    settings.MODEL_NAME = "meta-llama/Llama-3.1-8B-Instruct"
    settings.LOAD_IN_4BIT = False
    settings.ENABLE_PROMETHEUS = True
    return settings


MODEL_PRESETS: Dict[str, Dict[str, object]] = {
    "llama2-7b-quick": {
        "model_name": "meta-llama/Llama-2-7b-chat-hf",
        "load_in_4bit": True,
        "max_memory": "6GiB",
    },
    "llama3-8b-optimal": {
        "model_name": "meta-llama/Llama-3.1-8B-Instruct",
        "load_in_4bit": False,
        "max_memory": "12GiB",
    },
    "llama3-70b-premium": {
        "model_name": "meta-llama/Llama-3.1-70B-Instruct",
        "load_in_4bit": True,
        "max_memory": "40GiB",
    },
}


def apply_model_preset(preset_name: str) -> Settings:
    settings = get_settings()
    if preset_name not in MODEL_PRESETS:
        raise ValueError(f"Unknown model preset: {preset_name}")

    preset = MODEL_PRESETS[preset_name]
    settings.MODEL_NAME = str(preset["model_name"])
    settings.LOAD_IN_4BIT = bool(preset["load_in_4bit"])
    settings.MAX_MEMORY = str(preset["max_memory"])
    return settings
