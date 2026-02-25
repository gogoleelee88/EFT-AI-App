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
        self.model = (settings.OPENAI_MODEL or "gpt-5.2").strip()
        self._client = OpenAI(api_key=self.api_key) if self.api_key else None

    def generate_structured(self, prompt: str) -> dict[str, Any]:
        if not self._client:
            return {}

        try:
            response = self._client.chat.completions.create(
                model=self.model,
                temperature=0.2,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a social reply copilot for Korean business/social chat.\n"
                            "Return JSON only.\n"
                            "Never diagnose people or claim hidden unconscious facts.\n"
                            "Use observed-text-based hypotheses with uncertainty.\n"
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

