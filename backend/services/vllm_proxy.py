"""
vLLM GPU ?ë² ?ë¡???´ë¼?´ì¸??Engine A/B ë³ë¬ ?ì² ì²ë¦¬
"""

import httpx
import asyncio
import time
from typing import Dict, Any, Optional
from fastapi import HTTPException, Request
from config.settings import get_settings
from utils.logger import get_logger
from services.circuit_breaker import get_circuit_breaker, retry_with_exponential_backoff
from utils.action_builder import build_actions

import os  # ??ì¶ê?

def _normalize_api_base(url: str) -> str:
    u = (url or "").strip().rstrip("/")
    # ?ì ?ë?¬ì¸?¸ë? ì¤ ê²½ì°: .../v1/chat/completions  ?? .../v1 ë¡??ì
    if u.endswith("/v1/chat/completions"):
        return u[:-len("/chat/completions")]
    # /v1 ê¹ì?ë§??ì¼ë©?ê·¸ë?ë¡??¬ì©
    if u.endswith("/v1"):
        return u
    # host:port??ë²ì´?¤ë§ ì¤ ê²½ì°??/v1 ë¶ì¬??OpenAI ?¸í ë²ì´?¤ë¡
    return u + "/v1"


logger = get_logger(__name__)
settings = get_settings()

class VLLMProxy:
    """GPU ?ë²??vLLM ?ì§ A/B??????ë¡???´ë¼?´ì¸??""

    def __init__(self):
        # GPU ?ë² URL ?¤ì (?ê²½ë³?ë¡ ?¤ë²?¼ì´??ê°??
        # ê¶ì¥: VLLM_ENGINE_A_BASE / VLLM_ENGINE_B_BASE ë¥?.env?ì ì£¼ì
        self.engine_a_url = getattr(settings, "VLLM_ENGINE_A_BASE", None) or settings.FREE_AI_BASE_URL
        self.engine_b_url = getattr(settings, "VLLM_ENGINE_B_BASE", None) or settings.PREMIUM_AI_BASE_URL

        # HTTP ?´ë¼?´ì¸???¤ì
        self.timeout = httpx.Timeout(
            connect=settings.VLLM_CONNECT_TIMEOUT,
            read=settings.VLLM_READ_TIMEOUT,
            write=30.0,  # ì¶ê?
            pool=30.0    # ì¶ê?
        )

        # ?ë¡ì°¨ë¨ê¸?ì´ê¸°??        self.circuit_breaker_a = get_circuit_breaker(
            "engine_a",
            failure_threshold=5,
            recovery_timeout=60,
            half_open_max_probes=10,
            half_open_successes_needed=3
        )
        self.circuit_breaker_b = get_circuit_breaker(
            "engine_b",
            failure_threshold=5,
            recovery_timeout=60,
            half_open_max_probes=10,
            half_open_successes_needed=3
        )

        # ?¬ì¤ì²´í¬???ë¡ì°¨ë¨ê¸?(ì§§ì? ??ì??
        self.health_cb_a = get_circuit_breaker(
            "health_engine_a",
            failure_threshold=3,
            recovery_timeout=30,
            half_open_max_probes=5,
            half_open_successes_needed=2
        )
        self.health_cb_b = get_circuit_breaker(
            "health_engine_b",
            failure_threshold=3,
            recovery_timeout=30,
            half_open_max_probes=5,
            half_open_successes_needed=2
        )

        logger.info(f"vLLM ?ë¡??ì´ê¸°??(?ë¡ì°¨ë¨ê¸??¬í¨) - Engine A: {self.engine_a_url}, Engine B: {self.engine_b_url}")

    async def health_check_engines(self, request: Optional[Request] = None) -> Dict[str, Any]:
        """Engine A/B ?¬ì¤ì²´í¬"""
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            results = {}

            # ê³µì© ???¨ì (?ë¡ì°¨ë¨ê¸?+ ì§§ì? ?¬ì??
            async def ping_with_circuit_breaker(base: str, cb):
                async def _do_ping():
                    async def _raw_ping():
                        t0 = time.perf_counter()
                        r = await client.get(f"{base}/models", timeout=5.0)  # ?¬ì¤ì²´í¬??ì§§ê²
                        r.raise_for_status()
                        dt = (time.perf_counter() - t0) * 1000
                        return {
                            "status": "healthy",
                            "url": base,
                            "models": r.json(),
                            "latency_ms": round(dt, 2),
                            "http_status": r.status_code,
                            "circuit_breaker_state": cb.state
                        }
                    return await retry_with_exponential_backoff(
                        _raw_ping, max_retries=1, base_delay=0.2, max_delay=1.0
                    )

                try:
                    return await cb.call(_do_ping)
                except Exception as e:
                    logger.warning(f"?¬ì¤ì²´í¬ ?¤í¨ {base}: {e}")
                    return {
                        "status": "unhealthy",
                        "url": base,
                        "error": str(e),
                        "circuit_breaker_state": cb.state
                    }

            # ë³ë¬ ?¬ì¤ì²´í¬ (?ë¡ì°¨ë¨ê¸??ì©)
            results["engine_a"], results["engine_b"] = await asyncio.gather(
                ping_with_circuit_breaker(self.engine_a_url, self.health_cb_a),
                ping_with_circuit_breaker(self.engine_b_url, self.health_cb_b)
            )

            overall = "healthy" if all(r.get("status") == "healthy" for r in results.values()) else "degraded"
            return {"overall_status": overall, "upstreams": results}

    async def chat_ab_parallel(self, payload: Dict[str, Any], request: Optional[Request] = None) -> Dict[str, Any]:
        """Engine A/B ë³ë¬ ì±í ?ì²"""
        payload_a = {**payload, "model": "engine-a"}
        payload_b = {**payload, "model": "engine-b"}

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                # ê°ë³ POST ê³ì¸¡ (?ë¡ì°¨ë¨ê¸?+ ?¬ì??
                async def post_with_circuit_breaker(url, body, cb):
                    async def _do_post():
                        async def _raw_post():
                            t0 = time.perf_counter()
                            r = await client.post(url, json=body)
                            dt = (time.perf_counter() - t0) * 1000
                            r.raise_for_status()  # HTTP ?¤ë¥ ???ì¸ ë°ì
                            return r, dt
                        return await retry_with_exponential_backoff(
                            _raw_post, max_retries=2, base_delay=0.25, max_delay=2.0
                        )
                    return await cb.call(_do_post)

                t_start = time.perf_counter()
                try:
                    (resp_a, a_ms), (resp_b, b_ms) = await asyncio.gather(
                        post_with_circuit_breaker(f"{self.engine_a_url}/chat/completions", payload_a, self.circuit_breaker_a),
                        post_with_circuit_breaker(f"{self.engine_b_url}/chat/completions", payload_b, self.circuit_breaker_b),
                    )
                except Exception as e:
                    # ?ë¡ì°¨ë¨ê¸°ë ?¤í¸?í¬ ?¤ë¥ ???ì??HTTP ?¤ë¥ë¡?ë§¤í
                    if "circuit breaker" in str(e).lower() or "?ë¡ì°¨ë¨ê¸? in str(e):
                        raise HTTPException(status_code=503, detail=f"Service temporarily unavailable: {e}")
                    else:
                        raise HTTPException(status_code=502, detail=f"Upstream error: {e}")
                total_ms = (time.perf_counter() - t_start) * 1000

                def build_side(resp, ms, model_label, model_id):
                    # ?ë¡ì°¨ë¨ê¸°ë? ?µê³¼?ì¼ë¯ë¡??±ê³µ ì¼?´ì¤
                    if resp.status_code == 200:
                        data = resp.json()
                        return {
                            "model": model_id,
                            "response": data.get("choices", [{}])[0].get("message", {}).get("content", ""),
                            "processing_time": ms,
                            "success": True,
                            "choices": data.get("choices", []),
                            "usage": data.get("usage"),
                            "http_status": resp.status_code,
                            "label": model_label,
                            "circuit_breaker_used": True
                        }
                    else:
                        # HTTP ?¤ë¥ (?ë¡ì°¨ë¨ê¸°ë? ?µê³¼?ì?ë§??ëµ ?¤ë¥)
                        try:
                            err = resp.json()
                        except Exception:
                            err = {"text": resp.text}
                        return {
                            "model": model_id,
                            "response": "",
                            "processing_time": ms,
                            "success": False,
                            "error": err,
                            "http_status": resp.status_code,
                            "label": model_label,
                            "circuit_breaker_used": True
                        }

                a = build_side(resp_a, a_ms, "llama3", "meta-llama/Meta-Llama-3-8B-Instruct")
                b = build_side(resp_b, b_ms, "qwen25", "Qwen/Qwen2.5-7B-Instruct")

                # faster ê²°ì
                if a["success"] and b["success"]:
                    faster = "llama3" if a["processing_time"] < b["processing_time"] else "qwen25"
                elif a["success"]:
                    faster = "llama3"
                elif b["success"]:
                    faster = "qwen25"
                else:
                    faster = "none"

                # ë©ìì§ ì¶ì¶ (payload?ì)
                user_message = ""
                if "messages" in payload and isinstance(payload["messages"], list) and len(payload["messages"]) > 0:
                    last_msg = payload["messages"][-1]
                    if isinstance(last_msg, dict) and "content" in last_msg:
                        user_message = last_msg["content"]

                # ê°ë¨??ê°ì ë¶ì (?¤ì??ê¸°ë°)
                metadata = {}
                if user_message:
                    emotion_keywords = {
                        "ë¶ì": ["ë¶ì", "ê±±ì", "?ë¤", "ë¬´ì"],
                        "?¤í¸?ì¤": ["?¤í¸?ì¤", "?ë¤", "ì§ì³?, "?¼ê³¤"],
                        "?¸ë¡?": ["?¸ë¡", "?¸ì¸", "?¼ì"],
                        "?¬í": ["?¬í", "?°ì¸", "?ë¬¼"]
                    }

                    detected_emotion = "ì¤ë¦½"
                    intensity = 0.3

                    msg_lower = user_message.lower()
                    for emotion, keywords in emotion_keywords.items():
                        if any(kw in msg_lower for kw in keywords):
                            detected_emotion = emotion
                            intensity = 0.6
                            break

                    metadata["emotion_analysis"] = {
                        "primary_emotion": detected_emotion,
                        "intensity": intensity
                    }

                # ?¡ì ?ì±
                actions = build_actions(user_message, metadata) if user_message else []

                result = {
                    "llama3_response": a,
                    "qwen25_response": b,
                    "faster_model": faster,
                    "comparison_time": total_ms,
                    "timestamp": time.time(),
                    "actions": actions  # ?¡ì ì¶ê?!
                }
                logger.info(f"A/B ?ë£: total={total_ms:.1f}ms a={a_ms:.1f}ms b={b_ms:.1f}ms faster={faster} actions={len(actions)}")
                return result

            except httpx.TimeoutException as e:
                logger.error(f"A/B timeout: {e}")
                raise HTTPException(status_code=504, detail=f"Engine A/B timeout: {str(e)}")
            except Exception as e:
                logger.error(f"A/B failure: {e}")
                raise HTTPException(status_code=502, detail=f"Engine A/B connection failed: {str(e)}")

    async def chat_single_engine(self, engine: str, payload: Dict[str, Any], request: Optional[Request] = None) -> Dict[str, Any]:
        """?¨ì¼ ?ì§ ì±í ?ì² (?ë¡ì°¨ë¨ê¸?+ ?¬ì??"""

        if engine == "engine_a":
            url = f"{self.engine_a_url}/chat/completions"
            model_name = "engine-a"
            cb = self.circuit_breaker_a
        elif engine == "engine_b":
            url = f"{self.engine_b_url}/chat/completions"
            model_name = "engine-b"
            cb = self.circuit_breaker_b
        else:
            raise HTTPException(status_code=400, detail=f"Unknown engine: {engine}")

        payload_with_model = {**payload, "model": model_name}

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async def _do_single_post():
                async def _raw_single_post():
                    t0 = time.perf_counter()
                    response = await client.post(url, json=payload_with_model)
                    processing_time = (time.perf_counter() - t0) * 1000
                    response.raise_for_status()  # HTTP ?¤ë¥ ???ì¸ ë°ì

                    result = response.json()
                    result["processing_time"] = processing_time
                    result["engine_used"] = engine
                    result["circuit_breaker_state"] = cb.state
                    return result

                return await retry_with_exponential_backoff(
                    _raw_single_post, max_retries=2, base_delay=0.25, max_delay=2.0
                )

            try:
                return await cb.call(_do_single_post)
            except Exception as e:
                logger.error(f"Engine {engine} ?ì² ?¤í¨ (?ë¡ì°¨ë¨ê¸??¬í¨): {e}")
                if "?ë¡ì°¨ë¨ê¸? in str(e) or "circuit breaker" in str(e).lower():
                    raise HTTPException(status_code=503, detail=f"Engine {engine} temporarily unavailable: {e}")
                elif "timeout" in str(e).lower():
                    raise HTTPException(status_code=504, detail=f"Engine {engine} timeout: {e}")
                else:
                    raise HTTPException(status_code=502, detail=f"Engine {engine} connection failed: {e}")

# ?±ê????¸ì¤?´ì¤
_vllm_proxy = None

def get_vllm_proxy() -> VLLMProxy:
    """vLLM ?ë¡???¸ì¤?´ì¤ ë°í"""
    global _vllm_proxy
    if _vllm_proxy is None:
        _vllm_proxy = VLLMProxy()
    return _vllm_proxy

