from __future__ import annotations

from uuid import uuid4

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from backend.core.request_context import reset_request_id, set_request_id


def _resolve_request_id(request: Request) -> str:
    for header_name in ("x-request-id", "x-correlation-id"):
        value = request.headers.get(header_name)
        if value and value.strip():
            return value.strip()
    return str(uuid4())


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = _resolve_request_id(request)
        token = set_request_id(request_id)
        try:
            response = await call_next(request)
            response.headers["X-Request-ID"] = request_id
            return response
        finally:
            reset_request_id(token)
