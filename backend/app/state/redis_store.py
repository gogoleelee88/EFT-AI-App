from __future__ import annotations

import hashlib
import json
import os
import time
from typing import Any, Dict, Optional

import redis

from utils.logger import get_logger

logger = get_logger(__name__)

SESSION_TTL_SECONDS = int(os.getenv("CHAT_HUB_SESSION_TTL", "86400"))
RAG_CACHE_TTL_SECONDS = int(os.getenv("CHAT_HUB_RAG_CACHE_TTL", "900"))
TOOL_DEDUP_TTL_SECONDS = int(os.getenv("CHAT_HUB_TOOL_DEDUP_TTL", "90"))

_redis_client: Optional[redis.Redis] = None
_mem_sessions: Dict[str, Dict[str, Any]] = {}
_mem_rag_cache: Dict[str, Dict[str, Any]] = {}
_mem_tool_locks: Dict[str, float] = {}


def _now() -> float:
    return time.time()


def _purge_expired_memory() -> None:
    now = _now()

    expired_rag = [k for k, v in _mem_rag_cache.items() if v.get("expire_at", 0) <= now]
    for key in expired_rag:
        _mem_rag_cache.pop(key, None)

    expired_tools = [k for k, expire_at in _mem_tool_locks.items() if expire_at <= now]
    for key in expired_tools:
        _mem_tool_locks.pop(key, None)


def _get_redis() -> Optional[redis.Redis]:
    global _redis_client
    if _redis_client is not None:
        return _redis_client

    redis_url = (os.getenv("REDIS_URL") or "").strip()
    if not redis_url:
        return None

    try:
        client = redis.from_url(redis_url, decode_responses=True)
        client.ping()
        _redis_client = client
        return _redis_client
    except Exception as exc:
        logger.warning("chat_hub: redis unavailable, using in-memory fallback: %s", exc)
        _redis_client = None
        return None


def _session_key(session_id: str) -> str:
    return f"session:{session_id}"


def _rag_key(user_id: str, query: str) -> str:
    digest = hashlib.sha256((query or "").encode("utf-8")).hexdigest()[:24]
    safe_user_id = (user_id or "anonymous").strip() or "anonymous"
    return f"cache:rag:{safe_user_id}:{digest}"


def _tool_lock_key(session_id: str, tool_name: str, args: Dict[str, Any]) -> str:
    normalized_args = json.dumps(args or {}, ensure_ascii=False, sort_keys=True)
    sig = hashlib.sha256(f"{session_id}:{tool_name}:{normalized_args}".encode("utf-8")).hexdigest()[:24]
    return f"session:{session_id}:tool:{sig}"


def default_session_state(session_id: str, user_id: Optional[str]) -> Dict[str, Any]:
    return {
        "session_id": session_id,
        "user_id": user_id,
        "mode": "omni",
        "history": [],
        "history_summary": "",
        "last_tool": None,
        "privacy": {"pii_masked": True},
        "recent_tools": [],
        "updated_at": int(_now()),
    }


def load_session_state(session_id: str, user_id: Optional[str] = None) -> Dict[str, Any]:
    key = _session_key(session_id)
    client = _get_redis()
    if client:
        try:
            raw = client.get(key)
            if raw:
                state = json.loads(raw)
                if user_id and not state.get("user_id"):
                    state["user_id"] = user_id
                return state
        except Exception as exc:
            logger.warning("chat_hub: failed loading session from redis: %s", exc)

    _purge_expired_memory()
    state = _mem_sessions.get(key)
    if state:
        if user_id and not state.get("user_id"):
            state["user_id"] = user_id
        return state

    state = default_session_state(session_id, user_id)
    _mem_sessions[key] = state
    return state


def save_session_state(session_id: str, state: Dict[str, Any]) -> None:
    key = _session_key(session_id)
    state = dict(state or {})
    state["updated_at"] = int(_now())

    client = _get_redis()
    if client:
        try:
            client.set(key, json.dumps(state, ensure_ascii=False), ex=SESSION_TTL_SECONDS)
            return
        except Exception as exc:
            logger.warning("chat_hub: failed saving session to redis: %s", exc)

    _mem_sessions[key] = state


def get_rag_cache(user_id: str, query: str) -> Optional[Any]:
    key = _rag_key(user_id, query)
    client = _get_redis()
    if client:
        try:
            raw = client.get(key)
            if raw:
                return json.loads(raw)
        except Exception as exc:
            logger.warning("chat_hub: failed loading rag cache from redis: %s", exc)

    _purge_expired_memory()
    cached = _mem_rag_cache.get(key)
    if cached and cached.get("expire_at", 0) > _now():
        return cached.get("value")
    return None


def set_rag_cache(user_id: str, query: str, value: Any) -> None:
    key = _rag_key(user_id, query)
    payload = json.dumps(value, ensure_ascii=False)
    client = _get_redis()
    if client:
        try:
            client.set(key, payload, ex=RAG_CACHE_TTL_SECONDS)
            return
        except Exception as exc:
            logger.warning("chat_hub: failed saving rag cache to redis: %s", exc)

    _mem_rag_cache[key] = {"value": value, "expire_at": _now() + RAG_CACHE_TTL_SECONDS}


def acquire_tool_idempotency(session_id: str, tool_name: str, args: Dict[str, Any]) -> bool:
    key = _tool_lock_key(session_id, tool_name, args)
    client = _get_redis()
    if client:
        try:
            created = client.set(key, "1", ex=TOOL_DEDUP_TTL_SECONDS, nx=True)
            return bool(created)
        except Exception as exc:
            logger.warning("chat_hub: tool idempotency redis error: %s", exc)

    _purge_expired_memory()
    expire_at = _mem_tool_locks.get(key)
    now = _now()
    if expire_at and expire_at > now:
        return False
    _mem_tool_locks[key] = now + TOOL_DEDUP_TTL_SECONDS
    return True


