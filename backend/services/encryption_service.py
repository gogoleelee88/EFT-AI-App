from __future__ import annotations

import base64
import os
from typing import Tuple

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from config.settings import get_settings


class EncryptionService:
    """
    Notion ?í° ?±ì AES-256-GCM?¼ë¡ ?í¸??ë³µí¸?í???í¸ë¦¬í°.
    ?¤ë settings.ENCRYPTION_KEY?ì ê°?¸ì¨??
    """

    def __init__(self) -> None:
        self._raw_key = self._load_key()
        self._aes = AESGCM(self._raw_key)

    def _load_key(self) -> bytes:
        settings = get_settings()
        key_str = settings.ENCRYPTION_KEY or os.getenv("ENCRYPTION_KEY")
        if not key_str:
            raise RuntimeError("ENCRYPTION_KEY ?ê²½ë³?ê? ?¤ì?ì? ?ì?µë?? AES-256-GCM ?¤ê? ?ì?©ë??")

        # base64 ë¡??¤ì´??ê²½ì° ë¨¼ì? ?ë
        try:
            key = base64.b64decode(key_str)
            if len(key) == 32:
                return key
        except Exception:
            pass

        # hex ?ë ?¼ë° ë¬¸ì?´ì¸ ê²½ì°
        if len(key_str) == 64:
            try:
                key = bytes.fromhex(key_str)
                if len(key) == 32:
                    return key
            except Exception:
                pass

        # ë§ì?ë§ì¼ë¡?utf-8 bytes ì§ì ?¬ì© (32ë°ì´???ì)
        key = key_str.encode("utf-8")
        if len(key) != 32:
            raise RuntimeError("ENCRYPTION_KEY??32ë°ì´??256bit) ?¤ì¬???©ë??")
        return key

    def encrypt_to_base64(self, plaintext: str) -> str:
        nonce = os.urandom(12)
        ct = self._aes.encrypt(nonce, plaintext.encode("utf-8"), associated_data=None)
        payload = nonce + ct
        # base64.b64encode(payload) -> bytes, ?´ë? ë°ë¡ ASCII ë¬¸ì?´ë¡ ?ì½??        return base64.b64encode(payload).decode("ascii")

    def decrypt_from_base64(self, token: str) -> str:
        data = base64.b64decode(token)
        nonce, ct = data[:12], data[12:]
        pt = self._aes.decrypt(nonce, ct, associated_data=None)
        return pt.decode("utf-8")


_enc_service: EncryptionService | None = None


def get_encryption_service() -> EncryptionService:
    global _enc_service
    if _enc_service is None:
        _enc_service = EncryptionService()
    return _enc_service


