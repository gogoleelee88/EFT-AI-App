"""
TTS(Voice) 스타일 제어용 계약 타입.
Qwen3-TTS(CosyVoice) Hybrid Pacing Engine 입력/출력 스키마.
"""
from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field


class FaceData(BaseModel):
    """실시간 생체(얼굴) 데이터 스키마. VoiceStyleManager 입력용."""

    tension_delta: float = Field(..., description="긴장도 변화량 (baseline 대비)")
    heart_rate: int = Field(..., ge=0, description="심박수 BPM")
    heart_rate_confidence: float = Field(..., ge=0.0, le=1.0, description="심박수 신뢰도 (0.0~1.0)")
    perclos: float = Field(..., ge=0.0, le=1.0, description="졸음 척도 (0~1)")
    quality: float = Field(..., ge=0.0, le=1.0, description="얼굴 검출 품질 (0.0~1.0)")
    timestamp: float = Field(..., description="현재 시간 (seconds, e.g. time.time())")


class TTSConfig(BaseModel):
    """TTS 재생 설정. CosyVoice 스타일·속도 제어 출력."""

    style: Literal["neutral", "calm", "awake"] = Field(
        default="neutral",
        description="현재 적용된 스타일 (R4: MVP는 tone/speed만 사용)",
    )
    instruction: str = Field(
        default="neutral tone",
        description="CosyVoice용 톤 지시 (calm and soothing / clear and energetic / neutral)",
    )
    speed: float = Field(
        default=1.0,
        ge=0.5,
        le=2.0,
        description="재생 속도 배율 (0.8=Calm, 1.0=Neutral, 1.1=Awake). Volume은 클라이언트 처리.",
    )
