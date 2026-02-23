from __future__ import annotations

import asyncio
from collections import defaultdict

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from starlette.websockets import WebSocketState

from backend.app.services.auth_helpers import get_current_user_from_websocket
from backend.app.services.chat_service import message_to_dict, require_room_member, save_room_message
from backend.database import SessionLocal


router = APIRouter(tags=["chat-ws"])


class RoomSocketManager:
    def __init__(self) -> None:
        self._rooms: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, room_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._rooms[room_id].add(websocket)

    async def disconnect(self, room_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            if room_id in self._rooms:
                self._rooms[room_id].discard(websocket)
                if not self._rooms[room_id]:
                    self._rooms.pop(room_id, None)

    async def broadcast(self, room_id: str, payload: dict) -> None:
        async with self._lock:
            sockets = list(self._rooms.get(room_id, set()))

        stale: list[WebSocket] = []
        for socket in sockets:
            try:
                await socket.send_json(payload)
            except Exception:
                stale.append(socket)

        if stale:
            async with self._lock:
                for socket in stale:
                    self._rooms.get(room_id, set()).discard(socket)


manager = RoomSocketManager()


@router.websocket("/ws/chat/{room_id}")
async def ws_chat_room(websocket: WebSocket, room_id: str):
    db: Session = SessionLocal()
    connected = False
    current_user = None
    try:
        current_user = get_current_user_from_websocket(websocket=websocket, db=db)
        _ = require_room_member(db=db, room_id=room_id, user_id=current_user.id)

        await manager.connect(room_id=room_id, websocket=websocket)
        connected = True
        await manager.broadcast(
            room_id=room_id,
            payload={
                "type": "join",
                "member": {"user_id": current_user.id, "name": current_user.name},
            },
        )

        while True:
            payload = await websocket.receive_json()
            event_type = str(payload.get("type") or "").strip()

            if event_type == "message:new":
                text = str(payload.get("text") or "").strip()
                if not text:
                    continue

                message, sender = save_room_message(
                    db=db,
                    room_id=room_id,
                    sender_user_id=current_user.id,
                    text=text,
                )
                await manager.broadcast(
                    room_id=room_id,
                    payload={
                        "type": "message:new",
                        "message": message_to_dict(message=message, user=sender),
                    },
                )
                continue

            if event_type == "typing":
                await manager.broadcast(
                    room_id=room_id,
                    payload={
                        "type": "typing",
                        "member": {"user_id": current_user.id, "name": current_user.name},
                    },
                )
                continue

    except HTTPException:
        if websocket.application_state == WebSocketState.CONNECTING:
            await websocket.close(code=4403)
    except WebSocketDisconnect:
        pass
    except Exception:
        if websocket.application_state != WebSocketState.DISCONNECTED:
            await websocket.close(code=1011)
    finally:
        if connected:
            await manager.disconnect(room_id=room_id, websocket=websocket)
            if current_user is not None:
                await manager.broadcast(
                    room_id=room_id,
                    payload={
                        "type": "leave",
                        "member": {"user_id": current_user.id, "name": current_user.name},
                    },
                )
        db.close()


