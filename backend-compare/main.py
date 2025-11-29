import os, asyncio
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
import httpx

load_dotenv()
ENGINE_A = os.getenv("ENGINE_A", "http://127.0.0.1:8001/v1")
ENGINE_B = os.getenv("ENGINE_B", "http://127.0.0.1:8002/v1")

app = FastAPI()

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    model: Optional[str] = None
    messages: List[Message]
    max_tokens: Optional[int] = 512
    temperature: Optional[float] = 0.7
    top_p: Optional[float] = 1.0

async def call_engine(client: httpx.AsyncClient, base_url: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    r = await client.post(f"{base_url}/chat/completions", json=payload, timeout=120)
    r.raise_for_status()
    return r.json()

@app.get("/health")
async def health():
    return {"status": "ok", "engine_a": ENGINE_A, "engine_b": ENGINE_B}

@app.post("/compare")
async def compare(req: ChatRequest):
    payload = {
        "messages": [m.dict() for m in req.messages],
        "max_tokens": req.max_tokens,
        "temperature": req.temperature,
        "top_p": req.top_p,
    }
    async with httpx.AsyncClient() as client:
        try:
            res_a, res_b = await asyncio.gather(
                call_engine(client, ENGINE_A, {**payload, "model": "engine-a"}),
                call_engine(client, ENGINE_B, {**payload, "model": "engine-b"}),
            )
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Upstream error: {e}") from e

    def text(r: Dict[str, Any]) -> str:
        try:
            return r["choices"][0]["message"]["content"]
        except Exception:
            return ""

    ta, tb = text(res_a), text(res_b)
    return {
        "engine_a": {"model": "engine-a", "text": ta, "raw": res_a},
        "engine_b": {"model": "engine-b", "text": tb, "raw": res_b},
        "summary": f"A vs B length: {len(ta)} vs {len(tb)}"
    }
