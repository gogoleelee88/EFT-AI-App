# backend/clients/http.py
import asyncio
from typing import Optional
import httpx
from backend.config.settings import get_settings

settings = get_settings()
_TIMEOUT = settings.PREMIUM_REQUEST_TIMEOUT
_MAX_RETRIES = max(0, settings.PREMIUM_MAX_RETRIES)

async def _sleep(i: int):
    await asyncio.sleep(min(1.0 + i * 0.2, 2.0))

async def post_json(url: str, json: dict, headers: Optional[dict] = None, timeout: Optional[int] = None):
    t = timeout or _TIMEOUT
    last_exc = None
    for i in range(_MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=t) as client:
                r = await client.post(url, json=json, headers=headers)
                r.raise_for_status()
                return r.json()
        except Exception as e:
            last_exc = e
            if i >= _MAX_RETRIES:
                raise
            await _sleep(i)
    raise last_exc