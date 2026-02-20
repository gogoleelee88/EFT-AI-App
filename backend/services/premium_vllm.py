# backend/services/premium_vllm.py
import random
from typing import Literal, Tuple
from config.settings import get_settings
from clients.http import post_json

settings = get_settings()
EngineSel = Literal["A", "B", "AB"]

def pick_engine_url(sel: EngineSel) -> str:
    if sel == "A":
        return settings.VLLM_ENGINE_A_URL
    if sel == "B":
        return settings.VLLM_ENGINE_B_URL
    return random.choice([settings.VLLM_ENGINE_A_URL, settings.VLLM_ENGINE_B_URL])

def main_and_shadow(sel: EngineSel) -> Tuple[str, str]:
    main = pick_engine_url(sel)
    other = settings.VLLM_ENGINE_B_URL if main == settings.VLLM_ENGINE_A_URL else settings.VLLM_ENGINE_A_URL
    return main, other

async def call_vllm_chat(base_url: str, payload: dict) -> dict:
    url = base_url.rstrip("/") + "/v1/chat/completions"
    return await post_json(url, payload, headers={"Content-Type": "application/json"})
