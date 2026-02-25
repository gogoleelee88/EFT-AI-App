from __future__ import annotations

import os
from typing import Any, Dict, List

import httpx

from utils.logger import get_logger

logger = get_logger(__name__)


def _build_search_url() -> str:
    endpoint = (os.getenv("AZURE_AI_SEARCH_ENDPOINT") or "").strip().rstrip("/")
    index_name = (os.getenv("AZURE_AI_SEARCH_INDEX") or "").strip()
    api_version = (os.getenv("AZURE_AI_SEARCH_API_VERSION") or "2023-11-01").strip()
    if not endpoint or not index_name:
        return ""
    return f"{endpoint}/indexes/{index_name}/docs/search?api-version={api_version}"


def retrieve(query: str, user_id: str, top_k: int = 5) -> List[Dict[str, Any]]:
    search_key = (os.getenv("AZURE_AI_SEARCH_KEY") or "").strip()
    search_url = _build_search_url()

    if not search_key or not search_url:
        logger.info("chat_hub: AI Search config is missing, returning empty doc chunks.")
        return []

    payload = {
        "search": query,
        "top": max(1, min(top_k, 20)),
        "queryType": "simple",
    }
    headers = {"Content-Type": "application/json", "api-key": search_key}

    try:
        with httpx.Client(timeout=float(os.getenv("RAG_HTTP_TIMEOUT", "20"))) as client:
            response = client.post(search_url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
    except Exception as exc:
        logger.error("chat_hub: AI Search retrieve failed: %s", exc)
        return []

    rows = data.get("value") if isinstance(data, dict) else []
    if not isinstance(rows, list):
        return []

    chunks: List[Dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        text = (
            row.get("text")
            or row.get("content")
            or row.get("chunk")
            or row.get("body")
            or ""
        )
        if not isinstance(text, str) or not text.strip():
            continue
        chunks.append(
            {
                "text": text.strip(),
                "source": row.get("source") or row.get("title") or "ai_search",
                "score": float(row.get("@search.score") or 0.0),
                "url": row.get("url") or row.get("source_url"),
            }
        )

    return chunks


