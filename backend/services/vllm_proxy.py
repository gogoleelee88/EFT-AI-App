"""
vLLM GPU 서버 프록시 클라이언트
Engine A/B 병렬 요청 처리
"""

import httpx
import asyncio
import time
from typing import Dict, Any, Optional
from fastapi import HTTPException, Request
from backend.config.settings import get_settings
from backend.utils.logger import get_logger
from backend.services.circuit_breaker import get_circuit_breaker, retry_with_exponential_backoff

import os  # ← 추가

def _normalize_api_base(url: str) -> str:
    u = (url or "").strip().rstrip("/")
    # 완전 엔드포인트를 준 경우: .../v1/chat/completions  →  .../v1 로 절삭
    if u.endswith("/v1/chat/completions"):
        return u[:-len("/chat/completions")]
    # /v1 까지만 있으면 그대로 사용
    if u.endswith("/v1"):
        return u
    # host:port나 베이스만 준 경우엔 /v1 붙여서 OpenAI 호환 베이스로
    return u + "/v1"


logger = get_logger(__name__)
settings = get_settings()

class VLLMProxy:
    """GPU 서버의 vLLM 엔진 A/B에 대한 프록시 클라이언트"""

    def __init__(self):
        # GPU 서버 URL 설정 (환경변수로 오버라이드 가능)
        # 권장: VLLM_ENGINE_A_BASE / VLLM_ENGINE_B_BASE 를 .env에서 주입
        self.engine_a_url = getattr(settings, "VLLM_ENGINE_A_BASE", None) or settings.FREE_AI_BASE_URL
        self.engine_b_url = getattr(settings, "VLLM_ENGINE_B_BASE", None) or settings.PREMIUM_AI_BASE_URL

        # HTTP 클라이언트 설정
        self.timeout = httpx.Timeout(
            connect=settings.VLLM_CONNECT_TIMEOUT,
            read=settings.VLLM_READ_TIMEOUT,
            write=30.0,  # 추가
            pool=30.0    # 추가
        )

        # 회로차단기 초기화
        self.circuit_breaker_a = get_circuit_breaker(
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

        # 헬스체크용 회로차단기 (짧은 타임아웃)
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

        logger.info(f"vLLM 프록시 초기화 (회로차단기 포함) - Engine A: {self.engine_a_url}, Engine B: {self.engine_b_url}")

    async def health_check_engines(self, request: Optional[Request] = None) -> Dict[str, Any]:
        """Engine A/B 헬스체크"""
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            results = {}

            # 공용 핑 함수 (회로차단기 + 짧은 재시도)
            async def ping_with_circuit_breaker(base: str, cb):
                async def _do_ping():
                    async def _raw_ping():
                        t0 = time.perf_counter()
                        r = await client.get(f"{base}/models", timeout=5.0)  # 헬스체크는 짧게
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
                    logger.warning(f"헬스체크 실패 {base}: {e}")
                    return {
                        "status": "unhealthy",
                        "url": base,
                        "error": str(e),
                        "circuit_breaker_state": cb.state
                    }

            # 병렬 헬스체크 (회로차단기 적용)
            results["engine_a"], results["engine_b"] = await asyncio.gather(
                ping_with_circuit_breaker(self.engine_a_url, self.health_cb_a),
                ping_with_circuit_breaker(self.engine_b_url, self.health_cb_b)
            )

            overall = "healthy" if all(r.get("status") == "healthy" for r in results.values()) else "degraded"
            return {"overall_status": overall, "upstreams": results}

    async def chat_ab_parallel(self, payload: Dict[str, Any], request: Optional[Request] = None) -> Dict[str, Any]:
        """Engine A/B 병렬 채팅 요청"""
        payload_a = {**payload, "model": "engine-a"}
        payload_b = {**payload, "model": "engine-b"}

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                # 개별 POST 계측 (회로차단기 + 재시도)
                async def post_with_circuit_breaker(url, body, cb):
                    async def _do_post():
                        async def _raw_post():
                            t0 = time.perf_counter()
                            r = await client.post(url, json=body)
                            dt = (time.perf_counter() - t0) * 1000
                            r.raise_for_status()  # HTTP 오류 시 예외 발생
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
                    # 회로차단기나 네트워크 오류 시 적절한 HTTP 오류로 매핑
                    if "circuit breaker" in str(e).lower() or "회로차단기" in str(e):
                        raise HTTPException(status_code=503, detail=f"Service temporarily unavailable: {e}")
                    else:
                        raise HTTPException(status_code=502, detail=f"Upstream error: {e}")
                total_ms = (time.perf_counter() - t_start) * 1000

                def build_side(resp, ms, model_label, model_id):
                    # 회로차단기를 통과했으므로 성공 케이스
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
                        # HTTP 오류 (회로차단기를 통과했지만 응답 오류)
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

                # faster 결정
                if a["success"] and b["success"]:
                    faster = "llama3" if a["processing_time"] < b["processing_time"] else "qwen25"
                elif a["success"]:
                    faster = "llama3"
                elif b["success"]:
                    faster = "qwen25"
                else:
                    faster = "none"

                result = {
                    "llama3_response": a,
                    "qwen25_response": b,
                    "faster_model": faster,
                    "comparison_time": total_ms,
                    "timestamp": time.time()
                }
                logger.info(f"A/B 완료: total={total_ms:.1f}ms a={a_ms:.1f}ms b={b_ms:.1f}ms faster={faster}")
                return result

            except httpx.TimeoutException as e:
                logger.error(f"A/B timeout: {e}")
                raise HTTPException(status_code=504, detail=f"Engine A/B timeout: {str(e)}")
            except Exception as e:
                logger.error(f"A/B failure: {e}")
                raise HTTPException(status_code=502, detail=f"Engine A/B connection failed: {str(e)}")

    async def chat_single_engine(self, engine: str, payload: Dict[str, Any], request: Optional[Request] = None) -> Dict[str, Any]:
        """단일 엔진 채팅 요청 (회로차단기 + 재시도)"""

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
                    response.raise_for_status()  # HTTP 오류 시 예외 발생

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
                logger.error(f"Engine {engine} 요청 실패 (회로차단기 포함): {e}")
                if "회로차단기" in str(e) or "circuit breaker" in str(e).lower():
                    raise HTTPException(status_code=503, detail=f"Engine {engine} temporarily unavailable: {e}")
                elif "timeout" in str(e).lower():
                    raise HTTPException(status_code=504, detail=f"Engine {engine} timeout: {e}")
                else:
                    raise HTTPException(status_code=502, detail=f"Engine {engine} connection failed: {e}")

# 싱글톤 인스턴스
_vllm_proxy = None

def get_vllm_proxy() -> VLLMProxy:
    """vLLM 프록시 인스턴스 반환"""
    global _vllm_proxy
    if _vllm_proxy is None:
        _vllm_proxy = VLLMProxy()
    return _vllm_proxy
