from __future__ import annotations

import asyncio
import json
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

import requests
import uvicorn
import websockets
from fastapi import FastAPI
from sqlalchemy.orm import Session

from backend.app.api.chat import chat_router
from backend.database import SessionLocal
from backend.models.user import User
from backend.services.auth_service import AuthService


BASE_URL = "http://127.0.0.1:8765"
WS_BASE = "ws://127.0.0.1:8765"


def jdump(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2)


def ensure_user(db: Session, *, user_id: str, email: str, firebase_uid: str, name: str) -> None:
    exists = db.query(User).filter(User.id == user_id).one_or_none()
    if exists:
        return
    user = User(
        id=user_id,
        email=email,
        firebase_uid=firebase_uid,
        name=name,
        level=1,
        xp=0,
        gems=50,
    )
    db.add(user)
    db.commit()


def wait_until_server_ready(timeout_sec: float = 20.0) -> None:
    start = time.time()
    while time.time() - start < timeout_sec:
        try:
            response = requests.get(f"{BASE_URL}/openapi.json", timeout=1.5)
            if response.status_code == 200:
                return
        except Exception:
            pass
        time.sleep(0.2)
    raise RuntimeError("server did not start in time")


async def ws_fail_attempt(url: str) -> dict[str, Any]:
    try:
        async with websockets.connect(url, open_timeout=3):
            return {"result": "unexpected_connected"}
    except Exception as exc:
        code = getattr(exc, "code", None)
        status_code = getattr(exc, "status_code", None)
        return {
            "result": "rejected",
            "exception_type": type(exc).__name__,
            "code": code,
            "status_code": status_code,
            "detail": str(exc),
        }


async def ws_success_roundtrip(url_owner: str, url_member: str) -> dict[str, Any]:
    async with websockets.connect(url_owner, open_timeout=3) as ws_owner:
        owner_first_raw = await asyncio.wait_for(ws_owner.recv(), timeout=3)
        async with websockets.connect(url_member, open_timeout=3) as ws_member:
            member_first_raw = await asyncio.wait_for(ws_member.recv(), timeout=3)
            owner_second_raw = await asyncio.wait_for(ws_owner.recv(), timeout=3)

            outbound = {"type": "message:new", "text": "hello from browserA live"}
            await ws_owner.send(json.dumps(outbound))

            member_after_raw = await asyncio.wait_for(ws_member.recv(), timeout=3)
            try:
                owner_after_raw = await asyncio.wait_for(ws_owner.recv(), timeout=1.5)
                owner_after = json.loads(owner_after_raw)
            except TimeoutError:
                owner_after = {"timeout": True}

            return {
                "owner_first": json.loads(owner_first_raw),
                "member_first": json.loads(member_first_raw),
                "owner_second": json.loads(owner_second_raw),
                "owner_after_send": owner_after,
                "member_after_send": json.loads(member_after_raw),
                "sent_payload": outbound,
            }


def main() -> None:
    app = FastAPI()
    app.include_router(chat_router)

    config = uvicorn.Config(app, host="127.0.0.1", port=8765, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    wait_until_server_ready()

    auth = AuthService()
    run_id = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    owner_id = str(uuid.uuid4())
    member_id = str(uuid.uuid4())
    outsider_id = str(uuid.uuid4())

    db = SessionLocal()
    try:
        ensure_user(
            db,
            user_id=owner_id,
            email=f"owner_live_{run_id}@example.com",
            firebase_uid=f"owner_live_{run_id}",
            name="BrowserA",
        )
        ensure_user(
            db,
            user_id=member_id,
            email=f"member_live_{run_id}@example.com",
            firebase_uid=f"member_live_{run_id}",
            name="BrowserB",
        )
        ensure_user(
            db,
            user_id=outsider_id,
            email=f"outsider_live_{run_id}@example.com",
            firebase_uid=f"outsider_live_{run_id}",
            name="Outsider",
        )
    finally:
        db.close()

    owner_token = auth.mint_token_pair(owner_id).access_token
    member_token = auth.mint_token_pair(member_id).access_token
    outsider_token = auth.mint_token_pair(outsider_id).access_token

    owner_cookies = {"access_token": owner_token}
    member_cookies = {"access_token": member_token}

    print("=== LIVE E2E PROOF START ===")

    create_req = {
        "name": f"proof-live-room-{run_id}",
        "defaults": {
            "relationship": "peer",
            "goal": "maintain",
            "image_goal": ["professional", "kind"],
            "banned_tones": ["blame", "emotional_outburst"],
            "default_send_policy": "prefer_calm",
            "language": "ko",
        },
    }
    create_res = requests.post(f"{BASE_URL}/api/chat/rooms", json=create_req, cookies=owner_cookies, timeout=10)
    create_json = create_res.json()
    room_id = create_json["room"]["id"]
    invite_token = create_json["invite_token"]
    print("[BrowserA] POST /api/chat/rooms status=", create_res.status_code)
    print(jdump(create_req))
    print(jdump(create_json))

    join_req = {"invite_token": invite_token}
    join_res = requests.post(f"{BASE_URL}/api/chat/rooms/join", json=join_req, cookies=member_cookies, timeout=10)
    print("[BrowserB] POST /api/chat/rooms/join status=", join_res.status_code)
    print(jdump(join_req))
    print(jdump(join_res.json()))

    fail1 = asyncio.run(ws_fail_attempt(f"{WS_BASE}/ws/chat/{room_id}"))
    print("[WS-FAIL-1] non-login ->", jdump(fail1))

    fail2 = asyncio.run(ws_fail_attempt(f"{WS_BASE}/ws/chat/{room_id}?auth={quote(outsider_token, safe='')}"))
    print("[WS-FAIL-2] logged-in but non-member ->", jdump(fail2))

    success = asyncio.run(
        ws_success_roundtrip(
            f"{WS_BASE}/ws/chat/{room_id}?auth={quote(owner_token, safe='')}",
            f"{WS_BASE}/ws/chat/{room_id}?auth={quote(member_token, safe='')}",
        )
    )
    print("[WS-SUCCESS] message:new roundtrip")
    print(jdump(success))

    coach_tests = [
        (
            "T1",
            {
                "room_id": room_id,
                "context": {
                    "relationship": "peer",
                    "goal": "deescalate",
                    "image_goal": ["professional", "kind"],
                    "banned_tones": ["blame", "emotional_outburst"],
                    "language": "ko",
                    "default_send_policy": "prefer_calm",
                },
                "message": {
                    "their_last_message": "Why are you late?",
                    "my_draft": "You always ruin schedule!! fix this now.",
                    "thread_summary": "deadline conflict",
                },
            },
        ),
        (
            "T2",
            {
                "room_id": room_id,
                "context": {
                    "relationship": "client",
                    "goal": "request",
                    "image_goal": ["professional", "firm_polite"],
                    "banned_tones": ["blame", "emotional_outburst"],
                    "language": "ko",
                    "default_send_policy": "prefer_fast",
                },
                "message": {
                    "their_last_message": "Can you send by today?",
                    "my_draft": "Thanks for your request. I can send it by 4 PM today.",
                    "thread_summary": "delivery timing",
                },
            },
        ),
        (
            "T3",
            {
                "room_id": room_id,
                "context": {
                    "relationship": "boss",
                    "goal": "refuse",
                    "image_goal": ["leaderlike", "firm_polite"],
                    "banned_tones": ["blame", "emotional_outburst"],
                    "language": "ko",
                    "default_send_policy": "prefer_boundary",
                },
                "message": {
                    "their_last_message": "Need weekend work again.",
                    "my_draft": "This weekend support is not possible. I can provide an alternative on Monday morning.",
                    "thread_summary": "extra work request",
                },
            },
        ),
    ]

    for label, req_body in coach_tests:
        res = requests.post(f"{BASE_URL}/api/coach/analyze", json=req_body, cookies=owner_cookies, timeout=10)
        print(f"[{label}] POST /api/coach/analyze status={res.status_code}")
        print(f"[{label}] REQUEST:")
        print(jdump(req_body))
        print(f"[{label}] RESPONSE:")
        print(jdump(res.json()))

    print("=== LIVE E2E PROOF END ===")
    print(f"ROOM_ID={room_id}")

    server.should_exit = True
    thread.join(timeout=5)


if __name__ == "__main__":
    main()
