"""Notion emotion record service.

Stores STRICT intake data and before/after intensity into a Notion database.

- `create_emotion_page_with_token`: user workspace DB using OAuth access token
- `create_emotion_page`: legacy shared integration using env token/database
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import httpx

from models.chat_models import StrictIntakeInput
from utils.logger import get_logger


logger = get_logger(__name__)

NOTION_API_KEY = os.getenv("NOTION_API_KEY")
NOTION_DATABASE_ID = os.getenv("NOTION_DATABASE_ID")

BASE_HEADERS = {
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28",
}


def _build_payload(
    user_email: str,
    strict_intake: StrictIntakeInput,
    intensity_after: int,
    session_type: Optional[str],
    solution: Optional[str],
    database_id: str,
) -> Dict[str, Any]:
    intensity_before = strict_intake.intensity
    delta_intensity = intensity_before - intensity_after

    return {
        "parent": {"database_id": database_id},
        "properties": {
            "Name": {
                "title": [{"text": {"content": f"{user_email} - emotion checkin"}}]
            },
            "Created": {
                "date": {"start": datetime.now(timezone.utc).isoformat()}
            },
            "Core Emotion": {
                "rich_text": [{"text": {"content": strict_intake.core_emotion}}]
            },
            "Situation Context": {
                "rich_text": [{"text": {"content": strict_intake.situation_context}}]
            },
            "Automatic Thought": {
                "rich_text": [{"text": {"content": strict_intake.automatic_thought}}]
            },
            "Physical Sensation": {
                "rich_text": [
                    {
                        "text": {
                            "content": strict_intake.physical_sensation or "not specified"
                        }
                    }
                ]
            },
            "Behavioral Reaction": {
                "rich_text": [
                    {
                        "text": {
                            "content": strict_intake.behavioral_reaction or "not specified"
                        }
                    }
                ]
            },
            "Available Time": {
                "number": strict_intake.available_time if strict_intake.available_time else None
            },
            "Immediate Goal": {
                "rich_text": [
                    {
                        "text": {
                            "content": strict_intake.immediate_goal or "not specified"
                        }
                    }
                ]
            },
            "Intensity Before": {"number": intensity_before},
            "Intensity After": {"number": intensity_after},
            "Intensity Delta": {"number": delta_intensity},
            "AI Solution": {
                "rich_text": [
                    {
                        "text": {
                            "content": solution or "not specified"
                        }
                    }
                ]
            },
        },
        "children": [
            {
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [
                    {
                        "type": "text",
                        "text": {
                            "content": f"Session Type: {session_type or 'unspecified'}\\n"
                        },
                    },
                    {
                        "type": "text",
                        "text": {"content": f"Intensity before: {intensity_before}/10\\n"},
                    },
                    {
                        "type": "text",
                        "text": {"content": f"Intensity after: {intensity_after}/10\\n"},
                    },
                    {
                        "type": "text",
                        "text": {"content": f"Intensity delta: {delta_intensity} ("},
                        "annotations": {"bold": True},
                    },
                    {
                        "type": "text",
                        "text": {
                            "content": (
                                "Improved"
                                if delta_intensity > 0
                                else "No change"
                                if delta_intensity == 0
                                else "Worse"
                            )
                        },
                        "annotations": {
                            "color": (
                                "green"
                                if delta_intensity > 0
                                else "gray"
                                if delta_intensity == 0
                                else "red"
                            )
                        },
                    },
                    {
                        "type": "text",
                        "text": {"content": ")"},
                        "annotations": {"bold": True},
                    },
                ]
            },
            }
        ],
    }


async def create_emotion_page_with_token(
    access_token: str,
    database_id: str,
    user_email: str,
    strict_intake: StrictIntakeInput,
    intensity_after: int,
    session_type: Optional[str] = None,
    solution: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Save an emotion record to the caller-provided Notion database."""
    if not access_token or not database_id:
        logger.warning("Notion token/database not configured")
        return None

    payload = _build_payload(
        user_email=user_email,
        strict_intake=strict_intake,
        intensity_after=intensity_after,
        session_type=session_type,
        solution=solution,
        database_id=database_id,
    )
    headers = {**BASE_HEADERS, "Authorization": f"Bearer {access_token}"}

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.notion.com/v1/pages",
                json=payload,
                headers=headers,
            )

        if response.status_code == 200:
            return response.json()

        logger.error(
            "Notion save failed: status=%s body=%s",
            response.status_code,
            response.text[:500],
        )
        return None
    except Exception:
        logger.exception("Notion API call failed")
        return None


async def create_emotion_page(
    user_email: str,
    strict_intake: StrictIntakeInput,
    intensity_after: int,
    session_type: Optional[str] = None,
    solution: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Legacy shared Notion integration path (env token + env DB)."""
    if not NOTION_API_KEY or not NOTION_DATABASE_ID:
        logger.warning("NOTION_API_KEY/NOTION_DATABASE_ID not configured")
        return None

    return await create_emotion_page_with_token(
        access_token=NOTION_API_KEY,
        database_id=NOTION_DATABASE_ID,
        user_email=user_email,
        strict_intake=strict_intake,
        intensity_after=intensity_after,
        session_type=session_type,
        solution=solution,
    )

