from __future__ import annotations

import os
from typing import Any, Dict, Optional

import httpx

from config.settings import get_settings
from providers.base import ProviderResponse
from utils.logger import get_logger

logger = get_logger(__name__)
settings = get_settings()


def _normalize_api_base(url: str) -> str:
    u = (url or "").strip().rstrip("/")
    if u.endswith("/v1/chat/completions"):
        return u[: -len("/chat/completions")]
    if u.endswith("/v1"):
        return u
    return u + "/v1"


class VLLMStructuredProvider:
    _compat_cache: Optional[bool] = None

    def __init__(self) -> None:
        self._base_url = _normalize_api_base(settings.VLLM_ENGINE_A_URL)
        self._model = os.getenv("ENGINE_A_MODEL", "engine-a")
        self._timeout = float(os.getenv("ENGINE_HTTP_TIMEOUT", "30"))
        self._content_type = os.getenv(
            "ENGINE_CONTENT_TYPE",
            "application/json;charset=utf-8",
        )

    async def generate(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        schema: Dict[str, Any],
    ) -> ProviderResponse:
        compat = await self._is_openai_compatible()

        payload: Dict[str, Any] = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
            "top_p": 0.9,
            "max_tokens": 1024,
            "stream": False,
        }

        if compat:
            payload["response_format"] = {"type": "json_object"}

        url = f"{self._base_url}/chat/completions"
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                url,
                json=payload,
                headers={"Content-Type": self._content_type},
            )
            resp.raise_for_status()
            data = resp.json()
            content = (
                data.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
            ) or ""

        return ProviderResponse(content=content, model=self._model, raw=data)

    async def _is_openai_compatible(self) -> bool:
        if self._compat_cache is not None:
            return self._compat_cache

        url = f"{self._base_url}/models"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
                if isinstance(data, dict) and isinstance(data.get("data"), list):
                    self._compat_cache = True
                    return True
        except Exception as exc:
            logger.warning("vLLM OpenAI-compat check failed: %s", exc)

        self._compat_cache = False
        return False

