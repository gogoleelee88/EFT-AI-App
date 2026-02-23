from backend.app.routers.chat_rooms import router as chat_rooms_router
from backend.app.routers.chat_ws import router as chat_ws_router
from backend.app.routers.coach import router as coach_router

__all__ = [
    "chat_rooms_router",
    "chat_ws_router",
    "coach_router",
]


