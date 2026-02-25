from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional

import httpx

try:
    from openai import OpenAI
except Exception:  # pragma: no cover
    OpenAI = None

from utils.logger import get_logger

logger = get_logger(__name__)


def _is_truthy_env(value: Optional[str]) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _normalize_tool_calls(raw_tool_calls: Any) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    if not isinstance(raw_tool_calls, list):
        return normalized

    for item in raw_tool_calls:
        if not isinstance(item, dict):
            continue
        fn = item.get("function") if isinstance(item.get("function"), dict) else {}
        name = fn.get("name") or item.get("name")
        args_raw = fn.get("arguments") if fn else item.get("args")
        args: Dict[str, Any] = {}
        if isinstance(args_raw, dict):
            args = args_raw
        elif isinstance(args_raw, str):
            try:
                parsed = json.loads(args_raw)
                if isinstance(parsed, dict):
                    args = parsed
            except Exception:
                args = {}
        if isinstance(name, str) and name.strip():
            normalized.append({"name": name.strip(), "args": args})
    return normalized


def _normalize_citations(raw_citations: Any) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    if not isinstance(raw_citations, list):
        return normalized

    for item in raw_citations:
        if not isinstance(item, dict):
            continue
        source = str(item.get("source") or "").strip()
        if not source:
            continue
        url = item.get("url")
        normalized.append({"source": source, "url": url if isinstance(url, str) else None})
    return normalized


def normalize_chat_result(payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    data = payload if isinstance(payload, dict) else {}
    assistant_message = data.get("assistant_message")
    if not isinstance(assistant_message, str):
        assistant_message = ""

    return {
        "assistant_message": assistant_message.strip(),
        "tool_calls": _normalize_tool_calls(data.get("tool_calls")),
        "citations": _normalize_citations(data.get("citations")),
    }


def empty_chat_result() -> Dict[str, Any]:
    return {"assistant_message": "", "tool_calls": [], "citations": []}


class ProviderPreconditionError(RuntimeError):
    def __init__(
        self,
        *,
        message: str,
        code: str,
        status_code: int = 412,
        detail: Optional[str] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.detail = detail or message

    def to_chat_payload(self, *, provider: str, mode: str, session_id: str) -> Dict[str, Any]:
        return {
            "assistant_message": self.message,
            "citations": [],
            "tool_calls": [],
            "debug": {"provider": provider, "mode": mode, "code": self.code},
            "session_id": session_id,
            "response": self.message,
            "actions": [],
            "error": {"code": self.code, "detail": self.detail},
        }


class BaseLLMProvider:
    name = "base"

    def chat(self, messages: List[Dict[str, Any]], json_schema: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        raise NotImplementedError

    def embed(self, texts: List[str]) -> List[List[float]]:
        raise NotImplementedError


class AzureOpenAIProvider(BaseLLMProvider):
    name = "azure"

    def __init__(self) -> None:
        self.endpoint = (os.getenv("AZURE_OPENAI_ENDPOINT") or "").strip().rstrip("/")
        self.api_key = (os.getenv("AZURE_OPENAI_KEY") or "").strip()
        self.deployment = (os.getenv("AZURE_OPENAI_DEPLOYMENT") or "").strip()
        self.api_version = (os.getenv("AZURE_OPENAI_API_VERSION") or "2024-10-21").strip()
        self.embed_deployment = (os.getenv("AZURE_OPENAI_EMBED_DEPLOYMENT") or self.deployment).strip()
        self.timeout = float(os.getenv("LLM_HTTP_TIMEOUT", "45"))

    def _check_required(self) -> None:
        missing = []
        if not self.endpoint:
            missing.append("AZURE_OPENAI_ENDPOINT")
        if not self.api_key:
            missing.append("AZURE_OPENAI_KEY")
        if not self.deployment:
            missing.append("AZURE_OPENAI_DEPLOYMENT")
        if missing:
            raise ProviderPreconditionError(
                message="Azure provider is missing required configuration.",
                code="azure_config_missing",
                detail=f"Missing: {', '.join(missing)}",
            )

    def _chat_url(self) -> str:
        return (
            f"{self.endpoint}/openai/deployments/{self.deployment}/chat/completions"
            f"?api-version={self.api_version}"
        )

    def _embed_url(self) -> str:
        return (
            f"{self.endpoint}/openai/deployments/{self.embed_deployment}/embeddings"
            f"?api-version={self.api_version}"
        )

    @staticmethod
    def _content_to_text(content: Any) -> str:
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: List[str] = []
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    text = item.get("text")
                    if isinstance(text, str):
                        parts.append(text)
            return "\n".join(parts).strip()
        return ""

    @staticmethod
    def _extract_json(text: str) -> Optional[Dict[str, Any]]:
        if not text:
            return None
        candidate = text.strip()
        if not candidate.startswith("{"):
            start = candidate.find("{")
            end = candidate.rfind("}")
            if start == -1 or end == -1 or end <= start:
                return None
            candidate = candidate[start : end + 1]
        try:
            parsed = json.loads(candidate)
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            return None

    def chat(self, messages: List[Dict[str, Any]], json_schema: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        self._check_required()
        payload: Dict[str, Any] = {"messages": messages, "temperature": 0.2}
        if json_schema:
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "chat_hub_response", "schema": json_schema, "strict": True},
            }

        headers = {"api-key": self.api_key, "Content-Type": "application/json"}
        with httpx.Client(timeout=self.timeout) as client:
            response = client.post(self._chat_url(), headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()

        choice = (data.get("choices") or [{}])[0]
        message = choice.get("message") if isinstance(choice.get("message"), dict) else {}
        content_text = self._content_to_text(message.get("content"))
        parsed_json = self._extract_json(content_text) or {}
        tool_calls = _normalize_tool_calls(message.get("tool_calls"))
        if not tool_calls:
            tool_calls = _normalize_tool_calls(parsed_json.get("tool_calls"))

        citations = []
        if isinstance(message.get("context"), dict):
            citations = message["context"].get("citations") or []
        if not citations:
            citations = parsed_json.get("citations") or []

        assistant_message = parsed_json.get("assistant_message") if isinstance(parsed_json, dict) else None
        if not isinstance(assistant_message, str) or not assistant_message.strip():
            assistant_message = content_text

        return normalize_chat_result(
            {"assistant_message": assistant_message, "tool_calls": tool_calls, "citations": citations}
        )

    def embed(self, texts: List[str]) -> List[List[float]]:
        self._check_required()
        if not texts:
            return []
        payload = {"input": texts}
        headers = {"api-key": self.api_key, "Content-Type": "application/json"}

        with httpx.Client(timeout=self.timeout) as client:
            response = client.post(self._embed_url(), headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()

        vectors: List[List[float]] = []
        for item in data.get("data", []):
            emb = item.get("embedding")
            if isinstance(emb, list):
                vectors.append([float(v) for v in emb])
        return vectors


class OpenAIPlatformProvider(BaseLLMProvider):
    name = "openai"

    def __init__(self) -> None:
        self.api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
        self.model = (os.getenv("OPENAI_MODEL") or "gpt-5.2").strip()
        self.embed_model = (os.getenv("OPENAI_EMBED_MODEL") or "text-embedding-3-small").strip()
        self.mock_mode = _is_truthy_env(os.getenv("MOCK_MODE"))

    @staticmethod
    def _latest_user_text(messages: List[Dict[str, Any]]) -> str:
        for msg in reversed(messages):
            if isinstance(msg, dict) and msg.get("role") == "user":
                content = msg.get("content")
                if isinstance(content, str):
                    return content
        return ""

    @staticmethod
    def _contains_tool_result(messages: List[Dict[str, Any]]) -> bool:
        for msg in reversed(messages[-6:]):
            if isinstance(msg, dict) and msg.get("role") == "tool":
                return True
        return False

    def _mock_chat(self, messages: List[Dict[str, Any]]) -> Dict[str, Any]:
        if self._contains_tool_result(messages):
            return normalize_chat_result(
                {
                    "assistant_message": "[MOCK] Tool result received. Session advanced to the next response.",
                    "tool_calls": [],
                    "citations": [],
                }
            )

        user_text = self._latest_user_text(messages).lower()
        wants_tool = any(token in user_text for token in ("eft", "start_session", "tool", "tapping"))
        if wants_tool:
            return normalize_chat_result(
                {
                    "assistant_message": "[MOCK] Request recognized. Simulating eft.start_session tool call.",
                    "tool_calls": [
                        {
                            "name": "eft.start_session",
                            "args": {
                                "core_emotion": "anxiety",
                                "intensity": 6,
                                "notes": "mock openai tool call",
                            },
                        }
                    ],
                    "citations": [],
                }
            )

        return normalize_chat_result(
            {
                "assistant_message": "[MOCK] OpenAI provider fallback response.",
                "tool_calls": [],
                "citations": [],
            }
        )

    def chat(self, messages: List[Dict[str, Any]], json_schema: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        if self.mock_mode:
            return self._mock_chat(messages)

        if not self.api_key:
            raise ProviderPreconditionError(
                message="OpenAI provider requires OPENAI_API_KEY or MOCK_MODE=1.",
                code="openai_api_key_missing",
            )
        if OpenAI is None:
            raise ProviderPreconditionError(
                message="OpenAI SDK is unavailable on the server.",
                code="openai_sdk_missing",
            )

        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.2,
        }
        if json_schema:
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "chat_hub_response", "schema": json_schema, "strict": True},
            }

        client = OpenAI(api_key=self.api_key)
        try:
            response = client.chat.completions.create(**payload)
        except Exception:
            if json_schema:
                fallback_payload = dict(payload)
                fallback_payload["response_format"] = {"type": "json_object"}
                response = client.chat.completions.create(**fallback_payload)
            else:
                raise

        choice = (response.choices or [{}])[0] if hasattr(response, "choices") else {}
        message_obj = choice.message if hasattr(choice, "message") else {}
        message: Dict[str, Any] = {}
        if isinstance(message_obj, dict):
            message = message_obj
        else:
            if hasattr(message_obj, "model_dump"):
                dumped = message_obj.model_dump()
                if isinstance(dumped, dict):
                    message = dumped
            if not message and hasattr(message_obj, "dict"):
                dumped = message_obj.dict()
                if isinstance(dumped, dict):
                    message = dumped
        content_text = str(message.get("content") or "").strip() if isinstance(message, dict) else ""
        parsed_json = {}
        try:
            parsed_json = self._extract_json(content_text) or {}
        except Exception:
            parsed_json = {}
        if not isinstance(parsed_json, dict):
            parsed_json = {}

        tool_calls = _normalize_tool_calls(message.get("tool_calls") if isinstance(message, dict) else [])
        if not tool_calls:
            tool_calls = _normalize_tool_calls(parsed_json.get("tool_calls"))

        citations = []
        if isinstance(parsed_json, dict):
            citations = parsed_json.get("citations") or []

        assistant_message = parsed_json.get("assistant_message") if isinstance(parsed_json, dict) else None
        if not isinstance(assistant_message, str) or not assistant_message.strip():
            assistant_message = content_text
        return normalize_chat_result(
            {"assistant_message": assistant_message, "tool_calls": tool_calls, "citations": citations}
        )

    def embed(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        if self.mock_mode:
            vectors: List[List[float]] = []
            for text in texts:
                seed = sum(ord(ch) for ch in str(text))
                vectors.append([((seed + idx * 37) % 997) / 997.0 for idx in range(8)])
            return vectors

        if not self.api_key:
            raise ProviderPreconditionError(
                message="OpenAI provider requires OPENAI_API_KEY or MOCK_MODE=1.",
                code="openai_api_key_missing",
            )
        if OpenAI is None:
            raise ProviderPreconditionError(
                message="OpenAI SDK is unavailable on the server.",
                code="openai_sdk_missing",
            )

        response = OpenAI(api_key=self.api_key).embeddings.create(model=self.embed_model, input=texts)
        vectors: List[List[float]] = []
        for item in response.data:
            values = getattr(item, "embedding", None)
            if isinstance(values, list):
                vectors.append([float(v) for v in values])
        return vectors


_provider_instance: Optional[BaseLLMProvider] = None


def _build_provider() -> BaseLLMProvider:
    selected = (os.getenv("LLM_PROVIDER") or "openai").strip().lower()
    if selected == "openai":
        return OpenAIPlatformProvider()
    return AzureOpenAIProvider()


def reset_provider_cache() -> None:
    global _provider_instance
    _provider_instance = None


def get_provider() -> BaseLLMProvider:
    global _provider_instance
    if _provider_instance is None:
        _provider_instance = _build_provider()
        logger.info("chat_hub: initialized LLM provider=%s", _provider_instance.name)
    return _provider_instance


def provider_name() -> str:
    return get_provider().name


def chat(messages: List[Dict[str, Any]], json_schema: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return normalize_chat_result(get_provider().chat(messages, json_schema=json_schema))


def embed(texts: List[str]) -> List[List[float]]:
    return get_provider().embed(texts)

