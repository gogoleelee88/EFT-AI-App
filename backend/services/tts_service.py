"""
Zero-shot / Voice-cloning TTS ?ë¹???í¼.
Qwen-TTS (Alibaba Cloud DashScope) ê¸°ë° TTSë¥??¸ì¶?ë©°,
?ì ??mock ?¤ë???¤í¸ë¦¼ì¼ë¡??´ë°±?ë¤.
"""
from __future__ import annotations

import asyncio
import base64
import os
from typing import AsyncGenerator, Optional

import httpx

from config.settings import get_settings
from utils.logger import get_logger

logger = get_logger(__name__)
settings = get_settings()


DEFAULT_VOICE_PATH = "assets/voices/default_calm_guide.wav"


def get_reference_audio_path(voice_id: Optional[str]) -> str:
    """
    voice_id ê¸°ë° ?í¼?°ì¤ ?¤ë??ê²½ë¡ ë°í.
    - data/voices/{voice_id}/ref.wav ê° ?ì¼ë©?ê·¸ê²???¬ì©.
    - ?ì¼ë©?DEFAULT_VOICE_PATH ë¡??´ë°±.
    """
    if voice_id:
        candidate = os.path.join("data", "voices", voice_id, "ref.wav")
        if os.path.exists(candidate):
            return candidate
    # Fallback to default asset (?ì¤???¨ê³?ì??ì¡´ì¬?ì? ?ì??ë¬´ë°©)
    return DEFAULT_VOICE_PATH


class QwenTTSService:
    """
    Qwen-TTS / Qwen3-TTS-Flash HTTP API ?í¼.

    - DashScope REST ?ë?¬ì¸?¸ë? ì§ì ?¸ì¶?ë¤.
    - ë¹ëê¸?httpx ?´ë¼?´ì¸???¬ì© (event loop ë¸ë¡???ì).
    - ë°íê°ì? WAV ë°ì´?¸ë? ?¼ì ?¬ê¸° ì²?¬ë¡??ë¼ ?¤í¸ë¦¬ë°?ë¤.
    """

    def __init__(
        self,
        api_key: str,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        voice: Optional[str] = None,
        language_type: Optional[str] = None,
        timeout: Optional[float] = None,
    ) -> None:
        if not api_key:
            raise ValueError("Qwen TTS API key is required")

        # ê¸°ë³¸ê°ì? settings ?ì ê°?¸ì¤?? ëªì ?¸ìê° ?ì¼ë©??°ì
        self.api_key = api_key
        self.base_url = (base_url or settings.QWEN_TTS_BASE_URL).rstrip("/")
        self.model = model or settings.QWEN_TTS_MODEL
        self.voice = voice or settings.QWEN_TTS_VOICE
        self.language_type = language_type or settings.QWEN_TTS_LANGUAGE_TYPE
        self.timeout = timeout or float(settings.REQUEST_TIMEOUT)

    async def synthesize(
        self,
        text: str,
        voice_id: Optional[str] = None,
    ) -> AsyncGenerator[bytes, None]:
        """
        ?ì¤?¸ë? ë°ì Qwen-TTS ë¡??©ì±???¤ë??ë°ì´?¸ë? ?¤í¸ë¦¬ë°?ë¤.

        - voice_id ê° ì£¼ì´ì§ë©?Qwen TTS ??voice ?ë¼ë¯¸í°ë¡?ê·¸ë?ë¡??ë¬?ë¤.
          (?¥í Voice Cloning ?ë¡??ID ? ë§¤í ê°??
        """
        if not text.strip():
            logger.warning(
                "QwenTTSService.synthesize called with empty text; returning empty stream."
            )
            return

        try:
            audio_bytes = await self._fetch_tts_audio_bytes(
                text=text, voice_id=voice_id
            )
        except Exception as e:  # ?ì?ì ?´ë°± ì²ë¦¬?????ëë¡??ì¸ ?í
            logger.error("Qwen TTS synthesize failed before streaming: %s", e)
            raise

        # ì²?¬ ?¨ìë¡??ë???¤í¸ë¦¬ë°
        chunk_size = 4096
        for i in range(0, len(audio_bytes), chunk_size):
            # ?ì ???¬ê¸°???ì? ì§?°ì ?????ì (?¤í¸?í¬ ì§???ë??ì´??
            yield audio_bytes[i : i + chunk_size]

    async def _fetch_tts_audio_bytes(
        self,
        text: str,
        voice_id: Optional[str] = None,
    ) -> bytes:
        """
        DashScope Qwen-TTS REST API ë¥??¸ì¶?ì¬ ?ì±???¤ë???ì¼ ë°ì´?¸ë? ê°?¸ì¨??

        - ?°ì non-streaming ëª¨ëë¡??¸ì¶??audio.url ?ë audio.data ë¥??¬ì©?ë¤.
        """
        url = f"{self.base_url}/services/aigc/multimodal-generation/generation"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        # voice_id ê° Qwen ??voice ?´ë¦?????ì¼ë¯ë¡??°ì ?¬ì©, ?ì¼ë©?ê¸°ë³¸ voice
        voice = voice_id or self.voice

        payload = {
            "model": self.model,
            "input": {
                "text": text,
                "voice": voice,
                # ?êµ??ëªì ê°?´ë ì¤ì¬ ?ë¹?¤ì´ë¯ë¡?ê¸°ë³¸ê°ì? Korean
                "language_type": self.language_type,
            },
        }

        logger.info(
            "Qwen TTS request: model=%s voice=%s lang=%s text_preview=%s",
            self.model,
            voice,
            self.language_type,
            text[:50],
        )

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                resp = await client.post(url, headers=headers, json=payload)
            except httpx.RequestError as e:
                logger.error("Qwen TTS HTTP request error: %s", e)
                raise

            if resp.status_code != 200:
                # DashScope ê·ê²©: status_code / code / message
                try:
                    data = resp.json()
                except Exception:
                    data = {"raw": resp.text}
                logger.error(
                    "Qwen TTS API error: http_status=%s body=%s",
                    resp.status_code,
                    data,
                )
                raise RuntimeError(f"Qwen TTS API error: HTTP {resp.status_code}")

            data = resp.json()

            audio = (data.get("output") or {}).get("audio") or {}
            audio_data_b64 = audio.get("data")
            audio_url = audio.get("url")

            # 1) streaming ëª¨ëê° ?ë?ë¼??data ?ëê° ì±ì???ì ???ì¼ë¯ë¡??°ì ?ë
            if audio_data_b64:
                try:
                    return base64.b64decode(audio_data_b64)
                except Exception as e:
                    logger.error(
                        "Failed to decode Base64 audio from Qwen TTS: %s", e
                    )

            # 2) ?¼ë°?ì¸ non-streaming ëª¨ë: audio.url ?ì WAV ?ì¼ ?¤ì´ë¡ë
            if audio_url:
                try:
                    audio_resp = await client.get(audio_url)
                    audio_resp.raise_for_status()
                except Exception as e:
                    logger.error(
                        "Failed to download audio file from Qwen TTS url=%s error=%s",
                        audio_url,
                        e,
                    )
                    raise

                return audio_resp.content

        raise RuntimeError("Qwen TTS response missing both audio.data and audio.url")


async def _mock_stream(
    text: str,
    voice_id: Optional[str] = None,
) -> AsyncGenerator[bytes, None]:
    """
    ê¸°ì¡´ mock êµ¬í??ë¹ëê¸??ë?ì´?°ë¡ ë¶ë¦¬.

    - ?¤ì TTS ?¥ì ???´ë°±?©ì¼ë¡??¬ì©?ë¤.
    - ?ë¡???¤í¸ë¦¬ë° ?ì´?ë¼??ê°ë°?ë ê·¸ë?ë¡??ì© ê°??
    """
    ref_path = get_reference_audio_path(voice_id)
    logger.info(
        "TTS MOCK synthesize_stream called. voice_id=%s ref=%s text_preview=%s",
        voice_id,
        ref_path,
        text[:50],
    )

    dummy = f"[MOCK-AUDIO voice_id={voice_id or 'default'} text={text[:80]}...]".encode(
        "utf-8"
    )
    chunk_size = max(1, len(dummy) // 3)
    for i in range(0, len(dummy), chunk_size):
        # ?¤í¸?í¬/?©ì± ì§???ë??ì´??(event loop ì¹í??sleep)
        await asyncio.sleep(0.1)
        yield dummy[i : i + chunk_size]


async def synthesize_stream(
    text: str,
    voice_id: Optional[str] = None,
) -> AsyncGenerator[bytes, None]:
    """
    ?ì¤??+ voice_id(?í)ë¥?ë°ì ?¤ë??ë°ì´???¤í¸ë¦¼ì ?ì±?ë ë¹ëê¸??ë?ì´??

    - ê¸°ë³¸?ì¼ë¡?Qwen-TTS (qwen3-tts-flash)ë¥??¸ì¶??WAV ?¤ë?¤ë? ?¤í¸ë¦¬ë°?ë¤.
    - Qwen TTS ?¤ì?´ë ?¤í¸?í¬ ?¤ë¥ ë°ì ??ê¸°ì¡´ mock ?¤í¸ë¦¼ì¼ë¡??´ë°±?ë¤.
    - ê¸°ì¡´ ?¸ì¶ë¶??ê·¸ë?ë¡?synthesize_stream(...) ??StreamingResponse ???°ê²°?ë©´ ?ë¤.
    """
    api_key = settings.QWEN_TTS_API_KEY

    if not api_key:
        logger.warning(
            "Qwen TTS API key not configured; falling back to mock TTS stream."
        )
        async for chunk in _mock_stream(text=text, voice_id=voice_id):
            yield chunk
        return

    service = QwenTTSService(api_key=api_key)

    try:
        async for chunk in service.synthesize(text=text, voice_id=voice_id):
            yield chunk
    except Exception:
        logger.exception("Qwen TTS failed; falling back to mock TTS stream.")
        async for chunk in _mock_stream(text=text, voice_id=voice_id):
            yield chunk

