from __future__ import annotations

import json
import os
import re
from typing import Any

from openai import OpenAI

from backend.app.schemas.decision_mirror import (
    DecisionMirrorCallReport,
    DecisionMirrorCallResponse,
    DecisionMirrorContext,
    DecisionMirrorMessagesResponse,
    DecisionMirrorProfile,
    DecisionMirrorProfileResponse,
    DecisionMirrorScoreResponse,
    DecisionSuggestion,
)
from backend.app.services.decision_mirror_prompts import (
    build_call_report_prompt,
    build_call_sim_prompt,
    build_message3_prompt,
    build_profile_prompt,
    build_score_prompt,
    build_summarize_prompt,
)
from config.settings import get_settings


MAX_CONTEXT_CHARS = 14_000
MAX_MESSAGE_CHARS = 3_000
SUMMARY_TRIGGER_CHARS = 1_600
SUMMARY_INPUT_MAX = 8_000
SUMMARY_OUTPUT_MAX = 1_800
RAG_CHUNK_MAX = 640
RAG_TOP_K = 6


def _clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))


def _normalize_lines(text: str) -> list[str]:
    lines = [line.strip() for line in (text or "").splitlines()]
    return [line for line in lines if line]


def _redact_quote(text: str) -> str:
    clean = re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "[EMAIL]", text)
    clean = re.sub(r"\b\d{2,}\b", "[NUM]", clean)
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean[:30]


class OpenAIDecisionMirrorProvider:
    def __init__(self) -> None:
        settings = get_settings()
        self.api_key = (settings.OPENAI_API_KEY or os.getenv("OPENAI_API_KEY") or "").strip()
        self.model = (settings.OPENAI_MODEL or "gpt-4o-mini").strip()
        self._client = OpenAI(api_key=self.api_key) if self.api_key else None

    def generate_json(self, prompt: str, *, temperature: float = 0.2) -> dict[str, Any]:
        if not self._client:
            return {}
        try:
            response = self._client.chat.completions.create(
                model=self.model,
                temperature=temperature,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Return strict JSON only.\n"
                            "No markdown.\n"
                            "No diagnosis or manipulation tactics.\n"
                            "Use concise, action-oriented language.\n"
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                timeout=40,
            )
            raw = (response.choices[0].message.content or "").strip()
            if not raw:
                return {}
            return json.loads(raw)
        except Exception:
            return {}


class DecisionMirrorEngine:
    def __init__(self, provider: OpenAIDecisionMirrorProvider | None = None) -> None:
        self.provider = provider or OpenAIDecisionMirrorProvider()

    def build_profile(self, context: DecisionMirrorContext) -> DecisionMirrorProfileResponse:
        email_text, chat_text, attachments_text = self._prepare_context(context, query_text=None)
        prompt = build_profile_prompt(email_text=email_text, chat_text=chat_text, attachments_text=attachments_text)
        payload = self._generate_with_retry(prompt=prompt)

        if payload:
            try:
                return DecisionMirrorProfileResponse.model_validate(payload)
            except Exception:
                pass
        return self._fallback_profile(
            email_text=email_text,
            chat_text=chat_text,
            attachments_text=attachments_text,
        )

    def build_messages(
        self,
        *,
        context: DecisionMirrorContext,
        goal: str,
        constraints: str | None,
        question_attachments_text: str | None,
    ) -> DecisionMirrorMessagesResponse:
        profile_res = self.build_profile(context)
        query_text = " ".join(
            [
                (goal or "").strip(),
                (constraints or "").strip(),
                (question_attachments_text or "").strip(),
            ]
        ).strip()
        email_text, chat_text, attachments_text = self._prepare_context(context, query_text=query_text or None)
        prompt = build_message3_prompt(
            email_text=email_text,
            chat_text=chat_text,
            attachments_text=attachments_text,
            goal=goal,
            question_attachments_text=(question_attachments_text or "").strip(),
            constraints=constraints or "",
            profile=profile_res.profile.model_dump(),
        )
        payload = self._generate_with_retry(prompt=prompt)
        if payload:
            try:
                res = DecisionMirrorMessagesResponse.model_validate(payload)
                if len(res.suggestions) == 3:
                    return res
            except Exception:
                pass
        return self._fallback_messages(
            goal=goal,
            constraints=constraints or "",
            tone=profile_res.profile.tone_style,
        )

    def score_message(
        self,
        *,
        profile: DecisionMirrorProfile,
        message: str,
        goal: str,
        constraints: str | None,
    ) -> DecisionMirrorScoreResponse:
        trimmed = (message or "").strip()[:MAX_MESSAGE_CHARS]
        prompt = build_score_prompt(
            profile=profile.model_dump(),
            message=trimmed,
            goal=goal,
            constraints=constraints or "",
        )
        payload = self._generate_with_retry(prompt=prompt)
        if payload:
            try:
                base = DecisionMirrorScoreResponse.model_validate(payload)
                return self._apply_score_adjustments(base=base, message=trimmed)
            except Exception:
                pass
        return self._fallback_score(profile=profile, message=trimmed, goal=goal, constraints=constraints or "")

    def call_next(
        self,
        *,
        profile: DecisionMirrorProfile,
        call_goal: str,
        my_key_points: str,
        difficulty: str,
        transcript: list[dict[str, str]],
    ) -> DecisionMirrorCallResponse:
        max_turns = {"easy": 3, "normal": 4, "hard": 5}.get(difficulty, 4)
        them_turns = sum(1 for turn in transcript if turn.get("speaker") == "them")

        prompt = build_call_sim_prompt(
            profile=profile.model_dump(),
            call_goal=call_goal,
            my_key_points=my_key_points,
            difficulty=difficulty,
            transcript=transcript,
        )
        payload = self._generate_with_retry(prompt=prompt)

        next_text = self._fallback_call_line(difficulty=difficulty, call_goal=call_goal)
        if payload:
            next_obj = payload.get("next_turn") if isinstance(payload.get("next_turn"), dict) else {}
            candidate = str(next_obj.get("text") or "").strip()
            if candidate:
                next_text = candidate[:220]

        response = DecisionMirrorCallResponse(
            next_turn={"speaker": "them", "text": next_text},
            done=False,
            report=None,
        )

        should_finish = (them_turns + 1) >= max_turns
        if not should_finish:
            return response

        merged_transcript = list(transcript) + [{"speaker": "them", "text": next_text}]
        report = self._build_call_report(
            profile=profile,
            call_goal=call_goal,
            transcript=merged_transcript,
        )
        response.done = True
        response.report = report
        return response

    def _build_call_report(
        self,
        *,
        profile: DecisionMirrorProfile,
        call_goal: str,
        transcript: list[dict[str, str]],
    ) -> DecisionMirrorCallReport:
        prompt = build_call_report_prompt(
            profile=profile.model_dump(),
            call_goal=call_goal,
            transcript=transcript,
        )
        payload = self._generate_with_retry(prompt=prompt)
        if payload:
            report_payload = payload.get("report") if isinstance(payload.get("report"), dict) else payload
            try:
                report = DecisionMirrorCallReport.model_validate(report_payload)
                rescored = self.score_message(
                    profile=profile,
                    message=report.revised_message,
                    goal=call_goal,
                    constraints="",
                )
                report.revised_score = rescored.score
                return report
            except Exception:
                pass
        return self._fallback_call_report(
            profile=profile,
            call_goal=call_goal,
            transcript=transcript,
        )

    def _prepare_context(self, context: DecisionMirrorContext, *, query_text: str | None) -> tuple[str, str, str]:
        email_text = (context.email_thread_text or "").strip()
        chat_text = (context.chat_log_text or "").strip()
        attachments_text = (context.attachments_text or "").strip()

        if query_text:
            email_text = self._select_relevant_text(text=email_text, query_text=query_text, label="email")
            chat_text = self._select_relevant_text(text=chat_text, query_text=query_text, label="chat")
            attachments_text = self._select_relevant_text(
                text=attachments_text,
                query_text=query_text,
                label="attachment",
            )
        else:
            email_text = self._summarize_text(text=email_text, label="email_thread")
            chat_text = self._summarize_text(text=chat_text, label="chat_log")
            attachments_text = self._summarize_text(text=attachments_text, label="attachments")

        return (
            self._ensure_size("email_thread_text", email_text),
            self._ensure_size("chat_log_text", chat_text),
            self._ensure_size("attachments_text", attachments_text),
        )

    def _select_relevant_text(self, *, text: str, query_text: str, label: str) -> str:
        if not text:
            return ""
        query = (query_text or "").strip()
        if not query:
            return self._summarize_text(text=text, label=label)

        query_tokens = self._tokenize(query)
        if not query_tokens:
            return self._summarize_text(text=text, label=label)

        scored: list[tuple[float, str]] = []
        for chunk in self._split_chunks(text):
            chunk_tokens = self._tokenize(chunk)
            if not chunk_tokens:
                continue
            overlap = len(query_tokens.intersection(chunk_tokens))
            if overlap == 0:
                continue
            score = overlap * 2.2 + min(1.0, len(chunk) / 800.0)
            scored.append((score, chunk))

        if not scored:
            return self._summarize_text(text=text, label=label)

        scored.sort(key=lambda item: item[0], reverse=True)
        selected = [chunk for _, chunk in scored[:RAG_TOP_K]]
        merged = "\n".join(selected).strip()
        return self._summarize_text(text=merged, label=f"{label}_rag")

    def _summarize_text(self, *, text: str, label: str) -> str:
        clean = (text or "").strip()
        if not clean:
            return ""
        if len(clean) <= SUMMARY_TRIGGER_CHARS:
            return clean
        prompt = build_summarize_prompt(text=clean[:SUMMARY_INPUT_MAX], label=label)
        payload = self.provider.generate_json(prompt, temperature=0.1)
        summary = str(payload.get("summary") or "").strip() if isinstance(payload, dict) else ""
        if summary:
            return summary[:SUMMARY_OUTPUT_MAX]
        return clean[:SUMMARY_OUTPUT_MAX]

    def _split_chunks(self, text: str) -> list[str]:
        normalized = re.sub(r"\s+", " ", (text or "").strip())
        if not normalized:
            return []
        if len(normalized) <= RAG_CHUNK_MAX:
            return [normalized]
        chunks: list[str] = []
        cursor = 0
        while cursor < len(normalized):
            window = normalized[cursor : cursor + RAG_CHUNK_MAX]
            if len(window) == RAG_CHUNK_MAX:
                split_at = window.rfind(". ")
                if split_at < int(RAG_CHUNK_MAX * 0.4):
                    split_at = window.rfind(" ")
                if split_at > 0:
                    window = window[: split_at + 1]
            chunks.append(window.strip())
            cursor += max(1, len(window))
        return [item for item in chunks if item]

    def _tokenize(self, text: str) -> set[str]:
        return {token.lower() for token in re.findall(r"[A-Za-z0-9]{2,}", text or "")}

    def _ensure_size(self, label: str, text: str) -> str:
        if len(text) <= MAX_CONTEXT_CHARS:
            return text
        prompt = build_summarize_prompt(text=text[: MAX_CONTEXT_CHARS * 2], label=label)
        payload = self._generate_with_retry(prompt=prompt)
        summary = str(payload.get("summary") or "").strip() if payload else ""
        if summary:
            return summary[:MAX_CONTEXT_CHARS]
        return text[:MAX_CONTEXT_CHARS]

    def _generate_with_retry(self, *, prompt: str) -> dict[str, Any]:
        first = self.provider.generate_json(prompt, temperature=0.2)
        if first:
            return first
        second = self.provider.generate_json(prompt, temperature=0.05)
        return second if isinstance(second, dict) else {}

    def _fallback_profile(
        self,
        *,
        email_text: str,
        chat_text: str,
        attachments_text: str,
    ) -> DecisionMirrorProfileResponse:
        source = "\n".join([email_text, chat_text, attachments_text]).strip().lower()

        logical_tokens = {"analysis", "logic", "reason", "evidence", "plan", "objective", "goal", "decide"}
        emotional_tokens = {"feel", "emotion", "worry", "anxiety", "stress", "pain", "hope", "trust"}

        logical_hits = sum(1 for token in logical_tokens if token in source)
        emotional_hits = sum(1 for token in emotional_tokens if token in source)

        decision_style: str = "mixed"
        if logical_hits >= emotional_hits + 2:
            decision_style = "logical"
        elif emotional_hits >= logical_hits + 2:
            decision_style = "emotional"

        tone_style: str = "formal_polite"
        if "urgent" in source or "immediately" in source:
            tone_style = "short_direct"
        elif "comfortable" in source or "warm" in source:
            tone_style = "warm"

        lines = _normalize_lines("\n".join([email_text, chat_text, attachments_text]))
        quotes = [_redact_quote(line) for line in lines[:6] if line]
        quotes = [q for q in quotes if q][:6]
        if not quotes:
            quotes = ["Need more concrete statements to extract direct quotes."]

        profile = DecisionMirrorProfile(
            decision_style=decision_style,  # type: ignore[arg-type]
            risk_aversion=min(10, 4 + (1 if "risk" in source else 0)),
            approval_speed=7 if "urgent" in source else 5,
            price_sensitivity=6 if "price" in source else 5,
            pushback_intensity=6 if "pushback" in source or "concern" in source else 4,
            common_objections=[
                "Need clearer timeline",
                "Need stronger proof of benefit",
                "Need to review current commitments",
            ],
            approval_triggers=[
                "Clear and measurable plan",
                "Step-by-step communication",
                "Good alignment with existing priorities",
            ],
            tone_style=tone_style,  # type: ignore[arg-type]
            rejection_patterns=[
                "Perceived cost is too high",
                "Time is insufficient for testing",
                "Unclear risk and fallback conditions",
            ],
        )
        return DecisionMirrorProfileResponse(profile=profile, evidence={"quotes": quotes})

    def _fallback_messages(self, *, goal: str, constraints: str, tone: str) -> DecisionMirrorMessagesResponse:
        prefix = "Here are three practical response options:"
        if tone == "short_direct":
            prefix = "Use short, direct wording and confirm the next action."
        elif tone == "warm":
            prefix = "Use a warm, empathetic tone and propose collaborative options."

        suggestions = [
            DecisionSuggestion(
                id="A",
                title="Direct response",
                message=(
                    f"{prefix} First, restate the goal '{goal}' briefly, then present: "
                    "1) What I can accept, 2) what I need to check, 3) next concrete step."
                    f" Constraints: {constraints}" if constraints else ""
                ).strip(),
            ),
            DecisionSuggestion(
                id="B",
                title="Collaborative response",
                message=(
                    f"{prefix} Suggest a soft test: try one small option first, then confirm again. "
                    f"Anchor on '{goal}', and ask for one condition that will make this workable."
                ),
            ),
            DecisionSuggestion(
                id="C",
                title="Risk-aware response",
                message=(
                    f"{prefix} Clarify risk and fallback: if needed, request a fallback plan immediately "
                    f"and a clear deadline. This lowers uncertainty around '{goal}'."
                ),
            ),
        ]
        return DecisionMirrorMessagesResponse(suggestions=suggestions)

    def _fallback_score(
        self,
        *,
        profile: DecisionMirrorProfile,
        message: str,
        goal: str,
        constraints: str,
    ) -> DecisionMirrorScoreResponse:
        base = DecisionMirrorScoreResponse(
            score=50,
            reasons=[
                "The message is understandable but may need firmer structure.",
                "Constraints should be acknowledged explicitly and mapped to next actions.",
                "The tone is acceptable, but call-to-action strength can improve.",
            ],
            risk_points=[
                "Message may miss a clear time frame.",
                "High price/scope risk is not explicitly addressed.",
                "Potential objections are not directly handled.",
            ],
            improve_edits=[
                "Add a short clear summary line before details.",
                "State one measurable next step.",
                "Add a fallback if the first option is rejected.",
            ],
        )
        return self._apply_score_adjustments(base=base, message=message)

    def _apply_score_adjustments(self, *, base: DecisionMirrorScoreResponse, message: str) -> DecisionMirrorScoreResponse:
        adjusted = base.score
        lowered = (message or "").lower()

        if re.search(r"\d", message) or any(token in lowered for token in ("urgent", "price", "cost", "money")):
            adjusted += 3
        if any(token in lowered for token in ("pushback", "objection", "fallback", "not")):
            adjusted += 3
        if len(message) > 1200:
            adjusted -= 5

        base.score = _clamp(int(adjusted), 0, 100)
        base.reasons = (base.reasons or [])[:3] or ["Could not extract actionable reasons."]
        base.risk_points = (base.risk_points or [])[:3] or ["Some risks were not explicitly handled."]
        base.improve_edits = (base.improve_edits or [])[:3] or ["Add direct next action and clear deadline."]
        return base

    def _fallback_call_line(self, *, difficulty: str, call_goal: str) -> str:
        if difficulty == "hard":
            return f"[Hard] I need you to confirm the key point on '{call_goal}' before we continue."
        if difficulty == "easy":
            return f"[Easy] '{call_goal}' is accepted. What is your first concrete step?"
        return f"[Normal] Good point on '{call_goal}'. Let's move to decision: what is your preferred timeline?"

    def _fallback_call_report(
        self,
        *,
        profile: DecisionMirrorProfile,
        call_goal: str,
        transcript: list[dict[str, str]],
    ) -> DecisionMirrorCallReport:
        _ = profile
        key_excerpt = " / ".join(turn.get("text", "")[:28] for turn in transcript[-3:])
        revised_message = (
            f"I want to conclude the call goal '{call_goal}' with a clear agreement. "
            "Please re-issue: 1) what you can do now, 2) potential blockers, 3) next checkpoint. "
            f"(Recent context: {key_excerpt[:80]})"
        )
        revised_score = self.score_message(
            profile=profile,
            message=revised_message,
            goal=call_goal,
            constraints="",
        ).score
        return DecisionMirrorCallReport(
            call_success_score=_clamp(revised_score - 8, 0, 100),
            top_risks=[
                "Emotional resistance without fixed scope.",
                "No clear fallback when the first request is declined.",
                "Lack of explicit decision deadline.",
            ],
            power_lines=[
                "Ask for one concrete action with a timestamp.",
                "Anchor expectations on the call goal and request confirmation.",
                "Offer one alternative plan if current terms are unacceptable.",
            ],
            must_ask=[
                "Is this timeline acceptable and realistic?",
                "What exactly is the minimum acceptable result to proceed?",
            ],
            revised_message=revised_message,
            revised_score=revised_score,
        )
