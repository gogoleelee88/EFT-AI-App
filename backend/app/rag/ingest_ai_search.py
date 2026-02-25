from __future__ import annotations

import os
from typing import Any, Dict, List

from utils.logger import get_logger

logger = get_logger(__name__)


def ingest(files: List[Any], metadata: Dict[str, Any]) -> List[str]:
    """
    Placeholder for Azure AI Search ingestion.
    Current implementation keeps interface ready and logs intent.
    """
    endpoint = (os.getenv("AZURE_AI_SEARCH_ENDPOINT") or "").strip()
    index_name = (os.getenv("AZURE_AI_SEARCH_INDEX") or "").strip()
    key = (os.getenv("AZURE_AI_SEARCH_KEY") or "").strip()

    if not endpoint or not index_name or not key:
        logger.warning("chat_hub: AI Search ingest skipped due to missing configuration.")
        return []

    logger.info(
        "chat_hub: ingest_ai_search placeholder called (files=%s, metadata_keys=%s)",
        len(files or []),
        list((metadata or {}).keys()),
    )
    return []


