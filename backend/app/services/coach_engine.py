from __future__ import annotations

import json
import re
from typing import Any, Protocol

from backend.app.schemas.coach import (
    CoachAction,
    CoachActionFallback,
    CoachAnalysis,
    CoachAnalyzeRequest,
    CoachAnalyzeResponse,
    CoachFollowup,
    CoachInternal,
    CoachPolicy,
    CoachReply,
    CoachRisk,
    CoachSimulation,
    CoachSuggestedMessage,
    RomanceCompatibilityNotes,
    RomanceInsights,
    RomanceInterestHypothesis,
)


class StructuredCoachProvider(Protocol):
    def generate_structured(self, prompt: str) -> dict[str, Any]:
        ...


class NoopCoachProvider:
    def generate_structured(self, prompt: str) -> dict[str, Any]:
        _ = prompt
        return {}


class CoachEngine:
    _BANNED_SENDABLE_PATTERNS = [
        r"예상\s*효과",
        r"근거\s*:",
        r"가설",
        r"다음\s*행동",
        r"주의점",
        r"Hypotheses",
        r"Signal",
        r"Romance",
    ]

    def __init__(self, provider: StructuredCoachProvider | None = None) -> None:
        self.provider = provider or NoopCoachProvider()

    def analyze(
        self,
        request: CoachAnalyzeRequest,
        *,
        extra_context: dict[str, Any] | None = None,
    ) -> CoachAnalyzeResponse:
        text = (request.message.my_draft or "").strip()
        merged_extra_context = extra_context or {}
        counterparty_context = self._build_counterparty_context(extra_context=merged_extra_context)

        analysis = self._build_analysis(text=text, banned_tones=request.context.banned_tones or [])
        simulations = self._build_simulations(analysis=analysis, counterparty_context=counterparty_context)
        replies = self._build_replies(request=request, analysis=analysis)
        followups = self._build_followups()
        action = self._build_action(
            request=request,
            analysis=analysis,
            replies=replies,
        )
        romance_insights = None
        if request.context.relationship == "romance_interest":
            romance_insights = self._build_romance_insights(request=request, analysis=analysis)
        evidence_items = self._build_evidence_items(
            extra_context=merged_extra_context,
            fallback_text=text,
        )
        confidence = self._score_confidence(analysis=analysis)
        messages, policy = self._build_sendable_messages_from_replies(replies=replies, request=request)

        baseline = CoachAnalyzeResponse(
            messages=messages,
            action=action,
            analysis=analysis,
            simulations=simulations,
            replies=replies,
            followups=followups,
            romance_insights=romance_insights,
            evidence_items=evidence_items,
            confidence=confidence,
            internal=CoachInternal(notes=[], banned_sections_detected=[], rewrite_applied=False),
            policy=policy,
        )

        return self._try_provider_override(
            request=request,
            baseline=baseline,
            extra_context=merged_extra_context,
        )

    def _build_sendable_messages_from_replies(
        self,
        *,
        replies: list[CoachReply],
        request: CoachAnalyzeRequest,
    ) -> tuple[list[CoachSuggestedMessage], CoachPolicy]:
        labels = {
            "soft": "기본(부드럽게)",
            "neutral": "실무형(중립)",
            "firm": "경계형(단호)",
        }
        banned_detected: list[str] = []
        rewrite_applied = False

        def _sanitize(text: str) -> str:
            nonlocal rewrite_applied
            original = text
            cleaned = text.strip()

            lines = [line.strip() for line in cleaned.splitlines() if line.strip()]
            kept: list[str] = []
            for line in lines:
                if any(re.search(pattern, line, flags=re.IGNORECASE) for pattern in self._BANNED_SENDABLE_PATTERNS):
                    banned_detected.append(line[:80])
                    rewrite_applied = True
                    continue
                kept.append(line)

            cleaned = " ".join(kept).strip()
            cleaned = re.sub(r"\s+", " ", cleaned).strip()

            if len(cleaned) > 260:
                cleaned = cleaned[:260].rstrip()
                rewrite_applied = True

            if cleaned != original.strip():
                rewrite_applied = True
            return cleaned

        messages: list[CoachSuggestedMessage] = []
        for reply in (replies or [])[:3]:
            sanitized = _sanitize(reply.text or "")
            if sanitized:
                messages.append(
                    CoachSuggestedMessage(
                        label=labels.get(reply.tone, reply.tone),
                        text=sanitized,
                    )
                )

        if not messages:
            relationship = request.context.relationship or "peer"
            formal = relationship in ("boss", "client", "stranger")
            fallback_text = (
                "메시지 확인했습니다. 전달 내용을 기준으로 한 문장으로 정리해 다시 공유드릴게요."
                if formal
                else "메시지 확인했어. 전달 내용 한 줄로 정리해서 다시 공유할게."
            )
            messages = [CoachSuggestedMessage(label="기본(재작성)", text=fallback_text)]
            rewrite_applied = True

        return (
            messages,
            CoachPolicy(
                rewrite_applied=rewrite_applied,
                banned_patterns_detected=banned_detected[:5],
            ),
        )

    def _build_counterparty_context(self, *, extra_context: dict[str, Any]) -> dict[str, Any]:
        profile = (
            extra_context.get("cached_counterparty_profile")
            if isinstance(extra_context, dict)
            else None
        )
        counterparts = extra_context.get("counterparties") if isinstance(extra_context, dict) else []
        stats = extra_context.get("context_ingest_stats") if isinstance(extra_context, dict) else {}
        evidence_count = 0
        if isinstance(counterparts, list):
            for item in counterparts:
                if not isinstance(item, dict):
                    continue
                signals = item.get("recent_signals") or []
                if isinstance(signals, list):
                    evidence_count += len(signals)

        def _safe_int(value: Any, *, default: int = 0) -> int:
            try:
                return int(value)
            except (TypeError, ValueError):
                return default

        if not isinstance(profile, dict):
            return {
                "tone_hint": "formal",
                "decision_style": "mixed",
                "approval_tempo": "medium",
                "pushback_tendency": "medium",
                "risk_aversion_level": 5,
                "relationship_momentum": "low",
                "counterparty_profile_available": False,
                "context_signal_count": evidence_count,
                "context_scanned": int(stats.get("scanned", 0)) if isinstance(stats, dict) else 0,
            }

        decision_style = str(profile.get("decision_style") or "mixed").strip().lower()
        tone_style = str(profile.get("tone_style") or "formal_polite").strip().lower()
        approval_speed = _safe_int(profile.get("approval_speed"), default=5)
        pushback_intensity = _safe_int(profile.get("pushback_intensity"), default=5)
        risk_aversion = _safe_int(profile.get("risk_aversion"), default=5)
        confidence = float(profile.get("confidence", 0.0) or 0.0)

        if "warm" in tone_style:
            tone_hint = "warm"
        elif "direct" in tone_style:
            tone_hint = "direct"
        else:
            tone_hint = "formal"

        if approval_speed >= 7:
            approval_tempo = "fast"
        elif approval_speed <= 4:
            approval_tempo = "slow"
        else:
            approval_tempo = "medium"

        if pushback_intensity >= 8:
            pushback_tendency = "high"
        elif pushback_intensity <= 4:
            pushback_tendency = "low"
        else:
            pushback_tendency = "medium"

        relationship_momentum = "low"
        if evidence_count >= 6:
            relationship_momentum = "high"
        elif evidence_count >= 3:
            relationship_momentum = "medium"

        return {
            "tone_hint": tone_hint,
            "decision_style": decision_style,
            "approval_tempo": approval_tempo,
            "pushback_tendency": pushback_tendency,
            "risk_aversion_level": risk_aversion,
            "relationship_momentum": relationship_momentum,
            "counterparty_profile_available": confidence >= 0.35,
            "context_signal_count": evidence_count,
            "context_scanned": int(stats.get("scanned", 0)) if isinstance(stats, dict) else 0,
            "confidence": confidence,
            "raw_profile": profile,
        }

    def _try_provider_override(
        self,
        *,
        request: CoachAnalyzeRequest,
        baseline: CoachAnalyzeResponse,
        extra_context: dict[str, Any],
    ) -> CoachAnalyzeResponse:
        context_brief = ""
        if isinstance(extra_context, dict):
            context_brief = str(extra_context.get("context_brief") or "").strip()

        prompt = (
            "Return JSON for social reply coaching.\n"
            "Use observed-text based inference only.\n"
            "Never diagnose people or claim hidden unconscious facts.\n"
            "Never provide manipulation or psychological warfare tactics.\n"
            "If manipulation_risk is detected, action.type must be pause_thread or ask_clarifying.\n"
            "Do step-by-step analysis internally, then run a consistency check before final output.\n"
            "Consistency check rule: no contradiction between analysis.risks, simulations, action, and replies.\n"
            "User draft may be rough. Rewrite into polished Korean messages aligned with context and persona intent.\n"
            "Persona alignment rule: reflect context.relationship, context.goal, context.image_goal, and default_send_policy.\n"
            "Generate exactly 3 reply suggestions in replies.\n"
            "CRITICAL: replies[i].text must be sendable only. Do NOT include meta/report text like "
            "'예상 효과', '근거', '가설', '주의점', '다음 행동', 'Hypotheses', 'Signal', 'Romance'.\n"
            "If context.relationship != 'romance_interest', set romance_insights to null.\n"
            "Keep output keys exactly aligned with the baseline schema skeleton.\n"
            f"room_id={request.room_id}\n"
            f"context={json.dumps(request.context.model_dump(), ensure_ascii=False)}\n"
            f"message={json.dumps(request.message.model_dump(), ensure_ascii=False)}\n"
            f"context_brief={json.dumps(context_brief, ensure_ascii=False)}\n"
            f"extra_context={json.dumps(extra_context, ensure_ascii=False)}\n"
            f"baseline_schema_skeleton={json.dumps(baseline.model_dump(), ensure_ascii=False)}\n"
        )
        try:
            payload = self.provider.generate_structured(prompt)
            if not isinstance(payload, dict) or not payload:
                return baseline
            candidate = CoachAnalyzeResponse.model_validate(payload)
            normalized = self._normalize_provider_response(candidate=candidate, baseline=baseline)

            if not normalized.messages:
                messages, policy = self._build_sendable_messages_from_replies(
                    replies=normalized.replies or baseline.replies,
                    request=request,
                )
                normalized = normalized.model_copy(update={"messages": messages, "policy": policy})

            messages, policy = self._sanitize_existing_messages(messages=normalized.messages, request=request)
            normalized = normalized.model_copy(update={"messages": messages, "policy": policy})
            return normalized
        except Exception:
            return baseline

    def _sanitize_existing_messages(
        self,
        *,
        messages: list[CoachSuggestedMessage],
        request: CoachAnalyzeRequest,
    ) -> tuple[list[CoachSuggestedMessage], CoachPolicy]:
        banned_detected: list[str] = []
        rewrite_applied = False

        def _sanitize(text: str) -> str:
            nonlocal rewrite_applied
            cleaned = text.strip()
            if any(re.search(pattern, cleaned, flags=re.IGNORECASE) for pattern in self._BANNED_SENDABLE_PATTERNS):
                banned_detected.append(cleaned[:80])
                rewrite_applied = True
                return ""
            cleaned = re.sub(r"\s+", " ", cleaned).strip()
            if len(cleaned) > 260:
                cleaned = cleaned[:260].rstrip()
                rewrite_applied = True
            return cleaned

        sanitized_messages: list[CoachSuggestedMessage] = []
        for message in (messages or [])[:3]:
            cleaned = _sanitize(message.text or "")
            if cleaned:
                sanitized_messages.append(CoachSuggestedMessage(label=message.label, text=cleaned))

        if not sanitized_messages:
            relationship = request.context.relationship or "peer"
            formal = relationship in ("boss", "client", "stranger")
            fallback_text = (
                "메시지 확인했습니다. 전달 내용을 기준으로 한 문장으로 정리해 다시 공유드릴게요."
                if formal
                else "메시지 확인했어. 전달 내용 한 줄로 정리해서 다시 공유할게."
            )
            sanitized_messages = [CoachSuggestedMessage(label="기본(재작성)", text=fallback_text)]
            rewrite_applied = True

        return (
            sanitized_messages,
            CoachPolicy(
                rewrite_applied=rewrite_applied,
                banned_patterns_detected=banned_detected[:5],
            ),
        )

    def _normalize_provider_response(
        self,
        *,
        candidate: CoachAnalyzeResponse,
        baseline: CoachAnalyzeResponse,
    ) -> CoachAnalyzeResponse:
        # Guarantee exactly three reply suggestions for UI consistency.
        replies = list(candidate.replies or [])
        fallback_replies = list(baseline.replies or [])

        if len(replies) < 3:
            replies.extend(fallback_replies[: max(0, 3 - len(replies))])
        if len(replies) > 3:
            replies = replies[:3]

        if not replies and fallback_replies:
            replies = fallback_replies[:3]

        romance_insights = candidate.romance_insights
        if baseline.romance_insights is None:
            romance_insights = None

        return candidate.model_copy(update={"replies": replies, "romance_insights": romance_insights})

    def _build_analysis(self, *, text: str, banned_tones: list[str]) -> CoachAnalysis:
        politeness = self._score_politeness(text)
        clarity = self._score_clarity(text)
        boundary = self._score_boundary(text)
        risks = self._detect_risks(text=text, clarity_score=clarity, banned_tones=banned_tones)
        misread = self._misread_points(risks=risks, clarity_score=clarity)
        return CoachAnalysis(
            politeness_score=politeness,
            clarity_score=clarity,
            boundary_strength=boundary,
            risks=risks,
            misread_points=misread,
        )

    def _score_politeness(self, text: str) -> int:
        lowered = text.lower()
        score = 62
        polite_markers = ["please", "thanks", "thank you", "부탁", "감사", "확인"]
        harsh_markers = ["idiot", "stupid", "shut up", "네 탓", "너 때문", "최악", "짜증"]

        score += min(24, sum(1 for marker in polite_markers if marker in lowered or marker in text) * 6)
        score -= min(45, sum(1 for marker in harsh_markers if marker in lowered or marker in text) * 11)

        if "!!" in text:
            score -= 10
        if len(text.strip()) < 8:
            score -= 12
        return self._clamp(score, 0, 100)

    def _score_clarity(self, text: str) -> int:
        lowered = text.lower()
        score = 58
        n = len(text)

        if 20 <= n <= 220:
            score += 18
        elif n < 12:
            score -= 20
        elif n > 360:
            score -= 12

        clarity_markers = ["언제", "기한", "요청", "확인", "by", "until", "today"]
        ambiguity_markers = ["아무거나", "대충", "알아서", "whatever", "somehow"]

        score += min(15, sum(1 for marker in clarity_markers if marker in lowered or marker in text) * 5)
        score -= min(20, sum(1 for marker in ambiguity_markers if marker in lowered or marker in text) * 8)

        if "." not in text and "?" not in text and "!" not in text:
            score -= 5
        return self._clamp(score, 0, 100)

    def _score_boundary(self, text: str) -> int:
        lowered = text.lower()
        score = 45
        boundary_markers = [
            "어렵", "불가", "가능한 범위", "이번에는", "기한", "not possible", "cannot", "boundary",
        ]
        softeners = ["부탁", "양해", "이해", "please", "could you"]

        score += min(36, sum(1 for marker in boundary_markers if marker in lowered or marker in text) * 12)
        score += min(12, sum(1 for marker in softeners if marker in lowered or marker in text) * 4)
        return self._clamp(score, 0, 100)

    def _detect_risks(self, *, text: str, clarity_score: int, banned_tones: list[str]) -> list[CoachRisk]:
        lowered = text.lower()
        risks: list[CoachRisk] = []

        blame_patterns = [r"너 때문", r"네 탓", r"your fault"]
        accusation_patterns = [r"거짓말", r"기만", r"you lied", r"lying"]
        legal_markers = ["고소", "소송", "법적", "변호사", "legal", "lawsuit"]
        emotional_markers = ["최악", "짜증", "열받", "stupid", "hate"]
        manipulation_markers = [
            "밀당",
            "조종",
            "심리전",
            "질투 유발",
            "manipulate",
            "gaslight",
            "play hard to get",
        ]

        if any(re.search(pattern, lowered) for pattern in blame_patterns):
            risks.append(
                CoachRisk(
                    type="blame",
                    severity="med",
                    note="관찰된 텍스트 기반 추정으로 상대 책임 단정으로 읽힐 수 있습니다.",
                )
            )

        if any(re.search(pattern, lowered) for pattern in accusation_patterns):
            risks.append(
                CoachRisk(
                    type="accusation",
                    severity="high",
                    note="관찰된 텍스트 기반 추정으로 비난/단정으로 읽혀 갈등이 커질 수 있습니다.",
                )
            )

        if any(marker in lowered for marker in legal_markers):
            risks.append(
                CoachRisk(
                    type="legal_risk",
                    severity="high",
                    note="법적/민감 표현이 있어 즉시 발송 전 문구 검토가 필요합니다.",
                )
            )

        if "!!" in text or any(marker in lowered for marker in emotional_markers):
            risks.append(
                CoachRisk(
                    type="emotional_overheat",
                    severity="high" if "!!" in text else "med",
                    note="관찰된 텍스트 기반 추정으로 감정 강도가 높게 읽힐 수 있습니다.",
                )
            )

        if clarity_score < 45:
            risks.append(
                CoachRisk(
                    type="ambiguity",
                    severity="med",
                    note="요청 범위/기한이 모호해 추가 확인 질문이 필요할 수 있습니다.",
                )
            )

        if any(tone.lower() in lowered for tone in banned_tones):
            risks.append(
                CoachRisk(
                    type="relationship_risk",
                    severity="med",
                    note="금지 톤과 유사한 표현이 있어 관계 리스크가 커질 수 있습니다.",
                )
            )

        if any(marker in lowered for marker in manipulation_markers):
            risks.append(
                CoachRisk(
                    type="manipulation_risk",
                    severity="high",
                    note="관찰된 텍스트 기반 추정으로 상대 조종 의도로 읽힐 수 있어 신뢰 손상 위험이 있습니다.",
                )
            )

        return risks

    def _misread_points(self, *, risks: list[CoachRisk], clarity_score: int) -> list[str]:
        points: list[str] = []
        risk_types = {risk.type for risk in risks}

        if "blame" in risk_types or "accusation" in risk_types:
            points.append("문구가 비난/몰아붙임으로 읽힐 수 있습니다.")
        if "legal_risk" in risk_types:
            points.append("법적 경고처럼 보여 목적 전달보다 갈등이 앞설 수 있습니다.")
        if "manipulation_risk" in risk_types:
            points.append("상대를 움직이려는 시도로 해석되면 신뢰가 약해질 수 있습니다.")
        if clarity_score < 55:
            points.append("요청 대상과 기한을 한 문장으로 명확히 쓰면 오해를 줄일 수 있습니다.")
        if not points:
            points.append("관찰된 텍스트 기준으로 톤과 요청 순서를 정리하면 전달력이 좋아질 수 있습니다.")
        return points

    def _build_simulations(
        self,
        *,
        analysis: CoachAnalysis,
        counterparty_context: dict[str, Any] | None = None,
    ) -> list[CoachSimulation]:
        relation_context = counterparty_context or {}
        pushback_tendency = str(relation_context.get("pushback_tendency") or "").strip().lower()
        relationship_momentum = str(relation_context.get("relationship_momentum") or "").strip().lower()

        risk_types = {risk.type for risk in analysis.risks}
        high_risk = any(risk.severity == "high" for risk in analysis.risks)
        if pushback_tendency == "high" and not high_risk:
            return [
                CoachSimulation(
                    reaction="pushback",
                    likelihood="high",
                    why="Counterparty context suggests likely friction. Early follow-up questions may reduce escalation.",
                    confidence=0.77,
                ),
                CoachSimulation(
                    reaction="ask_more",
                    likelihood="med",
                    why="Counterparty may ask for timing/conditions before accepting.",
                    confidence=0.62,
                ),
                CoachSimulation(
                    reaction="upset",
                    likelihood="low",
                    why="Emotional mismatch is possible if message feels too forceful.",
                    confidence=0.48,
                ),
            ]

        if "manipulation_risk" in risk_types:
            return [
                CoachSimulation(
                    reaction="pushback",
                    likelihood="high",
                    why="관찰된 텍스트 기반 추정으로 상대가 통제 시도로 받아들일 수 있습니다.",
                    confidence=0.82,
                ),
                CoachSimulation(
                    reaction="upset",
                    likelihood="med",
                    why="상대가 불편함을 느껴 감정적으로 거리를 둘 수 있습니다.",
                    confidence=0.71,
                ),
                CoachSimulation(
                    reaction="ignore",
                    likelihood="med",
                    why="부담을 피하기 위해 답장을 늦추거나 생략할 수 있습니다.",
                    confidence=0.57,
                ),
            ]

        if relationship_momentum == "high" and not high_risk:
            return [
                CoachSimulation(
                    reaction="accept",
                    likelihood="high",
                    why="Recent context indicates good reciprocity and readiness to respond.",
                    confidence=0.8,
                ),
                CoachSimulation(
                    reaction="ask_more",
                    likelihood="med",
                    why="They are likely to request one concrete detail before confirming.",
                    confidence=0.63,
                ),
                CoachSimulation(
                    reaction="ignore",
                    likelihood="low",
                    why="Timing mismatch remains possible if they are busy.",
                    confidence=0.43,
                ),
            ]

        if high_risk:
            return [
                CoachSimulation(
                    reaction="pushback",
                    likelihood="high",
                    why="방어 반응이 먼저 나올 가능성이 높습니다.",
                    confidence=0.79,
                ),
                CoachSimulation(
                    reaction="upset",
                    likelihood="med",
                    why="톤이 강하면 감정 소모가 커질 수 있습니다.",
                    confidence=0.66,
                ),
                CoachSimulation(
                    reaction="ask_more",
                    likelihood="low",
                    why="핵심 요청보다 톤에 반응해 확인 질문이 줄 수 있습니다.",
                    confidence=0.52,
                ),
            ]

        if analysis.clarity_score >= 65 and analysis.politeness_score >= 60:
            return [
                CoachSimulation(
                    reaction="accept",
                    likelihood="high",
                    why="요청 구조가 명확해 협조 반응이 나올 가능성이 있습니다.",
                    confidence=0.77,
                ),
                CoachSimulation(
                    reaction="ask_more",
                    likelihood="med",
                    why="세부 범위 확인 질문이 뒤따를 수 있습니다.",
                    confidence=0.62,
                ),
                CoachSimulation(
                    reaction="ignore",
                    likelihood="low",
                    why="상대 일정 이슈 외에는 무응답 가능성은 낮아 보입니다.",
                    confidence=0.48,
                ),
            ]

        return [
            CoachSimulation(
                reaction="ask_more",
                likelihood="high",
                why="정보가 덜 채워져 확인 질문이 먼저 나올 수 있습니다.",
                confidence=0.74,
            ),
            CoachSimulation(
                reaction="pushback",
                likelihood="med",
                why="문구가 강하게 읽히면 방어 반응이 생길 수 있습니다.",
                confidence=0.58,
            ),
            CoachSimulation(
                reaction="accept",
                likelihood="low",
                why="즉시 수락보다 조건 확인 후 수락 흐름일 수 있습니다.",
                confidence=0.49,
            ),
        ]

    def _build_replies(self, *, request: CoachAnalyzeRequest, analysis: CoachAnalysis) -> list[CoachReply]:
        relationship = request.context.relationship or "peer"
        goal = request.context.goal or "maintain"

        greeting_map = {
            "boss": "말씀 주신 내용 확인했습니다.",
            "client": "요청 주신 내용 확인했습니다.",
            "peer": "내용 확인했습니다.",
            "friend": "메시지 확인했어.",
            "family": "말해준 내용 확인했어.",
            "stranger": "문의 내용 확인했습니다.",
            "romance_interest": "메시지 고마워요. 내용 차분히 봤어요.",
        }
        goal_map = {
            "request": "가능한 범위와 일정을 맞춰보겠습니다.",
            "refuse": "현재 조건에서는 진행이 어렵습니다.",
            "negotiate": "서로 가능한 대안을 조율해보겠습니다.",
            "maintain": "관계를 해치지 않게 핵심만 정리해 전달하겠습니다.",
            "deescalate": "감정이 커지지 않게 사실 중심으로 정리하겠습니다.",
        }

        opening = greeting_map.get(relationship, greeting_map["peer"])
        intent_line = goal_map.get(goal, goal_map["maintain"])

        soft = CoachReply(
            tone="soft",
            text=(
                f"{opening} {intent_line} "
                "제가 이해한 내용을 먼저 짧게 공유드리고, 필요한 부분만 확인 부탁드려도 될까요?"
            ),
            expected_outcome="방어감을 낮추고 대화를 이어갈 가능성이 있습니다.",
            tradeoffs=["결론 전달 속도는 다소 느릴 수 있습니다.", "주도성이 약해 보일 수 있습니다."],
            confidence=0.74,
        )

        neutral = CoachReply(
            tone="neutral",
            text=(
                f"{opening} 전달드릴 핵심은 다음과 같습니다. {intent_line} "
                "추가로 필요한 기준이 있으면 알려주시면 그에 맞춰 정리하겠습니다."
            ),
            expected_outcome="업무형 응답으로 안정적으로 이어질 가능성이 있습니다.",
            tradeoffs=["정서적 공감이 적어 차갑게 읽힐 수 있습니다."],
            confidence=0.78,
        )

        boundary_line = "우선순위와 기한을 맞추기 위해 이번 요청은 가능한 범위 내에서만 진행하겠습니다."
        if analysis.boundary_strength < 50:
            boundary_line = "현재 일정과 우선순위를 기준으로 이번 요청은 지금 가능한 범위에서만 진행하겠습니다."

        firm = CoachReply(
            tone="firm",
            text=f"{opening} {boundary_line} 필요하시면 대안 1~2가지를 바로 제안드리겠습니다.",
            expected_outcome="경계선을 분명히 하면서도 협업 흐름을 유지할 수 있습니다.",
            tradeoffs=["상대가 단기적으로는 단호하게 느낄 수 있습니다."],
            confidence=0.72,
        )

        return [soft, neutral, firm]

    def _build_followups(self) -> list[CoachFollowup]:
        return [
            CoachFollowup(
                if_reaction="pushback",
                text="말씀 주신 우려 이해했습니다. 핵심 쟁점 1가지만 먼저 맞춰볼까요?",
            ),
            CoachFollowup(
                if_reaction="ask_more",
                text="좋습니다. 기한/범위/우선순위 중 어떤 항목을 먼저 확인하면 될까요?",
            ),
            CoachFollowup(
                if_reaction="ignore",
                text="확인 편하실 때 한 줄만 주시면 그 기준으로 바로 정리하겠습니다.",
            ),
            CoachFollowup(
                if_reaction="upset",
                text="감정이 커진 상태로 보여 잠시 멈추고 사실 기준으로 다시 맞춰보겠습니다.",
            ),
        ]

    def _build_action(
        self,
        *,
        request: CoachAnalyzeRequest,
        analysis: CoachAnalysis,
        replies: list[CoachReply],
    ) -> CoachAction:
        send_policy = request.context.default_send_policy or "prefer_calm"
        risk_types = {risk.type for risk in analysis.risks}
        high_risk = any(risk.severity == "high" for risk in analysis.risks)

        action_type = "wait_and_send"
        recommended_time = "in 20 minutes"
        rationale = ["관찰된 텍스트 기준으로 한 번 정리 후 발송하면 오해 리스크를 줄일 수 있습니다."]
        execution_steps = [
            "요청 목적과 기한을 첫 문장에 배치합니다.",
            "감정 표현을 줄이고 사실/요청 구조로 정리합니다.",
            "neutral 또는 firm 안으로 최종 발송합니다.",
        ]

        if "manipulation_risk" in risk_types:
            if analysis.clarity_score < 55:
                action_type = "ask_clarifying"
                recommended_time = "now"
                rationale = [
                    "관찰된 텍스트 기반 추정으로 조종 의도로 읽힐 수 있어 의도 확인 질문이 우선입니다."
                ]
                execution_steps = [
                    "상대 의도를 추정하지 말고 확인 질문 1개만 보냅니다.",
                    "답변을 받은 뒤 목적/경계 중심 문장으로 다시 작성합니다.",
                ]
            else:
                action_type = "pause_thread"
                recommended_time = "in 15 minutes"
                rationale = [
                    "관찰된 텍스트 기준으로 조종 시도로 읽힐 위험이 있어 즉시 발송은 비권장입니다.",
                    "잠시 멈춘 뒤 표현을 투명하게 바꾸는 것이 안전합니다.",
                ]
                execution_steps = [
                    "상대를 움직이려는 뉘앙스(밀당/유도)를 제거합니다.",
                    "의도와 경계를 직접적이고 짧게 다시 작성합니다.",
                ]
        elif "legal_risk" in risk_types:
            action_type = "wait_and_send"
            recommended_time = "in 30-60 minutes"
            rationale = [
                "법적/민감 표현이 있어 즉시 발송 전 검토가 필요합니다.",
                "문구를 정리하면 분쟁 리스크를 낮출 수 있습니다.",
            ]
            execution_steps = [
                "단정적 표현을 사실 중심 문장으로 교체합니다.",
                "요청 목적과 확인 질문을 분리합니다.",
                "필요시 내부 검토 후 발송합니다.",
            ]
        elif "emotional_overheat" in risk_types and send_policy != "prefer_fast":
            action_type = "pause_thread"
            recommended_time = "in 15 minutes"
            rationale = [
                "감정 강도가 높게 읽힐 수 있어 잠시 템포를 늦추는 것이 안전합니다.",
            ]
            execution_steps = [
                "초안을 임시 저장합니다.",
                "감정 단어를 줄이고 요청/기한 중심으로 다시 씁니다.",
                "neutral 템플릿으로 재정리합니다.",
            ]
        elif analysis.clarity_score < 50:
            action_type = "ask_clarifying"
            recommended_time = "now"
            rationale = [
                "요청 범위가 불명확해 확인 질문 1개를 먼저 보내는 편이 효율적입니다.",
            ]
            execution_steps = [
                "목적 한 문장 요약",
                "기한 또는 범위 확인 질문 1개",
                "답변 후 본문 발송",
            ]
        elif send_policy == "prefer_fast" and not high_risk:
            action_type = "send_now"
            recommended_time = "now"
            rationale = ["현재 리스크가 상대적으로 낮아 빠른 응답이 가능합니다."]
            execution_steps = [
                "neutral 안을 2~3문장으로 유지합니다.",
                "요청/기한을 명시하고 발송합니다.",
            ]
        elif send_policy == "prefer_boundary" and analysis.boundary_strength < 55:
            action_type = "switch_channel"
            recommended_time = "today"
            rationale = [
                "텍스트만으로 경계 전달이 어렵다면 채널 전환이 오해를 줄일 수 있습니다.",
            ]
            execution_steps = [
                "핵심 1문장 전달",
                "통화/미팅으로 전환 제안",
            ]

        fallback = CoachActionFallback(
            text=replies[1].text,
            note="즉시 발송이 필요하면 neutral 안을 우선 사용하고, 단정/비난 표현은 제거하세요.",
        )

        return CoachAction(
            type=action_type,  # type: ignore[arg-type]
            recommended_time=recommended_time,
            rationale=rationale,
            execution_steps=execution_steps,
            fallback_if_user_insists_send_now=fallback,
        )

    def _build_romance_insights(
        self,
        *,
        request: CoachAnalyzeRequest,
        analysis: CoachAnalysis,
    ) -> RomanceInsights:
        their_msg = (request.message.their_last_message or "").strip()
        my_draft = (request.message.my_draft or "").strip()
        lowered_their = their_msg.lower()

        evidence_quotes = self._extract_evidence_quotes(their_msg=their_msg, my_draft=my_draft)
        relationship = request.context.relationship

        positive_signals = sum(
            1
            for marker in ["같이", "다음", "보고", "좋아", "데이트", "??", "??"]
            if marker in their_msg
        )
        low_invest_signals = sum(
            1
            for marker in ["바빠", "나중", "짧게", "busy", "later", "..."]
            if marker in lowered_their or marker in their_msg
        )

        if relationship == "romance_interest":
            if positive_signals >= low_invest_signals:
                first = RomanceInterestHypothesis(
                    label="engagement_high",
                    likelihood="med" if positive_signals <= 1 else "high",
                    evidence_quotes=evidence_quotes,
                    alternative_explanations=[
                        "원래 친절한 말투일 수 있음",
                        "상황상 예의 있게 답한 것일 수 있음",
                    ],
                    what_to_do=[
                        "다음 메시지에서 선택형 질문으로 부담을 낮춥니다.",
                        "상대 답장 템포에 맞춰 대화 속도를 조절합니다.",
                    ],
                )
                second = RomanceInterestHypothesis(
                    label="comfort_building",
                    likelihood="med",
                    evidence_quotes=evidence_quotes,
                    alternative_explanations=[
                        "일반적 관계 형성 단계일 수 있음",
                        "의미 부여 없이 습관적 표현일 수 있음",
                    ],
                    what_to_do=[
                        "가벼운 공감+짧은 질문으로 안정감을 만듭니다.",
                        "확답 압박 대신 여지를 둔 문장으로 보냅니다.",
                    ],
                )
            else:
                first = RomanceInterestHypothesis(
                    label="low_investment",
                    likelihood="med" if low_invest_signals <= 1 else "high",
                    evidence_quotes=evidence_quotes,
                    alternative_explanations=[
                        "실제로 일정이 바쁠 수 있음",
                        "텍스트 습관상 짧게 답하는 스타일일 수 있음",
                    ],
                    what_to_do=[
                        "메시지 길이를 줄이고 답하기 쉬운 질문 1개만 보냅니다.",
                        "해석 단정 대신 속도/일정 확인 질문을 먼저 둡니다.",
                    ],
                )
                second = RomanceInterestHypothesis(
                    label="polite_distance",
                    likelihood="med",
                    evidence_quotes=evidence_quotes,
                    alternative_explanations=[
                        "초반이라 조심스러운 거리 조절일 수 있음",
                        "현재 우선순위가 관계 대화가 아닐 수 있음",
                    ],
                    what_to_do=[
                        "과한 감정 표현 없이 중립 톤을 유지합니다.",
                        "부담 없는 확인 질문으로 상대 선호 톤을 확인합니다.",
                    ],
                )
        else:
            first = RomanceInterestHypothesis(
                label="comfort_building",
                likelihood="low",
                evidence_quotes=evidence_quotes,
                alternative_explanations=[
                    "현재 컨텍스트가 연애 모드가 아닐 수 있음",
                    "업무/일반 대화 문맥일 가능성이 큼",
                ],
                what_to_do=[
                    "역할 기반 대화에서는 중립 톤을 우선합니다.",
                    "필요 시 부담 없는 확인 질문만 사용합니다.",
                ],
            )
            second = RomanceInterestHypothesis(
                label="polite_distance",
                likelihood="low",
                evidence_quotes=evidence_quotes,
                alternative_explanations=[
                    "기본 말투 특성일 수 있음",
                    "일시적 상황 영향일 수 있음",
                ],
                what_to_do=[
                    "추정 단정을 피하고 관찰 가능한 사실 중심으로 답합니다.",
                    "다음 메시지에서 목적과 톤만 명확히 맞춥니다.",
                ],
            )

        my_strengths: list[str] = []
        if "?" in my_draft:
            my_strengths.append("질문형 표현으로 대화 여지를 만들 수 있음")
        if any(marker in my_draft for marker in ["감사", "고마", "배려", "확인"]):
            my_strengths.append("상대를 존중하는 어휘를 사용할 수 있음")
        if not my_strengths:
            my_strengths.append("핵심 메시지를 짧게 정리할 잠재력이 있음")

        my_risks: list[str] = []
        if my_draft.count("?") >= 2:
            my_risks.append("질문이 많으면 부담으로 읽힐 수 있음")
        if any(marker in my_draft for marker in ["지금", "빨리", "당장", "확답"]):
            my_risks.append("확답 압박으로 읽힐 수 있음")
        if any(risk.type == "manipulation_risk" for risk in analysis.risks):
            my_risks.append("의도 추정/유도 문구로 읽히면 신뢰 손상 가능")
        if not my_risks:
            my_risks.append("상대 템포보다 빠르게 밀어붙일 가능성")

        compatibility_notes = RomanceCompatibilityNotes(
            my_strengths=my_strengths,
            my_risks=my_risks,
            watchouts=[
                "상대 답장 템포에 맞춰 대화 속도를 조절합니다.",
                "초반에는 감정 단정보다 사실/일정 확인을 우선합니다.",
            ],
        )

        safe_questions = [
            "요즘 일정이 좀 바빠? 편한 속도로 얘기해도 괜찮아.",
            "나는 가볍게 친해지고 싶은데, 너는 어떤 톤이 편해?",
            "지금은 짧게 얘기하고 나중에 천천히 이어갈까?",
        ]

        return RomanceInsights(
            interest_hypotheses=[first, second],
            compatibility_notes=compatibility_notes,
            safe_clarifying_questions=safe_questions,
        )

    def _extract_evidence_quotes(self, *, their_msg: str, my_draft: str) -> list[str]:
        candidates: list[str] = []

        for chunk in re.split(r"[.!?\n]", their_msg):
            clean = chunk.strip()
            if len(clean) >= 3:
                candidates.append(clean[:70])
            if len(candidates) >= 2:
                break

        if not candidates:
            snippet = my_draft.strip()[:70] if my_draft.strip() else "상대 메시지가 없어 내 초안 기준 가설"
            candidates.append(snippet)

        return [f'"{item}"' for item in candidates]

    def _score_confidence(self, *, analysis: CoachAnalysis) -> float:
        high_risk_count = sum(1 for risk in analysis.risks if risk.severity == "high")
        score = 0.42 + (analysis.politeness_score / 250.0) + (analysis.clarity_score / 220.0)
        score -= high_risk_count * 0.08
        return round(self._clamp_float(score, 0.2, 0.93), 2)

    def _build_evidence_items(self, *, extra_context: dict[str, Any], fallback_text: str) -> list[str]:
        candidates: list[str] = []

        for item in extra_context.get("evidence_items", []) if isinstance(extra_context, dict) else []:
            if isinstance(item, str) and item.strip():
                candidates.append(item.strip())

        retrieved = extra_context.get("retrieved_context_items")
        if isinstance(retrieved, list):
            for item in retrieved:
                if not isinstance(item, dict):
                    continue
                source = str(item.get("source") or "context")
                text = str(item.get("text") or "").strip()
                if text:
                    candidates.append(f"[{source}] {text[:90]}")

        if not candidates and fallback_text:
            candidates.append(f"[draft] {fallback_text[:90]}")

        deduped: list[str] = []
        seen = set()
        for item in candidates:
            key = item[:120]
            if key in seen:
                continue
            seen.add(key)
            deduped.append(item)
            if len(deduped) >= 3:
                break
        return deduped

    @staticmethod
    def _clamp(value: int, low: int, high: int) -> int:
        return max(low, min(high, value))

    @staticmethod
    def _clamp_float(value: float, low: float, high: float) -> float:
        return max(low, min(high, value))
