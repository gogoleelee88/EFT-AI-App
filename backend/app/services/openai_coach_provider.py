from __future__ import annotations

import json
import os
from typing import Any

from openai import OpenAI

from config.settings import get_settings


class OpenAICoachProvider:
    """Structured provider for coach analyze using OpenAI Chat Completions."""

    def __init__(self) -> None:
        settings = get_settings()
        self.api_key = (settings.OPENAI_API_KEY or os.getenv("OPENAI_API_KEY") or "").strip()
        self.model = (os.getenv("COACH_OPENAI_MODEL") or "gpt-5.2-pro").strip()
        raw_max_tokens = (os.getenv("COACH_OPENAI_MAX_TOKENS") or "2400").strip()
        try:
            self.max_tokens = max(800, int(raw_max_tokens))
        except ValueError:
            self.max_tokens = 2400
        self._client = OpenAI(api_key=self.api_key) if self.api_key else None

    def generate_structured(self, prompt: str) -> dict[str, Any]:
        if not self._client:
            return {}

        try:
            response = self._client.chat.completions.create(
                model=self.model,
                temperature=0.2,
                max_tokens=self.max_tokens,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a social reply copilot for Korean business/social chat.\n"
                            "IMPORTANT OUTPUT RULES (hard rules):\n"
                            "- Return JSON only.\n"
                            "- replies[i].text MUST be directly sendable Korean message(s), 1-2 sentences.\n"
                            "- NEVER include meta headers or report text inside replies[i].text such as:\n"
                            "  '예상 효과', '근거', '가설', '주의점', '다음 행동', 'Hypotheses', 'Signal', 'Romance'.\n"
                            "- analysis/simulations/action/followups may contain explanation, but keep concise.\n"
                            "- If context.relationship is NOT 'romance_interest', set romance_insights to null.\n"
                            "- Always provide exactly three practical reply options in replies.\n"
                            "- Treat rough user drafts as notes and rewrite into polished, context-aware Korean.\n"
                            "Never diagnose people or claim hidden unconscious facts.\n"
                            "Do not provide manipulation or psychological warfare tactics.\n"
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
            )
        except Exception:
            return {}

        try:
            content = (response.choices[0].message.content or "").strip()
            if not content:
                return {}
            return json.loads(content)
        except Exception:
            return {}
