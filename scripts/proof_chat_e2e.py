from __future__ import annotations

import json
import queue
import threading
import uuid
from datetime import datetime
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from starlette.websockets import WebSocketDisconnect

from backend.app.api.chat import chat_router
from backend.app.models.chat import ChatMessage
from backend.database import SessionLocal
from backend.models.user import User
from backend.services.auth_service import AuthService


def jprint(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2)


def ensure_user(db: Session, *, user_id: str, email: str, firebase_uid: str, name: str) -> None:
    user = db.query(User).filter(User.id == user_id).one_or_none()
    if user is None:
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


def recv_with_timeout(ws, timeout_sec: float = 3.0):
    q: "queue.Queue[tuple[str, Any]]" = queue.Queue()

    def _target():
        try:
            payload = ws.receive_json()
            q.put(("ok", payload))
        except Exception as exc:  # pragma: no cover
            q.put(("err", repr(exc)))

    thread = threading.Thread(target=_target, daemon=True)
    thread.start()
    thread.join(timeout_sec)
    if thread.is_alive():
        return {"timeout": True}

    status, payload = q.get()
    if status == "ok":
        return payload
    return {"error": payload}


def main() -> None:
    app = FastAPI()
    app.include_router(chat_router)
    client = TestClient(app)
    auth = AuthService()
    run_id = datetime.utcnow().strftime("%Y%m%d%H%M%S")

    owner_id = str(uuid.uuid4())
    member_id = str(uuid.uuid4())
    stranger_id = str(uuid.uuid4())

    db = SessionLocal()
    try:
        ensure_user(
            db,
            user_id=owner_id,
            email=f"owner_{run_id}@example.com",
            firebase_uid=f"owner_{run_id}",
            name="BrowserA",
        )
        ensure_user(
            db,
            user_id=member_id,
            email=f"member_{run_id}@example.com",
            firebase_uid=f"member_{run_id}",
            name="BrowserB",
        )
        ensure_user(
            db,
            user_id=stranger_id,
            email=f"stranger_{run_id}@example.com",
            firebase_uid=f"stranger_{run_id}",
            name="Stranger",
        )
    finally:
        db.close()

    owner_token = auth.mint_token_pair(owner_id).access_token
    member_token = auth.mint_token_pair(member_id).access_token
    stranger_token = auth.mint_token_pair(stranger_id).access_token

    print("=== E2E PROOF START ===")

    # Browser A creates room
    create_req = {
        "name": f"proof-room-{run_id}",
        "defaults": {
            "relationship": "peer",
            "goal": "maintain",
            "image_goal": ["professional", "kind"],
            "banned_tones": ["blame", "emotional_outburst"],
            "default_send_policy": "prefer_calm",
            "language": "ko",
        },
    }
    create_res = client.post("/api/chat/rooms", json=create_req, cookies={"access_token": owner_token})
    create_body = create_res.json()
    room_id = create_body["room"]["id"]
    invite_token = create_body["invite_token"]
    print("[BrowserA] POST /api/chat/rooms status=", create_res.status_code)
    print(jprint(create_req))
    print(jprint(create_body))

    # Browser B join by invite
    join_req = {"invite_token": invite_token}
    join_res = client.post("/api/chat/rooms/join", json=join_req, cookies={"access_token": member_token})
    print("[BrowserB] POST /api/chat/rooms/join status=", join_res.status_code)
    print(jprint(join_req))
    print(jprint(join_res.json()))

    # WS fail: non-login
    print("[WS-FAIL-1] non-login connect attempt")
    try:
        with client.websocket_connect(f"/ws/chat/{room_id}"):
            print("unexpected success")
    except WebSocketDisconnect as exc:
        print(f"WebSocketDisconnect code={exc.code}")

    # WS fail: logged-in but not joined
    print("[WS-FAIL-2] logged-in but non-member connect attempt")
    try:
        with client.websocket_connect(f"/ws/chat/{room_id}?auth={stranger_token}"):
            print("unexpected success")
    except WebSocketDisconnect as exc:
        print(f"WebSocketDisconnect code={exc.code}")

    # WS success + roundtrip
    print("[WS-SUCCESS] owner/member connect and message:new roundtrip")
    with client.websocket_connect(f"/ws/chat/{room_id}?auth={owner_token}") as ws_owner:
        owner_join_msg = ws_owner.receive_json()
        print("owner first event:", jprint(owner_join_msg))

        with client.websocket_connect(f"/ws/chat/{room_id}?auth={member_token}") as ws_member:
            member_first = ws_member.receive_json()
            owner_seen = ws_owner.receive_json()
            print("member first event:", jprint(member_first))
            print("owner sees member join:", jprint(owner_seen))

            outbound = {"type": "message:new", "text": "hello from browserA"}
            ws_owner.send_json(outbound)
            print("owner send:", jprint(outbound))

            owner_after_send = recv_with_timeout(ws_owner, timeout_sec=3.0)
            member_after_send = recv_with_timeout(ws_member, timeout_sec=3.0)
            print("owner after send:", jprint(owner_after_send))
            print("member after send:", jprint(member_after_send))

    # DB row check (via ORM snapshot)
    db = SessionLocal()
    try:
        rows = (
            db.query(ChatMessage.id, ChatMessage.room_id, ChatMessage.sender_user_id, ChatMessage.text, ChatMessage.created_at)
            .filter(ChatMessage.room_id == room_id)
            .order_by(ChatMessage.created_at.desc())
            .limit(3)
            .all()
        )
        print("[DB-ORM] latest chat_message rows:")
        print(
            jprint(
                [
                    {
                        "id": row.id,
                        "room_id": row.room_id,
                        "sender_user_id": row.sender_user_id,
                        "text": row.text,
                        "created_at": row.created_at.isoformat() if row.created_at else None,
                    }
                    for row in rows
                ]
            )
        )
    finally:
        db.close()

    # Coach T1~T3
    tests = [
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
                    "their_last_message": "왜 아직 안 보냈어요?",
                    "my_draft": "너 때문에 일정 다 망했어!! 당장 책임져.",
                    "thread_summary": "마감 이슈로 대화가 과열됨",
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
                    "their_last_message": "자료 오늘 가능해요?",
                    "my_draft": "요청 주신 자료는 오후 4시까지 전달드리겠습니다. 확인 부탁드립니다.",
                    "thread_summary": "일정 확인 대화",
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
                    "their_last_message": "이번 주말에도 추가 대응 부탁해요.",
                    "my_draft": "이번 주말 대응은 어렵습니다. 평일 오전에 대체안으로 조정 부탁드립니다.",
                    "thread_summary": "추가 근무 요청",
                },
            },
        ),
    ]

    for label, request_body in tests:
        res = client.post("/api/coach/analyze", json=request_body, cookies={"access_token": owner_token})
        print(f"[{label}] POST /api/coach/analyze status={res.status_code}")
        print(f"[{label}] REQUEST:")
        print(jprint(request_body))
        print(f"[{label}] RESPONSE:")
        print(jprint(res.json()))

    print("=== E2E PROOF END ===")
    print(f"ROOM_ID={room_id}")


if __name__ == "__main__":
    main()
