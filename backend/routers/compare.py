import asyncio
import logging
import os
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from backend.config.settings import get_settings
from backend.models.action_tokens import TokenParser, TokenProcessor
from backend.services.emotion_analyzer import get_emotion_analyzer
from backend.services.prompt_manager import EFTPromptManager
from backend.utils.action_builder import NEGATIVE_EMOTIONS, build_actions
from backend.utils.action_contract import normalize_start_eftar
from backend.utils.action_guard import guard_actions
from backend.utils.suds_helpers import _maybe_emit_ask_suds, is_suds_numeric_response
from backend.utils.text_norm import normalize_text

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["compare"])

settings = get_settings()
prompt_manager = EFTPromptManager()


def _normalize_api_base(url: str) -> str:
    u = (url or "").strip().rstrip("/")
    if u.endswith("/v1/chat/completions"):
        return u[:-len("/chat/completions")]
    if u.endswith("/v1"):
        return u
    return u + "/v1"


ENGINE_A_BASE = _normalize_api_base(settings.VLLM_ENGINE_A_URL)
ENGINE_B_BASE = _normalize_api_base(settings.VLLM_ENGINE_B_URL)
ENGINE_A_URL = f"{ENGINE_A_BASE}/chat/completions"
ENGINE_B_URL = f"{ENGINE_B_BASE}/chat/completions"
ENGINE_A_MODEL = os.getenv("ENGINE_A_MODEL", "engine-a")
ENGINE_B_MODEL = os.getenv("ENGINE_B_MODEL", "engine-b")
ENGINE_CONTENT_TYPE = os.getenv("ENGINE_CONTENT_TYPE", "application/json;charset=utf-8")
ENGINE_HTTP_TIMEOUT = float(os.getenv("ENGINE_HTTP_TIMEOUT", "30"))


class CompareRequest(BaseModel):
    message: str
    temperature: Optional[float] = 0.7
    top_p: Optional[float] = 0.9
    max_tokens: Optional[int] = 512
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    turn_count: Optional[int] = 0  # Slice 1 시스템: 턴 수 추적


def _chat_payload(model: str, req: CompareRequest, system_prompt: str) -> Dict[str, Any]:
    """vLLM 엔진 요청 페이로드 생성 (시스템 프롬프트 포함)"""
    return {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": req.message}
        ],
        "temperature": req.temperature,
        "top_p": req.top_p,
        "max_tokens": req.max_tokens,
        "stream": False,
    }


def _looks_negative(message: str) -> bool:
    msg = normalize_text(message)
    return any(k in msg for k in NEGATIVE_EMOTIONS)


def _build_suggest_eft(*, detected_by: str) -> Dict[str, Any]:
    return {
        "type": "suggest_eft",
        "payload": {
            "reason": "negative_emotion_detected",
            "technique": "tapping_points",
            "detected_by": detected_by,
        },
    }


def _build_banner_ask_suds(*, detected_by: str) -> Dict[str, Any]:
    return {
        "type": "ask_suds",
        "payload": {
            "measurement_type": "check",
            "detected_by": detected_by,
            "ui": "banner",
            "title": "지금 느낌을 0~10으로 평가해 볼까요?",
            "message": "0은 전혀 불편하지 않음, 10은 가장 심함을 뜻해요.",
            "ctaLabel": "지금 평가하기",
            "scale_min": 0,
            "scale_max": 10,
        },
    }


def _final_fallback_build(message: str) -> List[Dict[str, Any]]:
    if is_suds_numeric_response(message):
        return []
    if not _looks_negative(message):
        return []
    return [
        _build_suggest_eft(detected_by="final_fallback"),
        _build_banner_ask_suds(detected_by="final_fallback"),
    ]


@router.post("/compare")
async def compare(req: CompareRequest, response: Response, request: Request) -> Dict[str, Any]:
    headers = {"Content-Type": ENGINE_CONTENT_TYPE}

    started_at = time.perf_counter()

    # 🎯 Step 1: 감정 분석 먼저 수행 (프롬프트 생성용)
    try:
        analyzer = get_emotion_analyzer()
        emotion_analysis = await analyzer.analyze(req.message)
        logger.info(
            "[COMPARE] 감정 분석 완료: %s (강도: %.2f, 신뢰도: %.2f)",
            emotion_analysis.primary_emotion,
            emotion_analysis.intensity,
            emotion_analysis.confidence,
        )
    except Exception as e:
        emotion_analysis = None
        logger.warning("[COMPARE] 감정 분석 실패: %r", e)

    # 🎯 Step 2: 시스템 프롬프트 생성 (조언 3 반영: 예외 처리 강화)
    try:
        if emotion_analysis:
            system_prompt = prompt_manager.build_eft_prompt(
                user_message=req.message,
                emotion_state=emotion_analysis,
                conversation_history=[],  # TODO: 세션 관리 시 히스토리 전달
                user_profile=None,
                tier="free"
            )
            logger.info("[COMPARE] 시스템 프롬프트 생성 완료 (감정 기반)")
            logger.info("[COMPARE] 프롬프트 내용 (처음 300자): %s...", system_prompt[:300])
        else:
            # 감정 분석 실패 시 기본 프롬프트 사용 (폴백)
            system_prompt = prompt_manager.base_system_prompt
            logger.info("[COMPARE] 기본 시스템 프롬프트 사용 (감정 분석 실패)")
            logger.info("[COMPARE] 프롬프트 내용 (처음 300자): %s...", system_prompt[:300])
    except Exception as e:
        # 프롬프트 생성 실패 시에도 기본 프롬프트로 폴백
        logger.error("[COMPARE] 프롬프트 생성 실패, 기본 프롬프트 사용: %r", e)
        system_prompt = prompt_manager.base_system_prompt

    # 🎯 Step 3: Engine A/B 병렬 호출 (시스템 프롬프트 포함)
    async with httpx.AsyncClient() as client:
        try:
            res_a, res_b = await asyncio.gather(
                client.post(
                    ENGINE_A_URL,
                    json=_chat_payload(ENGINE_A_MODEL, req, system_prompt),
                    headers=headers,
                    timeout=ENGINE_HTTP_TIMEOUT,
                ),
                client.post(
                    ENGINE_B_URL,
                    json=_chat_payload(ENGINE_B_MODEL, req, system_prompt),
                    headers=headers,
                    timeout=ENGINE_HTTP_TIMEOUT,
                ),
                return_exceptions=True,
            )

            if isinstance(res_a, Exception):
                logger.warning("Engine A 연결 실패: %r", res_a)
                data_a = {
                    "choices": [
                        {
                            "message": {
                                "content": f"안녕하세요. {req.message}에 대해 스트레스가 많으시군요. 깊은 호흡을 한번 해보시는 게 어떨까요?"
                            }
                        }
                    ]
                }
                from datetime import timedelta

                res_a = type(
                    "MockResponse",
                    (),
                    {
                        "status_code": 200,
                        "elapsed": timedelta(seconds=0.1),
                        "json": lambda: data_a,
                    },
                )()
            else:
                data_a = res_a.json() if res_a.status_code == 200 else {"error": f"HTTP {res_a.status_code}"}

            if isinstance(res_b, Exception):
                logger.warning("Engine B 연결 실패: %r", res_b)
                data_b = {
                    "choices": [
                        {
                            "message": {
                                "content": f"힘드시겠어요. {req.message} 상황이 어렵죠. 잠시 휴식을 취하시는 것을 추천드립니다."
                            }
                        }
                    ]
                }
                from datetime import timedelta

                res_b = type(
                    "MockResponse",
                    (),
                    {
                        "status_code": 200,
                        "elapsed": timedelta(seconds=0.15),
                        "json": lambda: data_b,
                    },
                )()
            else:
                data_b = res_b.json() if res_b.status_code == 200 else {"error": f"HTTP {res_b.status_code}"}

            response_a_raw = (
                data_a.get("choices", [{}])[0].get("message", {}).get("content", "")
                if res_a.status_code == 200
                else f"❌ engine_a 연결 실패: {data_a}"
            )
            response_b_raw = (
                data_b.get("choices", [{}])[0].get("message", {}).get("content", "")
                if res_b.status_code == 200
                else f"❌ engine_b 연결 실패: {data_b}"
            )

            response_a_clean = TokenParser.remove_tokens(response_a_raw)
            response_b_clean = TokenParser.remove_tokens(response_b_raw)

            winner_text = ""
            if res_a.status_code == 200 and res_b.status_code == 200:
                t_a = getattr(res_a, "elapsed", None)
                t_b = getattr(res_b, "elapsed", None)
                if t_a is not None and t_b is not None:
                    winner_text = response_a_clean if t_a.total_seconds() <= t_b.total_seconds() else response_b_clean
                    logger.info(
                        "[P11] 두 엔진 모두 성공 - 더 빠른 응답: %s (A: %.3fs, B: %.3fs)",
                        "engine_a" if t_a.total_seconds() <= t_b.total_seconds() else "engine_b",
                        t_a.total_seconds(),
                        t_b.total_seconds(),
                    )
                else:
                    winner_text = response_a_clean
                    logger.info("[P11] elapsed 정보 없음 - engine_a 우선 선택")
            elif res_a.status_code == 200:
                winner_text = response_a_clean
                logger.info("[P11] engine_a만 성공 - winner: engine_a")
            elif res_b.status_code == 200:
                winner_text = response_b_clean
                logger.info("[P11] engine_b만 성공 - winner: engine_b")
            else:
                logger.warning("[P11] 두 엔진 모두 실패 - winner_text 빈 문자열")

            try:
                winner_clean = TokenParser.remove_tokens(winner_text)
            except Exception:
                winner_clean = winner_text or ""

            executed_actions: List[Dict[str, Any]] = []

            # 🎯 감정 분석 결과는 함수 시작 부분에서 이미 수행됨 (line 123-134)
            # 여기서는 기존 emotion_analysis 변수를 재사용

            try:
                tokens_a = TokenParser.extract_tokens(response_a_raw)
                tokens_b = TokenParser.extract_tokens(response_b_raw)
                ctx = {
                    "session_id": getattr(req, "session_id", None),
                    "user_id": getattr(req, "user_id", None),
                    "message": req.message,
                }
                if emotion_analysis:
                    ctx["emotion_analysis"] = emotion_analysis
                proc = TokenProcessor()
                for tokens in (tokens_a, tokens_b):
                    if not tokens:
                        continue
                    result = await proc.process_tokens(tokens, context=ctx)
                    if isinstance(result, dict):
                        for item in result.get("executed_actions", []) or []:
                            payload = item.get("result") if isinstance(item, dict) else None
                            if isinstance(payload, dict) and payload.get("type"):
                                executed_actions.append(payload)
                    elif isinstance(result, list):
                        executed_actions.extend(result)
            except Exception as e:
                logger.warning("[COMPARE] token pipeline skipped: %r", e)

            try:
                meta = {"session_id": getattr(req, "session_id", None), "assistant_text": winner_clean}
                if emotion_analysis is not None:
                    meta["emotion_analysis"] = emotion_analysis
                executed_actions.extend(build_actions(req.message, meta) or [])
            except Exception as e:
                logger.warning("[COMPARE] builder skipped: %r", e)

            try:
                # Slice 1 시스템: 요청에서 턴 수 추출
                turn_count = req.turn_count or 0

                ask = _maybe_emit_ask_suds(
                    user_text=req.message,
                    assistant_text=winner_clean,
                    turn_count=turn_count
                )
                if ask:
                    ask.setdefault("payload", {})
                    ask["payload"].setdefault("ui", "banner")
                    ask["payload"].setdefault("title", "지금 느낌을 0~10으로 평가해 볼까요?")
                    ask["payload"].setdefault("message", "0은 전혀 불편하지 않음, 10은 가장 심함을 뜻해요.")
                    ask["payload"].setdefault("ctaLabel", "지금 평가하기")
                    ask["payload"].setdefault("scale_min", 0)
                    ask["payload"].setdefault("scale_max", 10)
                    ask["payload"].setdefault("measurement_type", "check")
                    executed_actions.append(ask)
            except Exception as e:
                logger.warning("[COMPARE] ask_suds skipped: %r", e)

            has_suggest_eft = any(
                isinstance(a, dict) and a.get("type") == "suggest_eft" for a in executed_actions
            )
            has_ask_suds = any(
                isinstance(a, dict) and a.get("type") == "ask_suds" for a in executed_actions
            )

            latest_user = req.message or ""
            numeric_only = is_suds_numeric_response(latest_user)
            negative_hint = _looks_negative(latest_user)
            if not negative_hint and emotion_analysis is not None:
                primary = getattr(emotion_analysis, "primary_emotion", None)
                if isinstance(primary, str) and normalize_text(primary) in NEGATIVE_EMOTIONS:
                    negative_hint = True

            if not executed_actions:
                executed_actions.extend(_final_fallback_build(latest_user))
            else:
                if negative_hint and not numeric_only and not has_suggest_eft:
                    executed_actions.insert(0, _build_suggest_eft(detected_by="compare_guard"))
                if negative_hint and not numeric_only and not has_ask_suds:
                    executed_actions.append(_build_banner_ask_suds(detected_by="compare_guard"))

            normalized: List[Dict[str, Any]] = []
            for a in executed_actions:
                if isinstance(a, dict) and a.get("type") in (
                    "start_eftar",
                    "startEFTAR",
                    "eft_start",
                    "eftar_start",
                    "begin_eft",
                ):
                    canon, err = normalize_start_eftar(a)
                    normalized.append(canon.dict() if canon else a)
                else:
                    normalized.append(a)
            executed_actions = normalized
            executed_actions, sha = guard_actions(executed_actions)

            types_summary = ",".join(a.get("type", "") for a in executed_actions if isinstance(a, dict)) or "none"
            response.headers["Access-Control-Expose-Headers"] = (
                "X-Debug-Actions,X-Actions-Hash,X-Actions-Count"
            )
            response.headers["X-Debug-Actions"] = types_summary
            response.headers["X-Actions-Hash"] = sha
            response.headers["X-Actions-Count"] = str(len(executed_actions))
            response.headers["Cache-Control"] = "no-store"

            def _elapsed_seconds(res: httpx.Response) -> Optional[float]:
                try:
                    elapsed = getattr(res, "elapsed", None)
                    if elapsed is None:
                        return None
                    if hasattr(elapsed, "total_seconds"):
                        return float(elapsed.total_seconds())
                    return float(elapsed)
                except Exception:
                    return None

            elapsed_a = _elapsed_seconds(res_a)
            elapsed_b = _elapsed_seconds(res_b)
            success_a = res_a.status_code == 200
            success_b = res_b.status_code == 200
            error_a = None if success_a else data_a
            error_b = None if success_b else data_b

            llama3_obj = {
                "model": ENGINE_A_MODEL,
                "success": success_a,
                "processing_time": round(elapsed_a, 3) if elapsed_a is not None else None,
                "error": error_a,
                "response": response_a_clean,
                "text": response_a_clean,
                "raw": response_a_raw,
            }
            qwen25_obj = {
                "model": ENGINE_B_MODEL,
                "success": success_b,
                "processing_time": round(elapsed_b, 3) if elapsed_b is not None else None,
                "error": error_b,
                "response": response_b_clean,
                "text": response_b_clean,
                "raw": response_b_raw,
            }

            if success_a and success_b and elapsed_a is not None and elapsed_b is not None:
                faster = "llama3" if elapsed_a <= elapsed_b else "qwen25"
            elif success_a:
                faster = "llama3"
            elif success_b:
                faster = "qwen25"
            else:
                faster = "none"

            comparison_time = round(time.perf_counter() - started_at, 3)

            return {
                "llama3_response": llama3_obj,
                "qwen25_response": qwen25_obj,
                "actions": executed_actions,
                "comparison_time": comparison_time,
                "faster_model": faster,
                "timestamp": datetime.utcnow().isoformat(),
            }
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Engine connection failed: {str(e)}")
