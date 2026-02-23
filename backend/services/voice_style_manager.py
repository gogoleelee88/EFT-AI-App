"""
Hybrid Pacing Engine: ?짭챙짤???짚챙챗째??챙짼쨈 ?째챙쨈??face_data)???째챘쩌
TTS(Qwen3-TTS/CosyVoice) ?짚챠??쩌횂쨌챙?챘? 챗짼째챙?챘 VoiceStyleManager.

챗쨌챙쨔: R1 Cooldown, R2 Hysteresis(Calm 챙짠챙/?쨈챠), R3 Quality Gating, R4 Emotional Acting Limit(MVP).
"""
from __future__ import annotations

import time
from typing import Any, Dict, Literal, Optional

from backend.domain_types.voice_schema import FaceData, TTSConfig

# ?쨍챙챘쨀?VoiceStyleManager 챙쨘챙 (?챠 ?챙???. 챙쨉챘? 500 ?쨍챙.
_SESSION_MANAGERS: Dict[str, VoiceStyleManager] = {}
_MAX_SESSION_CACHE = 500

# --- ?챙 (R1, R2, R4) ---
COOLDOWN_SEC = 15.0
CALM_ENTRY_THRESHOLD = 0.20
CALM_ENTRY_DURATION_SEC = 3.0
CALM_EXIT_THRESHOLD = 0.12
CALM_EXIT_DURATION_SEC = 8.0
QUALITY_MIN = 0.5
HEART_RATE_CONFIDENCE_MIN = 0.4
SPEED_SMOOTH_MIN = 0.95
SPEED_SMOOTH_MAX = 1.05
SPEED_NEUTRAL = 1.0
SPEED_CALM = 0.8
SPEED_AWAKE = 1.1
PERCLOS_AWAKE_THRESHOLD = 0.6

StyleState = Literal["neutral", "calm", "awake"]


class VoiceStyleManager:
    """
    ?짚챙챗째?face_data챘짜?챘째챙 TTSConfig(style, instruction, speed)챘짜?챘째챠?챘 ?챠 챘짢쨍챙.
    R1~R4 챗쨌챙쨔??챙짚?챠??챙짹챠째챘짠챗쨀쩌 챗쨍챗짼짤??챘쨀?챘? 챘째짤챙??챘짚.
    """

    def __init__(self) -> None:
        self._current_style: StyleState = "neutral"
        self._last_change_time: float = 0.0
        self._last_speed: float = SPEED_NEUTRAL
        # [R2] Hysteresis: Calm 챙짠챙/?쨈챠 챙징째챗짹쨈 챙짠???챗째 챙쨋챙
        self._calm_entry_since: Optional[float] = None
        self._calm_exit_since: Optional[float] = None

    def determine_style(self, face_data: FaceData) -> TTSConfig:
        """
        ?챙짭 face_data챘징?TTS ?짚챠??쩌횂쨌챙?챘? 챗짼째챙?챘짚.
        ?쨍챙쨋 ?챙??face_data.timestamp챘짜?챗쨍째챙??쩌챘징 R1~R4챘짜??챙짤?챘짚.
        """
        t = face_data.timestamp

        # [R3] Quality Gating ???째챙쨈???챘짖째????쩌챘짤?챘짭쨈챙징째챗짹?Neutral, ?챘??0.95~1.05 ?짚챘짭쨈??
        if face_data.quality < QUALITY_MIN or face_data.heart_rate_confidence < HEART_RATE_CONFIDENCE_MIN:
            smoothed = max(
                SPEED_SMOOTH_MIN,
                min(SPEED_SMOOTH_MAX, self._last_speed),
            )
            self._last_speed = smoothed
            return TTSConfig(
                style="neutral",
                instruction="neutral tone",
                speed=smoothed,
            )

        # [R1] Cooldown Check ???짚챠????챘 챘쨀챗짼???챙쨉챙 15챙쨈챗째 챘쨀챗짼?챗쨍챙?
        if t - self._last_change_time < COOLDOWN_SEC:
            return self._build_config_for_state(self._current_style)

        # [R2] Hysteresis ??Calm 챙짠챙(>0.20, 3챙쨈?/?쨈챠(<0.12, 8챙쨈? 챘짭쨍챠짹횂쨌챙짠?챙챗째??챙짤
        desired = self._compute_desired_state(face_data, t)
        if desired != self._current_style:
            self._current_style = desired
            self._last_change_time = t
            self._calm_entry_since = None
            self._calm_exit_since = None

        # [R4] Emotional Acting Limit (MVP): ?짚횂쨌챙?챘짠 ?짭챙짤 (?챙???짢챘짝쩌 ???째챗쨍째 ?챙)
        config = self._build_config_for_state(self._current_style)
        self._last_speed = config.speed
        return config

    def _compute_desired_state(self, face_data: FaceData, t: float) -> StyleState:
        """[R2] Calm 챙짠챙(3챙쨈?/?쨈챠(8챙쨈? ?챙짚?챘짝짭?챙짚 ?챙짤 ?? Calm / Awake / Neutral 챙짚??챘 챘째챠."""
        delta = face_data.tension_delta
        perclos = face_data.perclos

        if self._current_style == "calm":
            # Calm ?쨈챠: tension_delta < 0.12 챗째 8챙쨈??쨈챙 챙짠????Neutral
            if delta < CALM_EXIT_THRESHOLD:
                if self._calm_exit_since is None:
                    self._calm_exit_since = t
                if t - self._calm_exit_since >= CALM_EXIT_DURATION_SEC:
                    return "neutral"
            else:
                self._calm_exit_since = None
            return "calm"

        # ?챙짭 Neutral ?챘 Awake ??Calm 챙짠챙 챗짼?? tension_delta > 0.20 ??3챙쨈??쨈챙
        if delta > CALM_ENTRY_THRESHOLD:
            if self._calm_entry_since is None:
                self._calm_entry_since = t
            if t - self._calm_entry_since >= CALM_ENTRY_DURATION_SEC:
                return "calm"
        else:
            self._calm_entry_since = None

        # [R4] Awake: perclos > 0.6 ?쨈챘짤쨈 clear and energetic (?챙짚?챘짝짭?챙짚 ?챙)
        if perclos > PERCLOS_AWAKE_THRESHOLD:
            return "awake"
        return "neutral"

    def _build_config_for_state(self, state: StyleState) -> TTSConfig:
        """[R4] Emotional Acting Limit: Calm(0.8/soothing), Awake(1.1/energetic), Neutral(1.0)."""
        if state == "calm":
            return TTSConfig(
                style="calm",
                instruction="calm and soothing tone",
                speed=SPEED_CALM,
            )
        if state == "awake":
            return TTSConfig(
                style="awake",
                instruction="clear and energetic tone",
                speed=SPEED_AWAKE,
            )
        return TTSConfig(
            style="neutral",
            instruction="neutral tone",
            speed=SPEED_NEUTRAL,
        )


def face_data_from_intake_dict(
    d: Optional[Dict[str, Any]],
    timestamp: Optional[float] = None,
) -> Optional[FaceData]:
    """
    intake.face_data(dict)챘짜?FaceData챘징?챘쨀?? ???챙쩌챘짤?챗쨍째챘쨀쨍챗째??짭챙짤.
    d챗째 None/챘쨔?dict?쨈챗짹째???챙 ?짚챗? ?챙쩌챘짤?None 챘째챠(?쨍챙쨋챘쨋?챙 TTS ?짚챠???챘짱쨍챙??.
    """
    if not d or not isinstance(d, dict):
        return None
    ts = timestamp if timestamp is not None else time.time()
    try:
        return FaceData(
            tension_delta=float(d.get("tension_delta", 0.0)),
            heart_rate=int(d.get("heart_rate", 72)),
            heart_rate_confidence=float(d.get("heart_rate_confidence", 0.5)),
            perclos=float(d.get("perclos", 0.0)),
            quality=float(d.get("quality", 1.0)),
            timestamp=float(d.get("timestamp", ts)),
        )
    except (TypeError, ValueError):
        return None


def get_voice_style_manager(session_id: str) -> VoiceStyleManager:
    """?쨍챙챘쨀?VoiceStyleManager 챘째챠(챙쨘챙). ?쨍챙 ?챗? MAX 챙쨈챗쨀쩌 ???짚챘????짧짤 ?챗짹째."""
    global _SESSION_MANAGERS
    if session_id not in _SESSION_MANAGERS:
        if len(_SESSION_MANAGERS) >= _MAX_SESSION_CACHE:
            # 챗째???짚챘?????챘 ?챗짹째 (dict ?쩍챙 ?챙 ?챙? ??3.7+)
            first_key = next(iter(_SESSION_MANAGERS))
            del _SESSION_MANAGERS[first_key]
        _SESSION_MANAGERS[session_id] = VoiceStyleManager()
    return _SESSION_MANAGERS[session_id]


# ---------------------------------------------------------------------------
# Integration: Chunk Loop?챙 ?쨍챙쨋 ?챙 (챙짙쩌챙)
# ---------------------------------------------------------------------------
#
# from backend.domain_types.voice_schema import FaceData, TTSConfig
# from backend.services.voice_style_manager import VoiceStyleManager
#
# # ???쨍챙????챘짼??챙짹 (?챘 ?챙징쨈??챙짙쩌챙)
# voice_style_manager = VoiceStyleManager()
#
# # Chunk Loop (?? Guidance generate 챙짠챠, ?챘 400ms ?챠챘짠?챘짙짢챠 ??
# def on_face_data_received(face_dict: dict, chunk_captions: list[dict]) -> None:
#     """?챘징?쨍챙???챗쨍쨈 face_data(dict)? ?챙짭 Chunk ?챘짠??챘째챙 TTS ?챘쩌챘짱쨍챠째 챗짼째챙."""
#     try:
#         face_data = FaceData(
#             tension_delta=face_dict.get("tension_delta", 0.0),
#             heart_rate=int(face_dict.get("heart_rate", 72)),
#             heart_rate_confidence=float(face_dict.get("heart_rate_confidence", 0.5)),
#             perclos=float(face_dict.get("perclos", 0.0)),
#             quality=float(face_dict.get("quality", 1.0)),
#             timestamp=face_dict.get("timestamp", __import__("time").time()),
#         )
#     except Exception:
#         return  # 챗쨍째챘쨀쨍챗째??챙? ?챘 ?짚챠쨉
#
#     tts_config: TTSConfig = voice_style_manager.determine_style(face_data)
#
#     # ?짚챙 ?짢챗쨀: CosyVoice/TTS ?쨍챙쨋 ??tts_config.instruction, tts_config.speed ?챘짭
#     # Volume 80% ?짹챙? ?쨈챘쩌?쨈챙쨍?쨍챙??speed/instruction 챘짤챠?? ?짢챗쨩 챙짼챘짝짭
#     for cap in chunk_captions:
#         # synthesize( cap["text"], instruction=tts_config.instruction, speed=tts_config.speed )
#         pass

