from __future__ import annotations

from typing import Any, Dict, Optional

from openai import AsyncOpenAI

from providers.base import ProviderResponse
from utils.logger import get_logger

logger = get_logger(__name__)


class OpenAIStructuredProvider:
    def __init__(self, *, api_key: str, model: str) -> None:
        self._client = AsyncOpenAI(api_key=api_key)
        self._model = model

    async def generate(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        schema: Dict[str, Any],
    ) -> ProviderResponse:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        response = await self._call_with_schema(messages, schema)
        content = (
            response.choices[0].message.content
            if response and response.choices
            else ""
        ) or ""

        return ProviderResponse(
            content=content,
            model=self._model,
            raw=response.model_dump() if response else None,
        )

    async def _call_with_schema(
        self,
        messages: list[dict[str, str]],
        schema: Dict[str, Any],
    ):
        try:
            return await self._client.chat.completions.create(
                model=self._model,
                messages=messages,
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "structured_intake",
                        "schema": schema,
                        "strict": True,
                    },
                },
                temperature=0.2,
                max_tokens=600,
            )
        except Exception as exc:
            logger.warning("OpenAI json_schema failed, falling back to json_object: %s", exc)
            return await self._client.chat.completions.create(
                model=self._model,
                messages=messages,
                response_format={"type": "json_object"},
                temperature=0.2,
                max_tokens=600,
            )

