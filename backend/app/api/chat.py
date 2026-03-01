from __future__ import annotations

import json
import os
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Literal, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from backend.app import router as mode_router
from backend.app.llm import provider as llm_provider
from backend.app.routers.chat_rooms import router as chat_rooms_router
from backend.app.routers.chat_ws import router as chat_ws_router
from backend.app.routers.coach import router as coach_router
from backend.app.routers.decision_mirror import router as decision_mirror_router
from backend.app.routers.gmail import router as gmail_router
from backend.app.rag import retrieve_ai_search, retrieve_postgres
from backend.app.state.redis_store import (
    get_rag_cache,
    load_session_state,
    save_session_state,
    set_rag_cache,
)
from backend.app.tools.registry import execute_tool_calls, get_tool_schemas
from config.settings import get_settings
from utils.logger import get_logger

try:
    from openai import AsyncAzureOpenAI, AsyncOpenAI
except Exception:  # pragma: no cover - import failure is handled at request time.
    AsyncOpenAI = None
    AsyncAzureOpenAI = None

logger = get_logger(__name__)
chat_router = APIRouter()
chat_router.include_router(chat_rooms_router)
chat_router.include_router(chat_ws_router)
chat_router.include_router(coach_router)
chat_router.include_router(decision_mirror_router)
chat_router.include_router(gmail_router)

OPENCHAT_SYSTEM_PROMPT = (
    "You are OpenChat, a helpful AI assistant inside the MoodTalk app.\n"
    "Answer in Korean by default unless the user explicitly asks for another language.\n"
    "Keep responses practical, clear, and safe."
)


class OpenChatHistoryTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=4000)


class OpenChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    history: List[OpenChatHistoryTurn] = Field(default_factory=list)
    session_id: Optional[str] = None
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=600, ge=64, le=2048)


class OpenChatResponse(BaseModel):
    session_id: str
    provider: Literal["openai", "azure"]
    model: str
    assistant_message: str
    response: str
    timestamp: str
    usage: Optional[Dict[str, Optional[int]]] = None


def _build_openchat_messages(payload: OpenChatRequest) -> List[Dict[str, str]]:
    messages: List[Dict[str, str]] = [{"role": "system", "content": OPENCHAT_SYSTEM_PROMPT}]
    for turn in payload.history[-10:]:
        content = turn.content.strip()
        if content:
            messages.append({"role": turn.role, "content": content})
    messages.append({"role": "user", "content": payload.message.strip()})
    return messages


def _resolve_openchat_client(settings) -> tuple[Any, Literal["openai", "azure"], str]:
    provider = (os.getenv("OPENCHAT_PROVIDER") or "openai").strip().lower()

    if provider == "azure":
        if AsyncAzureOpenAI is None:
            raise HTTPException(status_code=503, detail="OpenAI SDK (Azure client) is unavailable on the server.")

        endpoint = (os.getenv("AZURE_OPENAI_ENDPOINT") or "").strip()
        api_key = (os.getenv("AZURE_OPENAI_KEY") or "").strip()
        deployment = (os.getenv("AZURE_OPENAI_DEPLOYMENT") or "").strip()
        api_version = (os.getenv("AZURE_OPENAI_API_VERSION") or "2024-10-21").strip()

        missing = []
        if not endpoint:
            missing.append("AZURE_OPENAI_ENDPOINT")
        if not api_key:
            missing.append("AZURE_OPENAI_KEY")
        if not deployment:
            missing.append("AZURE_OPENAI_DEPLOYMENT")
        if missing:
            raise HTTPException(
                status_code=503,
                detail=f"Azure OpenAI is not configured. Missing: {', '.join(missing)}",
            )

        client = AsyncAzureOpenAI(
            api_key=api_key,
            azure_endpoint=endpoint.rstrip("/"),
            api_version=api_version,
            timeout=45.0,
        )
        return client, "azure", deployment

    if provider != "openai":
        raise HTTPException(status_code=400, detail="OPENCHAT_PROVIDER must be 'openai' or 'azure'.")

    api_key = (settings.OPENAI_API_KEY or "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not configured on the server.")
    if AsyncOpenAI is None:
        raise HTTPException(status_code=503, detail="OpenAI SDK is unavailable on the server.")

    model = (settings.OPENAI_MODEL or "gpt-5.2").strip()
    client = AsyncOpenAI(api_key=api_key, timeout=45.0)
    return client, "openai", model


@chat_router.post("/api/openchat", response_model=OpenChatResponse)
async def openchat(payload: OpenChatRequest):
    settings = get_settings()

    session_id = (payload.session_id or "").strip() or f"openchat_{uuid4().hex[:12]}"
    client, provider_label, model = _resolve_openchat_client(settings)
    messages = _build_openchat_messages(payload)

    try:
        completion = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=payload.temperature,
            max_tokens=payload.max_tokens,
        )

        assistant_message = ""
        if completion.choices:
            assistant_message = (completion.choices[0].message.content or "").strip()
        if not assistant_message:
            assistant_message = "응답을 생성하지 못했어요. 잠시 후 다시 시도해주세요."

        usage_payload: Optional[Dict[str, Optional[int]]] = None
        usage = completion.usage
        if usage is not None:
            usage_payload = {
                "prompt_tokens": getattr(usage, "prompt_tokens", None),
                "completion_tokens": getattr(usage, "completion_tokens", None),
                "total_tokens": getattr(usage, "total_tokens", None),
            }

        return OpenChatResponse(
            session_id=session_id,
            provider=provider_label,
            model=model,
            assistant_message=assistant_message,
            response=assistant_message,
            timestamp=datetime.now(timezone.utc).isoformat(),
            usage=usage_payload,
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "openchat failed: session=%s provider=%s model=%s err=%s",
            session_id,
            provider_label,
            model,
            exc,
        )
        upstream_status = getattr(exc, "status_code", None)
        if isinstance(upstream_status, int) and 400 <= upstream_status < 500:
            if upstream_status == 401:
                detail = f"{provider_label.upper()} authentication failed. Check credentials."
            elif upstream_status == 429:
                detail = f"{provider_label.upper()} quota or rate limit reached. Check billing or retry later."
            else:
                detail = f"{provider_label.upper()} request failed (status {upstream_status})."
            raise HTTPException(status_code=upstream_status, detail=detail)

        raise HTTPException(status_code=502, detail=f"{provider_label.upper()} response generation failed.")


class ChatHubRequest(BaseModel):
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    message: str = Field(..., min_length=1, max_length=4000)
    attachments: Optional[List[Dict[str, Any]]] = None
    mode: Optional[str] = None

    # Backward compatibility for existing EFT intake flow.
    strict_intake: Optional[Dict[str, Any]] = None


def _response_schema() -> Dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "assistant_message": {"type": "string"},
            "tool_calls": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "name": {"type": "string"},
                        "args": {"type": "object"},
                    },
                    "required": ["name", "args"],
                },
            },
            "citations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "source": {"type": "string"},
                        "url": {"type": ["string", "null"]},
                    },
                },
            },
        },
        "required": ["assistant_message", "tool_calls", "citations"],
    }


def _normalize_tool_calls(tool_calls: Any) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    if not isinstance(tool_calls, list):
        return normalized
    for item in tool_calls:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        args = item.get("args")
        if not isinstance(name, str) or not name.strip():
            continue
        if not isinstance(args, dict):
            args = {}
        normalized.append({"name": name.strip(), "args": args})
    return normalized


def _normalize_citations(citations: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if not isinstance(citations, list):
        return out
    seen = set()
    for item in citations:
        if not isinstance(item, dict):
            continue
        source = str(item.get("source") or "").strip()
        url = item.get("url")
        key = (source, str(url))
        if not source or key in seen:
            continue
        seen.add(key)
        out.append({"source": source, "url": url if isinstance(url, str) else None})
    return out


def _build_context_messages(mode: str, context_blocks: List[str], attachments: Optional[List[Dict[str, Any]]]) -> str:
    tools = [tool["name"] for tool in get_tool_schemas()]
    context_text = "\n\n".join(block for block in context_blocks if block).strip()
    attachment_hint = f"attachments={len(attachments or [])}"
    return (
        "You are the MoodTalk chat hub orchestrator assistant.\n"
        "Always return a JSON object matching the schema.\n"
        "Only call tools when needed.\n"
        f"Current mode: {mode}\n"
        f"Available tools: {', '.join(tools)}\n"
        f"Request metadata: {attachment_hint}\n"
        f"Retrieved context:\n{context_text if context_text else '(none)'}"
    )


def _fallback_tool_calls(payload: ChatHubRequest, mode: str) -> List[Dict[str, Any]]:
    # Keeps tool path testable even when model does not emit tool calls.
    if payload.strict_intake:
        return [{"name": "eft.start_session", "args": payload.strict_intake}]
    if mode == "calendar":
        return [{"name": "calendar.search_events", "args": {"date": date.today().isoformat()}}]
    if mode == "eft":
        return [
            {
                "name": "eft.start_session",
                "args": {
                    "core_emotion": "챘쨋챙",
                    "intensity": 6,
                    "notes": payload.message,
                },
            }
        ]
    if "챗째챙" in payload.message or "checkin" in payload.message.lower():
        return [{"name": "emotion.log_checkin", "args": {"mood": "챙짚챘짝쩍", "intensity": 5, "notes": payload.message}}]
    return []


@chat_router.post("/api/chat")
async def chat_hub(payload: ChatHubRequest):
    session_id = payload.session_id or f"hub_{uuid4().hex[:12]}"
    user_id = (payload.user_id or "").strip() or "anonymous"
    mode = mode_router.decide(payload.message, payload.mode)
    provider_label = llm_provider.provider_name()

    try:
        state = load_session_state(session_id=session_id, user_id=user_id)

        context_blocks: List[str] = []
        citations: List[Dict[str, Any]] = []

        if mode == "doc_rag":
            cached_chunks = get_rag_cache(user_id=user_id, query=payload.message)
            if isinstance(cached_chunks, list):
                chunks = cached_chunks
            else:
                chunks = retrieve_ai_search.retrieve(payload.message, user_id, top_k=5)
                if chunks:
                    set_rag_cache(user_id=user_id, query=payload.message, value=chunks)
            for chunk in chunks or []:
                if not isinstance(chunk, dict):
                    continue
                text = chunk.get("text")
                if isinstance(text, str) and text.strip():
                    context_blocks.append(text.strip())
                citations.append({"source": chunk.get("source") or "ai_search", "url": chunk.get("url")})

        if mode == "db_rag":
            context_text, row_meta = retrieve_postgres.retrieve_db(payload.message, user_id)
            if context_text:
                context_blocks.append(context_text)
            for row in row_meta:
                if isinstance(row, dict):
                    citations.append({"source": row.get("__table") or "postgres", "url": None})

        history = state.get("history") if isinstance(state.get("history"), list) else []
        history = history[-8:]

        messages: List[Dict[str, Any]] = [
            {
                "role": "system",
                "content": _build_context_messages(mode=mode, context_blocks=context_blocks, attachments=payload.attachments),
            }
        ]
        for msg in history:
            if isinstance(msg, dict) and msg.get("role") in {"user", "assistant"}:
                content = msg.get("content")
                if isinstance(content, str):
                    messages.append({"role": msg["role"], "content": content})
        messages.append({"role": "user", "content": payload.message})

        try:
            llm_result = llm_provider.chat(messages=messages, json_schema=_response_schema())
        except Exception as exc:
            logger.error("chat_hub: provider first pass failed, using fallback: %s", exc)
            llm_result = {"assistant_message": "", "tool_calls": [], "citations": []}
        assistant_message = (llm_result.get("assistant_message") or "").strip()
        tool_calls = _normalize_tool_calls(llm_result.get("tool_calls"))
        citations.extend(_normalize_citations(llm_result.get("citations")))

        if not tool_calls:
            tool_calls = _fallback_tool_calls(payload, mode)

        tool_results: List[Dict[str, Any]] = []
        final_message = assistant_message or "?챙짼??챙짼챘짝짭?챙쨉?챘짚."
        if tool_calls:
            tool_results = execute_tool_calls(tool_calls, session_id=session_id, user_id=user_id)
            messages.append(
                {
                    "role": "assistant",
                    "content": json.dumps(
                        {"assistant_message": final_message, "tool_calls": tool_calls},
                        ensure_ascii=False,
                    ),
                }
            )
            for tr in tool_results:
                messages.append(
                    {
                        "role": "tool",
                        "content": json.dumps(
                            {"name": tr.get("name"), "status": tr.get("status"), "result": tr.get("result")},
                            ensure_ascii=False,
                        ),
                    }
                )

            try:
                second_pass = llm_provider.chat(messages=messages, json_schema=_response_schema())
            except Exception as exc:
                logger.error("chat_hub: provider second pass failed, using tool summary fallback: %s", exc)
                second_pass = {"assistant_message": "", "tool_calls": [], "citations": []}
            second_message = (second_pass.get("assistant_message") or "").strip()
            if second_message:
                final_message = second_message
            else:
                tool_summary = " ".join(
                    str((item.get("result") or {}).get("summary") or "").strip()
                    for item in tool_results
                    if isinstance(item, dict)
                ).strip()
                if tool_summary:
                    final_message = tool_summary
            citations.extend(_normalize_citations(second_pass.get("citations")))

        eft_script = None
        for tr in tool_results:
            result = tr.get("result") if isinstance(tr.get("result"), dict) else {}
            if isinstance(result, dict) and isinstance(result.get("eft_script"), dict):
                eft_script = result.get("eft_script")
                break

        new_history = history + [
            {"role": "user", "content": payload.message},
            {"role": "assistant", "content": final_message},
        ]
        state["history"] = new_history[-20:]
        state["mode"] = mode
        state["history_summary"] = final_message[:300]
        state["last_tool"] = tool_results[-1]["name"] if tool_results else None
        state["recent_tools"] = [tr.get("name") for tr in tool_results if isinstance(tr.get("name"), str)][-5:]
        state["user_id"] = user_id
        save_session_state(session_id=session_id, state=state)

        logger.info("chat_hub: session=%s mode=%s provider=%s", session_id, mode, provider_label)

        return {
            "assistant_message": final_message,
            "citations": _normalize_citations(citations),
            "tool_calls": tool_calls,
            "debug": {"provider": provider_label, "mode": mode},
            "session_id": session_id,
            # Backward compatibility for existing UI callers.
            "response": final_message,
            "actions": tool_results,
            "eft_script": eft_script,
        }

    except Exception as exc:
        logger.exception(
            "chat_hub failed: session=%s mode=%s provider=%s err=%s",
            session_id,
            mode,
            provider_label,
            exc,
        )
        safe_message = "?챙짼 챙짼챘짝짭 챙짚??짚챘짜챗째 챘째챙?챙쨉?챘짚. ?챙 ???짚챙 ?챘??챙짙쩌챙쨍??"
        return JSONResponse(
            status_code=500,
            content={
                "assistant_message": safe_message,
                "citations": [],
                "tool_calls": [],
                "debug": {"provider": provider_label, "mode": mode},
                "session_id": session_id,
                "response": safe_message,
                "actions": [],
            },
        )

