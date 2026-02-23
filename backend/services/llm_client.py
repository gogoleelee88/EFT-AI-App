from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional

from providers.openai_structured import OpenAIStructuredProvider
from providers.vllm_structured import VLLMStructuredProvider
from utils.logger import get_logger

logger = get_logger(__name__)

STRUCTURED_PROVIDER_ENV = "STRUCTURED_LLM_PROVIDER"
DEFAULT_PROVIDER = "openai"


class LLMClient:
    def __init__(self, provider: Optional[str] = None) -> None:
        self._provider_name = (provider or os.getenv(STRUCTURED_PROVIDER_ENV, DEFAULT_PROVIDER)).strip().lower()
        if self._provider_name not in {"vllm", "openai"}:
            logger.warning("Unknown structured provider '%s', defaulting to vllm", self._provider_name)
            self._provider_name = "vllm"

    async def generate_structured(
        self,
        *,
        user_message: str,
        checklist: List[Any],
    ) -> Dict[str, Any]:
        system_prompt, user_prompt = self._build_prompts(user_message, checklist)
        schema = self._structured_schema()

        provider_name = self._provider_name
        if provider_name == "openai":
            api_key = os.getenv("OPENAI_API_KEY", "")
            model = os.getenv("OPENAI_MODEL", "gpt-5.2")
            if not api_key:
                logger.error("STRUCTURED_LLM_PROVIDER=openai but OPENAI_API_KEY is missing")
                provider_name = "vllm"
            else:
                try:
                    provider = OpenAIStructuredProvider(api_key=api_key, model=model)
                    response = await provider.generate(
                        system_prompt=system_prompt,
                        user_prompt=user_prompt,
                        schema=schema,
                    )
                    return self._parse_or_fallback(response.content, checklist)
                except Exception as exc:
                    logger.error("OpenAI structured call failed, falling back to vllm: %s", exc)
                    provider_name = "vllm"

        if provider_name == "vllm":
            try:
                provider = VLLMStructuredProvider()
                response = await provider.generate(
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    schema=schema,
                )
                return self._parse_or_fallback(response.content, checklist)
            except Exception as exc:
                logger.error("vLLM structured call failed, returning safe fallback: %s", exc)

        return self._safe_fallback(checklist)

    async def generate_chat(self, *args: Any, **kwargs: Any) -> Dict[str, Any]:
        raise NotImplementedError("Chat mode is not implemented in LLMClient")

    def _build_prompts(self, user_message: str, checklist: List[Any]) -> tuple[str, str]:
        checklist_payload = []
        for item in checklist or []:
            if hasattr(item, "model_dump"):
                checklist_payload.append(item.model_dump())
            elif isinstance(item, dict):
                checklist_payload.append(item)
            else:
                checklist_payload.append(
                    {k: getattr(item, k) for k in ("key", "question", "value", "ask_count") if hasattr(item, k)}
                )

        system_prompt = (
            "You are a structured intake assistant. "
            "Return ONLY a JSON object that matches the provided schema. "
            "Do not include extra text."
        )

        user_prompt = (
            "User message:\n"
            f"{user_message}\n\n"
            "Checklist state (fill missing values only):\n"
            f"{json.dumps(checklist_payload, ensure_ascii=False, indent=2)}\n\n"
            "Rules:\n"
            "- extracted: object with checklist keys you can fill (string values only).\n"
            "- missing: list of keys still missing after extraction, ordered by priority.\n"
            "- next_question: the single next question to ask (based on missing[0]).\n"
            "- suggested_action: use 'ask_suds' only when all fields are complete.\n"
            "- action_payload: object for suggested_action or null.\n"
            "- assistant_message: 1-2 sentences, empathetic, include next_question if applicable.\n"
            "- If ask_count >= 2 for a key, rephrase to ask for permission to skip.\n"
            "- If the user agrees to skip, set extracted value to a placeholder like 'unspecified'.\n"
        )

        return system_prompt, user_prompt

    def _parse_or_fallback(self, content: str, checklist: List[Any]) -> Dict[str, Any]:
        data = self._extract_json(content)
        if not isinstance(data, dict):
            logger.warning("Structured JSON parse failed, using safe fallback")
            return self._safe_fallback(checklist)

        result = {
            "extracted": data.get("extracted") if isinstance(data.get("extracted"), dict) else {},
            "missing": data.get("missing") if isinstance(data.get("missing"), list) else [],
            "next_question": data.get("next_question"),
            "suggested_action": data.get("suggested_action"),
            "action_payload": data.get("action_payload") if isinstance(data.get("action_payload"), dict) else None,
            "assistant_message": data.get("assistant_message"),
        }

        if not result.get("assistant_message"):
            return self._safe_fallback(checklist)

        return self._normalize_result(result, checklist)

    def _normalize_result(self, result: Dict[str, Any], checklist: List[Any]) -> Dict[str, Any]:
        missing_keys = self._compute_missing_keys(checklist, result.get("extracted", {}))
        if isinstance(result.get("missing"), list):
            ordered = [k for k in result["missing"] if k in missing_keys]
            for key in missing_keys:
                if key not in ordered:
                    ordered.append(key)
            missing_keys = ordered

        result["missing"] = missing_keys
        if not result.get("next_question") and missing_keys:
            result["next_question"] = self._question_for_key(checklist, missing_keys[0])

        if result.get("suggested_action") == "ask_suds" and result.get("action_payload") is None:
            result["action_payload"] = {
                "measurement_type": "check",
                "ui": "banner",
                "message": "Please share your current intensity from 0 to 10.",
            }

        return result

    def _safe_fallback(self, checklist: List[Any]) -> Dict[str, Any]:
        missing_keys = self._compute_missing_keys(checklist, {})
        if missing_keys:
            question = self._question_for_key(checklist, missing_keys[0]) or "Could you share one missing detail?"
            return {
                "extracted": {},
                "missing": missing_keys,
                "next_question": question,
                "suggested_action": None,
                "action_payload": None,
                "assistant_message": question,
            }

        question = "Please share your current intensity from 0 to 10."
        return {
            "extracted": {},
            "missing": [],
            "next_question": question,
            "suggested_action": "ask_suds",
            "action_payload": {
                "measurement_type": "check",
                "ui": "banner",
                "message": question,
            },
            "assistant_message": question,
        }

    def _compute_missing_keys(self, checklist: List[Any], extracted: Dict[str, Any]) -> List[str]:
        extracted_keys = {k for k, v in (extracted or {}).items() if v not in (None, "", [])}
        missing = []
        for item in checklist or []:
            key = getattr(item, "key", None) if not isinstance(item, dict) else item.get("key")
            value = getattr(item, "value", None) if not isinstance(item, dict) else item.get("value")
            if key and key in extracted_keys:
                continue
            if value in (None, "", []):
                missing.append(key)
        return [k for k in missing if k]

    def _question_for_key(self, checklist: List[Any], key: str) -> Optional[str]:
        for item in checklist or []:
            item_key = getattr(item, "key", None) if not isinstance(item, dict) else item.get("key")
            if item_key == key:
                return getattr(item, "question", None) if not isinstance(item, dict) else item.get("question")
        return None

    def _extract_json(self, raw: str) -> Optional[Dict[str, Any]]:
        if not raw or not isinstance(raw, str):
            return None
        text = raw.strip()
        if text.startswith("```"):
            text = text.strip("`")
            if text.startswith("json"):
                text = text[4:].strip()
        if not text.startswith("{"):
            start = text.find("{")
            end = text.rfind("}")
            if start == -1 or end == -1 or end <= start:
                return None
            text = text[start : end + 1]
        try:
            return json.loads(text)
        except Exception:
            return None

    def _structured_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "extracted": {
                    "type": "object",
                    "additionalProperties": {
                        "anyOf": [{"type": "string"}, {"type": "null"}]
                    },
                },
                "missing": {"type": "array", "items": {"type": "string"}},
                "next_question": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                "suggested_action": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                "action_payload": {"anyOf": [{"type": "object"}, {"type": "null"}]},
                "assistant_message": {"type": "string"},
            },
            "required": [
                "extracted",
                "missing",
                "next_question",
                "suggested_action",
                "action_payload",
                "assistant_message",
            ],
        }

