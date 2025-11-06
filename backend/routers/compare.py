import asyncio
import logging
import os
import sys
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
from backend.utils.s1_gate import get_s1_gate, ViolationType
from backend.utils.suds_helpers import _maybe_emit_ask_suds, is_suds_numeric_response
from backend.utils.text_norm import normalize_text

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["compare"])

settings = get_settings()
prompt_manager = EFTPromptManager()

# S1 게이트 설정 (Phase 1 Behavior 규칙 강제)
S1_GATE_ENABLED = os.getenv("S1_GATE_V2_ENFORCE", "false").lower() == "true"
S1_GATE_DRYRUN = os.getenv("S1_GATE_V2_DRYRUN", "false").lower() == "true"
s1_gate = get_s1_gate(strict_mode=True)


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


def _generate_s1_fallback(intake_count: int) -> str:
    """S1 게이트 위반 시 폴백 응답 생성 (비에코형, intake 단계별)

    Args:
        intake_count: 현재 수집된 인테이크 항목 수 (0~8)

    Returns:
        공감 + 1개 질문 형태의 폴백 응답
    """
    empathy = "힘드셨겠어요."

    # Intake 문항별 질문 (0~7번째 항목)
    intake_questions = [
        "어떤 상황에서 그런 감정이 드셨나요?",              # 0: trigger
        "그때 어떤 생각이 반복되셨나요?",                   # 1: thought_pattern
        "몸에서는 어떤 신호가 느껴지셨어요?",               # 2: body_signals
        "그 감정이 들었을 때 어떻게 반응하셨나요?",         # 3: behavior_response
        "그 상황에 대해 조금 더 말씀해주실 수 있나요?",     # 4: context_detail
        "지금 그 감정의 강도는 얼마나 되나요?",             # 5: SUDS (transition)
        "어떤 방법이 가장 편하실 것 같으세요?",             # 6: preferred_modality
        "어떤 부분이 가장 힘드셨나요?"                     # 7: 일반 (S2 전환 직전)
    ]

    # intake_count에 해당하는 질문 선택 (범위 초과 시 마지막 질문)
    question = intake_questions[intake_count] if intake_count < len(intake_questions) else intake_questions[-1]

    return f"{empathy} {question}"


def _apply_s1_gate(
    response_text: str,
    engine_name: str,
    user_message: str,
    intake_count: int = 0
) -> tuple[str, bool]:
    """S1 게이트 적용 (intake < 6일 때만)

    Args:
        response_text: AI 생성 응답
        engine_name: 엔진 이름 ("A" 또는 "B")
        user_message: 사용자 메시지 (충돌 방지용)
        intake_count: 현재 수집된 인테이크 항목 수

    Returns:
        (검증 통과한 응답 또는 폴백 응답, 위반 여부)
        - str: 최종 응답 텍스트
        - bool: True면 위반 차단됨 (actions 생성 금지)
    """
    # S2 전환 후에는 게이트 바이패스 (intake >= 6)
    if intake_count >= 6:
        logger.info(f"[S1_GATE] Engine {engine_name} - S2 단계, 게이트 바이패스 (intake={intake_count})")
        return response_text, False  # 위반 없음

    # S1 게이트 검증 수행
    is_valid, violations, detail_msg = s1_gate.validate(
        ai_response=response_text,
        intake_count=intake_count,
        turn_count=0,  # turn_count는 선택사항
        user_message=user_message
    )

    # Dry-run 모드: 로그만 기록하고 원본 반환
    if S1_GATE_DRYRUN:
        if not is_valid:
            violation_types = ",".join([v.value for v in violations])
            logger.warning(
                f"[S1_GATE_DRYRUN] Engine {engine_name} 위반 감지: {detail_msg} | "
                f"types={violation_types} | intake={intake_count}"
            )
            # 디버깅용 상세 출력
            print(f"[S1_GATE_DRYRUN] Engine {engine_name} 위반:", flush=True)
            print(f"  위반 유형: {violation_types}", flush=True)
            print(f"  상세: {detail_msg}", flush=True)
            print(f"  응답 일부: {response_text[:200]}...", flush=True)
            sys.stdout.flush()
        else:
            logger.info(f"[S1_GATE_DRYRUN] Engine {engine_name} 통과 (intake={intake_count})")
        return response_text, False  # DRYRUN은 위반 플래그 없음

    # Enforce 모드: 위반 시 폴백 응답
    if not S1_GATE_ENABLED:
        # 게이트가 완전히 비활성화된 경우
        return response_text, False

    if not is_valid:
        violation_types = ",".join([v.value for v in violations])
        fallback = _generate_s1_fallback(intake_count)

        logger.error(
            f"[S1_GATE_ENFORCE] Engine {engine_name} 위반 차단! 폴백 응답 반환 | "
            f"types={violation_types} | detail={detail_msg} | intake={intake_count}"
        )

        # 운영 모니터링용 출력
        print(f"[S1_GATE_ENFORCE] Engine {engine_name} 차단! 폴백 반환", flush=True)
        print(f"  위반: {violation_types}", flush=True)
        print(f"  폴백: {fallback}", flush=True)
        sys.stdout.flush()

        return fallback, True  # 위반 차단됨

    # 검증 통과 - 원본 응답 반환
    logger.info(f"[S1_GATE_ENFORCE] Engine {engine_name} 통과 (intake={intake_count})")
    return response_text, False  # 위반 없음


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
    # 🔍 페이로드 생성 및 로깅
    payload_a = _chat_payload(ENGINE_A_MODEL, req, system_prompt)
    payload_b = _chat_payload(ENGINE_B_MODEL, req, system_prompt)

    # 🔥 PAYLOAD_PROBE: 실제 엔진에 전달되는 페이로드 로깅
    print(f"[PAYLOAD_A] messages count: {len(payload_a.get('messages', []))}", flush=True)
    sys.stdout.flush()
    logger.error(f"[PAYLOAD_A] messages count: {len(payload_a.get('messages', []))}")

    if payload_a.get("messages"):
        for idx, msg in enumerate(payload_a["messages"]):
            role = msg.get("role", "unknown")
            content_preview = msg.get("content", "")[:100]
            print(f"[PAYLOAD_A] msg[{idx}] role={role}, content={content_preview}...", flush=True)
            sys.stdout.flush()
            logger.error(f"[PAYLOAD_A] msg[{idx}] role={role}, content={content_preview}...")

    print(f"[PAYLOAD_B] messages count: {len(payload_b.get('messages', []))}", flush=True)
    sys.stdout.flush()
    logger.error(f"[PAYLOAD_B] messages count: {len(payload_b.get('messages', []))}")

    if payload_b.get("messages"):
        for idx, msg in enumerate(payload_b["messages"]):
            role = msg.get("role", "unknown")
            content_preview = msg.get("content", "")[:100]
            print(f"[PAYLOAD_B] msg[{idx}] role={role}, content={content_preview}...", flush=True)
            sys.stdout.flush()
            logger.error(f"[PAYLOAD_B] msg[{idx}] role={role}, content={content_preview}...")

    async with httpx.AsyncClient() as client:
        try:
            res_a, res_b = await asyncio.gather(
                client.post(
                    ENGINE_A_URL,
                    json=payload_a,
                    headers=headers,
                    timeout=ENGINE_HTTP_TIMEOUT,
                ),
                client.post(
                    ENGINE_B_URL,
                    json=payload_b,
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

            # 🔥 S1 게이트 적용 (intake < 6일 때만, Dry-run 또는 Enforce 모드)
            # ✅ intake_count를 요청의 turn_count로 대체 (세션 관리 연동)
            intake_count = req.turn_count or 0
            response_a_gated, gate_blocked_a = _apply_s1_gate(
                response_text=response_a_clean,
                engine_name="A",
                user_message=req.message,
                intake_count=intake_count
            )
            response_b_gated, gate_blocked_b = _apply_s1_gate(
                response_text=response_b_clean,
                engine_name="B",
                user_message=req.message,
                intake_count=intake_count
            )

            # 게이트 통과한 응답으로 교체
            response_a_clean = response_a_gated
            response_b_clean = response_b_gated

            # S1 게이트 위반 시 actions 생성 금지 플래그
            s1_gate_blocked = gate_blocked_a or gate_blocked_b
            logger.info(f"[AFTER_GATE] gate_blocked_a={gate_blocked_a}, gate_blocked_b={gate_blocked_b}, s1_gate_blocked={s1_gate_blocked}")

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

            # 🚨 S1 게이트 차단 시 actions 생성 금지
            if not s1_gate_blocked:
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
            else:
                logger.info("[AFTER_GATE] S1 게이트 차단 - actions 생성 스킵")

            # 🚨 S1 게이트 차단 시 actions 생성 금지
            if not s1_gate_blocked:
                try:
                    meta = {"session_id": getattr(req, "session_id", None), "assistant_text": winner_clean}
                    if emotion_analysis is not None:
                        meta["emotion_analysis"] = emotion_analysis
                    executed_actions.extend(build_actions(req.message, meta) or [])
                except Exception as e:
                    logger.warning("[COMPARE] builder skipped: %r", e)

                try:
                    ask = _maybe_emit_ask_suds(
                        user_text=req.message,
                        assistant_text=winner_clean
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

            # 🚨 S1 게이트 차단 시 fallback actions도 생성하지 않음
            if not s1_gate_blocked:
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

            # 🚨 S1 게이트 차단 시에도 정규화는 실행 (빈 리스트에 대한 처리)
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

            # 🚨 S1 게이트 차단 시 헤더도 설정하지 않음
            if not s1_gate_blocked:
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

            # 🚨 S1 게이트 차단 시 응답 JSON에서 actions 제외
            result = {
                "llama3_response": llama3_obj,
                "qwen25_response": qwen25_obj,
                "comparison_time": comparison_time,
                "faster_model": faster,
                "timestamp": datetime.utcnow().isoformat(),
            }
            if not s1_gate_blocked:
                result["actions"] = executed_actions

            return result
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Engine connection failed: {str(e)}")
