# backend/services/notion_service.py

"""
Notion 감정 기록 서비스
STRICT6 감정 인테이크 + EFT/호흡 개입 전후 강도를 Notion 데이터베이스에 저장
"""

import httpx
import os
from datetime import datetime
from typing import Optional, Dict, Any
from backend.models.chat_models import StrictIntakeInput

NOTION_API_KEY = os.getenv("NOTION_API_KEY")
NOTION_DATABASE_ID = os.getenv("NOTION_DATABASE_ID")

headers = {
    "Authorization": f"Bearer {NOTION_API_KEY}",
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28"
}

async def create_emotion_page(
    user_email: str,
    strict_intake: StrictIntakeInput,
    intensity_after: int,
    solution: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    STRICT6 감정 인테이크 + 개입 전후 강도를 Notion 데이터베이스에 저장

    Args:
        user_email: 사용자 이메일
        strict_intake: STRICT6 감정 인테이크 데이터 (intensity = intensity_before)
        intensity_after: EFT/호흡 개입 후 감정 강도 (0-10)
        solution: AI가 제안한 솔루션 (선택)

    Returns:
        Notion API 응답 (성공 시) 또는 None (실패 시)
    """

    # 환경변수 검증
    if not NOTION_API_KEY or not NOTION_DATABASE_ID:
        print("❌ NOTION_API_KEY 또는 NOTION_DATABASE_ID가 설정되지 않았습니다.")
        return None

    # intensity_before는 strict_intake.intensity
    intensity_before = strict_intake.intensity

    # delta 계산 (개입으로 인한 강도 변화)
    delta_intensity = intensity_before - intensity_after

    # Notion 페이지 생성 URL
    url = "https://api.notion.com/v1/pages"

    # Notion 페이지 payload 구성
    payload = {
        "parent": {"database_id": NOTION_DATABASE_ID},
        "properties": {
            # ===== 기본 정보 =====
            "이름": {  # 제목 컬럼 (title 타입 필수)
                "title": [{"text": {"content": f"{user_email}의 감정 기록"}}]
            },
            "날짜": {
                "date": {"start": datetime.now().isoformat()}
            },

            # ===== STRICT6 필드들 (8개) =====
            "핵심감정": {
                "rich_text": [{"text": {"content": strict_intake.core_emotion}}]
            },
            "상황맥락": {
                "rich_text": [{"text": {"content": strict_intake.situation_context}}]
            },
            "자동사고": {
                "rich_text": [{"text": {"content": strict_intake.automatic_thought}}]
            },
            "신체감각": {
                "rich_text": [{"text": {"content": strict_intake.physical_sensation or "기록 없음"}}]
            },
            "행동반응": {
                "rich_text": [{"text": {"content": strict_intake.behavioral_reaction or "기록 없음"}}]
            },
            "사용가능시간": {
                "number": strict_intake.available_time if strict_intake.available_time else None
            },
            "즉시목표": {
                "rich_text": [{"text": {"content": strict_intake.immediate_goal or "기록 없음"}}]
            },

            # ===== 강도 필드들 (핵심!) =====
            "개입전강도": {
                "number": intensity_before
            },
            "개입후강도": {
                "number": intensity_after
            },
            "강도변화": {
                "number": delta_intensity
            },

            # ===== AI 솔루션 =====
            "AI솔루션": {
                "rich_text": [{"text": {"content": solution or "솔루션 없음"}}]
            }
        },

        # 페이지 본문 (children 블록)
        "children": [
            {
                "object": "block",
                "type": "heading_2",
                "heading_2": {
                    "rich_text": [{"text": {"content": "📊 개입 효과 분석"}}]
                }
            },
            {
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [
                        {"text": {"content": f"• 개입 전 강도: {intensity_before}/10\n"}},
                        {"text": {"content": f"• 개입 후 강도: {intensity_after}/10\n"}},
                        {"text": {"content": f"• 강도 변화: {delta_intensity} (", "annotations": {"bold": True}}},
                        {"text": {"content": "개선됨" if delta_intensity > 0 else "변화없음" if delta_intensity == 0 else "악화됨",
                         "annotations": {"color": "green" if delta_intensity > 0 else "gray" if delta_intensity == 0 else "red"}}},
                        {"text": {"content": ")", "annotations": {"bold": True}}}
                    ]
                }
            },
            {
                "object": "block",
                "type": "divider",
                "divider": {}
            },
            {
                "object": "block",
                "type": "heading_2",
                "heading_2": {
                    "rich_text": [{"text": {"content": "💭 자동사고 분석"}}]
                }
            },
            {
                "object": "block",
                "type": "quote",
                "quote": {
                    "rich_text": [{"text": {"content": strict_intake.automatic_thought}}]
                }
            },
            {
                "object": "block",
                "type": "heading_2",
                "heading_2": {
                    "rich_text": [{"text": {"content": "💊 AI 솔루션"}}]
                }
            },
            {
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [{"text": {"content": solution or "솔루션이 제공되지 않았습니다."}}]
                }
            }
        ]
    }

    # Notion API 호출
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=payload, headers=headers)

            if response.status_code == 200:
                print(f"✅ Notion 페이지 생성 성공: {user_email} | 강도 {intensity_before}→{intensity_after} (Δ{delta_intensity})")
                return response.json()
            else:
                print(f"❌ Notion 저장 실패 (HTTP {response.status_code}): {response.text}")
                return None

    except Exception as e:
        print(f"❌ Notion API 호출 예외: {e}")
        return None