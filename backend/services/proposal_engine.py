from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Protocol

import httpx

from config.settings import get_settings
from schemas.proposal_os import (
    ProposalChecklistItem,
    ProposalContentReco,
    ProposalDraft,
    ProposalEvidenceCard,
    ProposalResearchPackItem,
    ProposalResponse,
    ProposalRiskFlag,
    ProposalTodo,
    SignalResponse,
    StateCalendarContext,
)
from services.content_reco import generate_content_recos
from services.research_pack import build_research_prompt_bundle


class LLMProvider(Protocol):
    def complete(self, system_prompt: str, user_prompt: str, max_tokens: int = 500) -> str:
        ...


@dataclass
class MockLLMProvider:
    def complete(self, system_prompt: str, user_prompt: str, max_tokens: int = 500) -> str:
        return f"[MOCK-DRAFT]\nSYSTEM:{system_prompt[:120]}\nUSER:{user_prompt[:240]}"


class OpenAITextProvider:
    def __init__(self, api_key: str, model: str) -> None:
        from openai import OpenAI

        self._client = OpenAI(api_key=api_key)
        self._model = model

    def complete(self, system_prompt: str, user_prompt: str, max_tokens: int = 500) -> str:
        response = self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
            max_tokens=max_tokens,
        )
        return (response.choices[0].message.content if response.choices else "") or ""


class VLLMTextProvider:
    def __init__(self, base_url: str, model: str, timeout_sec: float = 20.0) -> None:
        normalized = (base_url or "http://127.0.0.1:8001").rstrip("/")
        if normalized.endswith("/v1"):
            self._base_url = normalized
        elif normalized.endswith("/v1/chat/completions"):
            self._base_url = normalized[: -len("/chat/completions")]
        else:
            self._base_url = f"{normalized}/v1"
        self._model = model
        self._timeout_sec = timeout_sec

    def complete(self, system_prompt: str, user_prompt: str, max_tokens: int = 500) -> str:
        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
            "max_tokens": max_tokens,
            "stream": False,
        }
        with httpx.Client(timeout=self._timeout_sec) as client:
            response = client.post(f"{self._base_url}/chat/completions", json=payload)
            response.raise_for_status()
            data = response.json()
        return (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
            or ""
        )


def build_llm_provider() -> LLMProvider:
    settings = get_settings()
    forced = (settings.PROPOSAL_LLM_PROVIDER or "auto").strip().lower()
    openai_key = (settings.OPENAI_API_KEY or os.getenv("OPENAI_API_KEY") or "").strip()
    openai_model = (settings.PROPOSAL_OPENAI_MODEL or settings.OPENAI_MODEL).strip()
    vllm_base_url = (settings.PROPOSAL_VLLM_BASE_URL or settings.VLLM_ENGINE_A_URL).strip()
    vllm_model = (settings.PROPOSAL_VLLM_MODEL or settings.FREE_AI_MODEL).strip()
    timeout_sec = float(settings.PROPOSAL_LLM_TIMEOUT_SEC)

    if forced == "openai" and openai_key:
        return OpenAITextProvider(api_key=openai_key, model=openai_model)
    if forced == "vllm":
        return VLLMTextProvider(
            base_url=vllm_base_url,
            model=vllm_model,
            timeout_sec=timeout_sec,
        )
    if forced == "mock":
        return MockLLMProvider()

    if openai_key:
        try:
            return OpenAITextProvider(api_key=openai_key, model=openai_model)
        except Exception:
            pass
    try:
        return VLLMTextProvider(
            base_url=vllm_base_url,
            model=vllm_model,
            timeout_sec=timeout_sec,
        )
    except Exception:
        return MockLLMProvider()


def _contains_any(items: list[str], keywords: tuple[str, ...]) -> bool:
    joined = " ".join((items or [])).lower()
    return any(token in joined for token in keywords)


class ProposalEngine:
    def __init__(self, llm_provider: LLMProvider | None = None) -> None:
        self.llm = llm_provider or build_llm_provider()

    def _compose_draft_with_llm(
        self,
        role_inference: str,
        draft_type: str,
        title: str,
        todo_titles: list[str],
        fallback: str,
    ) -> str:
        system_prompt = (
            "You produce concise business draft skeletons in Korean.\n"
            "Output plain text only.\n"
            "Always include evidence/checkpoint/approval sections."
        )
        user_prompt = (
            f"role={role_inference}\n"
            f"draft_type={draft_type}\n"
            f"title={title}\n"
            f"today_todos={', '.join(todo_titles[:5])}\n"
            "?챙 ?챘짭쨍 ???챗짼???챙/?챙쨍 챙짠챘짭쨍 챙짚챙짭?쩌챘징 ?챙짹?챘쩌."
        )
        try:
            generated = self.llm.complete(system_prompt=system_prompt, user_prompt=user_prompt, max_tokens=450).strip()
            return generated or fallback
        except Exception:
            return fallback

    def infer_role(
        self,
        aspiration_statement: str,
        target_identity: str | None,
        strengths: list[str],
        domains: list[str],
    ) -> str:
        corpus = [aspiration_statement or "", target_identity or "", *(strengths or []), *(domains or [])]
        if _contains_any(corpus, ("law", "legal", "compliance", "regulatory", "contract")):
            return "legal_advisor"
        if _contains_any(corpus, ("finance", "accounting", "budget", "재무", "회계")):
            return "finance_partner"
        if _contains_any(corpus, ("startup", "founder", "product", "growth", "고객")):
            return "startup_builder"
        return "execution_focus"

    def _task_templates(self, role_inference: str) -> list[tuple[str, str, int]]:
        if role_inference == "legal_advisor":
            return [
                ("규정 검토 및 위험 항목 정리", "법적 요구사항·규정 준수 포인트를 문서로 정리합니다.", 60),
                ("컴플라이언스 체크리스트 작성", "리스크, 증빙, 승인 포인트를 항목별로 정렬합니다.", 45),
                ("이해관계자 브리프 정비", "핵심 쟁점과 대응안을 1페이지로 요약합니다.", 45),
                ("후속 실행 계획 수립", "담당자·기한·승인 루트를 명확히 정리합니다.", 30),
            ]
        if role_inference == "finance_partner":
            return [
                ("월간 예산 및 현금흐름 정리", "수익·비용·현금흐름의 핵심 수치를 정리합니다.", 60),
                ("비용 구조 리스크 점검", "고정비/변동비 민감 영역을 선별해 우선순위를 정합니다.", 45),
                ("의사결정 분석 자료 정리", "증빙과 계산 근거를 바탕으로 대안별 비교표를 만듭니다.", 45),
                ("실행 체크리스트 확정", "담당·기한·검증 항목까지 포함한 실행표를 완성합니다.", 30),
            ]
        if role_inference == "startup_builder":
            return [
                ("제품 포지셔닝 점검", "목표 고객·문제 정의·핵심 메시지를 정렬합니다.", 45),
                ("성장 가설 수립", "측정 가능한 가설을 정하고 실험 순서를 정합니다.", 60),
                ("우선순위 기반 실행 계획", "효과가 큰 액션부터 2주 로드맵을 구성합니다.", 45),
                ("피드백 반영 루프 설계", "수집-분석-개선의 사이클을 문서화합니다.", 30),
                ("의사결정안 정리", "반드시 필요한 결정 이유와 리스크를 요약합니다.", 30),
            ]
        return [
            ("핵심 목표 정렬", "현재 과제의 KPI와 우선순위를 1페이지로 정리합니다.", 60),
            ("실행 액션 3개 선정", "단기 성과로 이어질 액션만 선별합니다.", 45),
            ("근거 기반 체크리스트 작성", "완료 기준과 리스크를 동시에 정의합니다.", 45),
            ("다음 주 실행 플랜 수립", "시간 배분과 소유자까지 반영한 실행표를 만듭니다.", 30),
        ]

    def build_phase1(
        self,
        proposal_id: str,
        role_inference: str,
        context: StateCalendarContext,
        signals: list[SignalResponse],
    ) -> ProposalResponse:
        templates = self._task_templates(role_inference)
        available_minutes = context.available_minutes or 240
        target_count = max(3, min(7, max(1, available_minutes // 60)))
        selected = templates[:target_count]

        todos: list[ProposalTodo] = []
        for idx, (title, description, minutes) in enumerate(selected):
            dependency = [idx] if idx > 0 else []
            todos.append(
                ProposalTodo(
                    title=title,
                    description=description,
                    duration_minutes=max(30, min(90, minutes)),
                    priority=min(5, idx + 1),
                    dependency_task_ids=dependency,
                    status="todo",
                )
            )

        email_fallback = (
            "1) 핵심 배경 요약\n"
            "2) 제안 개요\n"
            "3) 실행 항목 및 일정\n"
            "4) 리스크 및 승인 요청\n"
            "5) 결론\n\n"
            "상세 근거가 부족할 경우, 수집 가능한 로그/데이터를 추가해 보완하세요."
        )
        proposal_fallback = (
            "1) 상황 요약: 현재 맥락과 목표를 한 문단으로 정리하세요.\n"
            "2) 문제 정의: 해결해야 할 과제와 우선순위를 구분하세요.\n"
            "3) 실행 계획: 일정·담당·검증 기준을 명시하세요.\n"
            "4) 평가 지표: 성공 조건과 확인 지표를 설정하세요.\n"
        )
        todo_titles = [t.title for t in todos]

        drafts: list[ProposalDraft] = [
            ProposalDraft(
                draft_type="email",
                title="제안 메일 초안",
                content=self._compose_draft_with_llm(
                    role_inference=role_inference,
                    draft_type="email",
                    title="제안 메일 초안",
                    todo_titles=todo_titles,
                    fallback=email_fallback,
                ),
            ),
            ProposalDraft(
                draft_type="proposal",
                title="실행 제안 초안",
                content=self._compose_draft_with_llm(
                    role_inference=role_inference,
                    draft_type="proposal",
                    title="실행 제안 초안",
                    todo_titles=todo_titles,
                    fallback=proposal_fallback,
                ),
            ),
        ]

        checklist: list[ProposalChecklistItem] = [
            ProposalChecklistItem(item_text="근거 자료 준비 완료", category="evidence", is_required=True),
            ProposalChecklistItem(item_text="리스크 항목 점검", category="risk", is_required=True),
            ProposalChecklistItem(item_text="승인 라운드 사전 합의", category="approval", is_required=True),
        ]

        risk_flags: list[ProposalRiskFlag] = [
            ProposalRiskFlag(
                severity="medium",
                category="compliance",
                message="규정/증빙의 최신 상태를 먼저 확인하세요.",
                check_question="승인자가 필요한 핵심 증빙이 모두 준비되어 있습니까?",
                needs_review=True,
            ),
            ProposalRiskFlag(
                severity="low",
                category="execution",
                message="일정 대비 가용 인력과 우선순위가 동기화되어 있지 않을 수 있습니다.",
                check_question="실행 마일스톤별 소유자와 대기 시간을 분명히 했습니까?",
                needs_review=True,
            ),
        ]

        research_pack: list[ProposalResearchPackItem] = build_research_prompt_bundle(
            role_inference=role_inference,
            todos=todos,
            signals=signals,
        )

        content_recos: list[ProposalContentReco] = generate_content_recos(
            role_inference=role_inference,
            signals=signals,
        )

        evidence_cards: list[ProposalEvidenceCard] = [
            ProposalEvidenceCard(
                title=s.title,
                source_type=s.signal_type,
                summary=s.body[:180],
                link=(s.metadata or {}).get("url"),
            )
            for s in signals[:3]
        ]
        if not evidence_cards:
            evidence_cards.append(
                ProposalEvidenceCard(
                    title="identity profile summary",
                    source_type="identity_derived",
                    summary="기록 기반으로 핵심 목표와 강점/제약 조건을 반영해 기본 제안을 구성했습니다.",
                )
            )

        confidence = 0.55 + min(0.35, (len(signals) * 0.05))

        return ProposalResponse(
            proposal_id=proposal_id,
            phase="phase1",
            role_inference=role_inference,
            today_todos=todos,
            drafts=drafts,
            checklist=checklist,
            risk_flags=risk_flags,
            research_pack=research_pack,
            content_recos=content_recos,
            evidence_cards=evidence_cards,
            confidence=round(min(0.95, confidence), 2),
        )
