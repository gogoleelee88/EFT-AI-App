# 사진 검증 서비스 - ChatGPT Vision API
import base64
import json
import os
from typing import Optional

from fastapi import UploadFile


def get_openai_client():
    """OpenAI 클라이언트 반환"""
    try:
        import openai

        api_key = os.getenv("OPENAI_API_KEY", "")
        if not api_key:
            raise ValueError("OPENAI_API_KEY not set")
        return openai.AsyncOpenAI(api_key=api_key)
    except Exception as e:
        print(f"⚠️  OpenAI 클라이언트 초기화 실패: {e}")
        return None


async def verify_photo_mission(
    image_file: UploadFile,
    requirement: str,
    ocr_keywords: Optional[list[str]] = None,
    objects_required: Optional[list[str]] = None,
) -> dict:
    """
    ChatGPT Vision API로 사진 검증

    Args:
        image_file: 업로드된 이미지 파일
        requirement: 필요한 것들 (예: "동그라미 + 펜 + 문제집")
        ocr_keywords: OCR 키워드 목록
        objects_required: 필요 객체 목록

    Returns:
        dict: {
            "passed": bool,
            "confidence": float,
            "detected_text": list[str],
            "detected_objects": list[str],
            "reason": str
        }
    """
    client = get_openai_client()
    if client is None:
        # 폴백: 항상 통과 (Vision API 없음)
        return {
            "passed": True,
            "confidence": 0.5,
            "detected_text": [],
            "detected_objects": [],
            "reason": "Vision API 미설정 - 자동 통과",
        }

    try:
        # 1. 이미지 Base64 인코딩
        image_data = await image_file.read()
        base64_image = base64.b64encode(image_data).decode()

        # 2. ChatGPT Vision 프롬프트 구성
        prompt = f"""이 사진이 다음 요구사항을 만족하는지 검증하세요:

요구사항: {requirement}
필요 키워드(OCR): {ocr_keywords or '없음'}
필요 객체: {objects_required or '없음'}

사진을 분석하여 다음 정보를 JSON으로 반환하세요:
{{
  "passed": true 또는 false,
  "confidence": 0.0~1.0 (확신 정도),
  "detected_text": ["사진에서 발견된 텍스트들"],
  "detected_objects": ["사진에서 발견된 객체들"],
  "reason": "검증 결과에 대한 한 줄 설명"
}}

판정 기준:
- passed: 요구사항을 충족하면 true
- confidence: 얼마나 확신하는지 (0.7 이상 권장)
- detected_text: OCR로 읽은 텍스트 (없으면 빈 배열)
- detected_objects: 객체 검출 결과 (펜, 책, 노트 등)
- reason: 한국어로 설명"""

        # 3. ChatGPT Vision API 호출
        response = await client.chat.completions.create(
            model="gpt-5.2",  # Vision 지원 모델
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"},
                        },
                    ],
                }
            ],
            response_format={"type": "json_object"},
            max_tokens=500,
            temperature=0.3,  # 일관성 있는 검증
        )

        result = json.loads(response.choices[0].message.content)
        return result

    except Exception as e:
        print(f"❌ ChatGPT Vision 검증 실패: {e}")
        # 폴백: 통과 처리 (엄격 모드는 추후 사용자 설정)
        return {
            "passed": True,
            "confidence": 0.3,
            "detected_text": [],
            "detected_objects": [],
            "reason": f"검증 중 오류 발생 - 자동 통과: {str(e)[:100]}",
        }
