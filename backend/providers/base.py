from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional, Protocol


@dataclass
class ProviderResponse:
    content: str
    model: Optional[str] = None
    raw: Optional[Dict[str, Any]] = None


class StructuredLLMProvider(Protocol):
    async def generate(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        schema: Dict[str, Any],
    ) -> ProviderResponse:
        ...
