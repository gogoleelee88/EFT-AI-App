from typing import List, Dict, Any, Optional, Tuple

try:
    from openai import OpenAI
except Exception:
    OpenAI = object  # type: ignore

from backend.core.config import settings


class VLLMClient:
    def __init__(self) -> None:
        pass

    def _get_client_and_model(self, tier: Optional[str] = "free") -> Tuple[OpenAI, str]:
        # Keep imports light for CI / local boot.
        if tier == "premium":
            return (
                OpenAI(base_url=getattr(settings, "PREMIUM_AI_BASE_URL", ""), api_key="dummy"),
                getattr(settings, "PREMIUM_AI_MODEL", "premium"),
            )
        return (
            OpenAI(base_url=getattr(settings, "FREE_AI_BASE_URL", ""), api_key="dummy"),
            getattr(settings, "FREE_AI_MODEL", "free"),
        )

    def chat_completion(
        self,
        messages: List[Dict[str, Any]],
        tier: Optional[str] = "free",
        **kwargs: Any,
    ) -> Dict[str, Any]:
        # Mock-safe response to keep server booting in CI.
        return {"choices": [{"message": {"content": "Mock response"}}]}
