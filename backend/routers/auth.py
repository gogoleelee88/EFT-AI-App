"""
Firebase ID Token -> backend verification -> JWT (httpOnly cookies)
"""

import logging
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
try:
    from prometheus_client import Counter as PromCounter
    from prometheus_client import REGISTRY
except Exception:  # pragma: no cover - metrics lib may be unavailable in some local envs
    PromCounter = None
    REGISTRY = None

from backend.database import get_db
from config.settings import get_settings
from services.auth_service import (
    AuthInvalidClaimsError,
    AuthInvalidTokenError,
    AuthProviderUnavailableError,
    AuthService,
    RefreshTokenExpiredError,
    RefreshTokenInvalidError,
    RefreshTokenRevokedError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])
_auth_service: Optional[AuthService] = None
_auth_metrics: Counter[str] = Counter()


def _build_prom_counter(name: str, doc: str, labelnames: tuple[str, ...] = ()):
    if PromCounter is None:
        return None
    try:
        return PromCounter(name, doc, labelnames=labelnames)
    except ValueError:
        collectors = getattr(REGISTRY, "_names_to_collectors", {}) if REGISTRY is not None else {}
        return collectors.get(name)


_PROM_COUNTER_PLAIN = {
    "login_attempt_total": _build_prom_counter("login_attempt_total", "Total login attempts"),
    "login_success_total": _build_prom_counter("login_success_total", "Total successful logins"),
}
_PROM_COUNTER_REASON = {
    "login_failure_total": _build_prom_counter(
        "login_failure_total",
        "Total login failures partitioned by reason",
        ("reason",),
    ),
    "refresh_failure_total": _build_prom_counter(
        "refresh_failure_total",
        "Total refresh failures partitioned by reason",
        ("reason",),
    ),
}
_PROM_COUNTER_TYPE = {
    "cookie_issue_total": _build_prom_counter(
        "cookie_issue_total",
        "Total cookie issuance issues partitioned by type",
        ("type",),
    )
}


def _get_auth_service() -> AuthService:
    global _auth_service
    if _auth_service is None:
        _auth_service = AuthService()
    return _auth_service


def _metric_inc(name: str, reason: Optional[str] = None) -> None:
    key = f"{name}:{reason}" if reason else name
    _auth_metrics[key] += 1

    if reason:
        reason_counter = _PROM_COUNTER_REASON.get(name)
        if reason_counter is not None:
            reason_counter.labels(reason=reason).inc()
            return
        type_counter = _PROM_COUNTER_TYPE.get(name)
        if type_counter is not None:
            type_counter.labels(type=reason).inc()
            return

    plain_counter = _PROM_COUNTER_PLAIN.get(name)
    if plain_counter is not None:
        plain_counter.inc()


def _request_id(request: Request) -> str:
    return (
        request.headers.get("x-request-id")
        or request.headers.get("x-correlation-id")
        or "-"
    )


def _raise_auth_http_error(status_code: int, code: str, detail: str) -> None:
    # Legacy-safe contract: detail stays string; structured code is in header.
    raise HTTPException(
        status_code=status_code,
        detail=detail,
        headers={"X-Error-Code": code},
    )


def _validate_id_token_or_400(id_token: str) -> str:
    token = (id_token or "").strip()
    if not token:
        _raise_auth_http_error(400, "missing_id_token", "id_token is required")
    if len(token) > 8192:
        _raise_auth_http_error(400, "id_token_too_large", "id_token too large")
    return token


class LoginRequest(BaseModel):
    id_token: str = Field(..., description="Firebase ID Token")


class UserResponse(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    photo_url: Optional[str] = None


class LoginResponse(BaseModel):
    success: bool
    user: UserResponse


class MeResponse(BaseModel):
    authenticated: bool
    user: Optional[UserResponse] = None


class RefreshResponse(BaseModel):
    success: bool


class UpdateProfileRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Display name")


def _first_header_value(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    head = value.split(",", 1)[0].strip()
    return head or None


def _request_host(request: Request) -> str:
    host = _first_header_value(request.headers.get("x-forwarded-host")) or _first_header_value(
        request.headers.get("host")
    )
    if not host:
        return ""
    return host.split(":", 1)[0].strip().lower()


def _request_is_secure(request: Request) -> bool:
    forwarded_proto = _first_header_value(request.headers.get("x-forwarded-proto"))
    if forwarded_proto:
        return forwarded_proto.lower() == "https"
    return (request.url.scheme or "").lower() == "https"


def _resolve_cookie_domain(request: Request) -> Optional[str]:
    settings = get_settings()
    configured = (settings.COOKIE_DOMAIN or "").strip()
    if not configured or configured.lower() == "localhost":
        return None

    # Keep auth cookies host-only when traffic comes through reverse proxies.
    if _first_header_value(request.headers.get("x-forwarded-host")):
        return None

    req_host = _request_host(request)
    normalized = configured.lstrip(".").lower()
    if req_host and req_host != normalized and not req_host.endswith(f".{normalized}"):
        logger.warning(
            "Ignoring COOKIE_DOMAIN=%s for host=%s to keep cookie first-party",
            configured,
            req_host,
        )
        return None
    return configured


def _cookie_options(request: Request, max_age: int) -> Dict[str, Any]:
    settings = get_settings()
    forwarded_proto = _first_header_value(request.headers.get("x-forwarded-proto"))

    secure = bool(settings.COOKIE_SECURE or _request_is_secure(request))
    # If proxy forwarded proto is present, treat it as canonical.
    if forwarded_proto is not None:
        secure = forwarded_proto.lower() == "https"

    # OAuth redirect compatibility on mobile browsers requires None+Secure.
    samesite = "none" if secure else "lax"

    return {
        "max_age": max_age,
        "httponly": True,
        "secure": secure,
        "samesite": samesite,
        "domain": _resolve_cookie_domain(request),
        "path": "/",
    }


def _set_cookie(request: Request, resp: Response, name: str, value: str, max_age: int) -> None:
    options = _cookie_options(request, max_age=max_age)
    logger.debug(
        "auth.cookie.set name=%s secure=%s samesite=%s httponly=%s domain=%s path=%s xfp=%s xfh=%s host=%s",
        name,
        options.get("secure"),
        options.get("samesite"),
        options.get("httponly"),
        options.get("domain"),
        options.get("path"),
        _first_header_value(request.headers.get("x-forwarded-proto")),
        _first_header_value(request.headers.get("x-forwarded-host")),
        _request_host(request),
    )
    resp.set_cookie(
        key=name,
        value=value,
        **options,
    )


def _clear_cookie(request: Request, resp: Response, name: str) -> None:
    resp.delete_cookie(key=name, domain=_resolve_cookie_domain(request), path="/")


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest, request: Request, resp: Response, db: Session = Depends(get_db)):
    req_id = _request_id(request)
    token = _validate_id_token_or_400(req.id_token)
    _metric_inc("login_attempt_total")
    logger.info("auth.login.attempt req_id=%s host=%s", req_id, _request_host(request))

    try:
        svc = _get_auth_service()
        decoded = svc.verify_firebase_id_token(token)
        user = svc.upsert_user_from_firebase(db, decoded)
        pair = svc.mint_token_pair(user.id)
        svc.persist_refresh_token(db, user.id, pair.refresh_token, pair.refresh_expires_at)

        access_max_age = int((pair.access_expires_at - datetime.now(timezone.utc)).total_seconds())
        refresh_max_age = int((pair.refresh_expires_at - datetime.now(timezone.utc)).total_seconds())

        settings = get_settings()
        _set_cookie(request, resp, settings.COOKIE_NAME_ACCESS, pair.access_token, max_age=access_max_age)
        _set_cookie(request, resp, settings.COOKIE_NAME_REFRESH, pair.refresh_token, max_age=refresh_max_age)

        set_cookie_count = sum(1 for k, _ in resp.raw_headers if k.lower() == b"set-cookie")
        if set_cookie_count < 2:
            _metric_inc("cookie_issue_total", "set_cookie_missing")
            logger.warning("auth.login.cookie_missing req_id=%s set_cookie_count=%s", req_id, set_cookie_count)

        _metric_inc("login_success_total")
        logger.info("auth.login.success req_id=%s user_id=%s", req_id, user.id)

        return LoginResponse(
            success=True,
            user=UserResponse(
                id=user.id,
                email=user.email,
                name=user.name,
                photo_url=user.photo_url,
            ),
        )
    except HTTPException:
        raise
    except AuthProviderUnavailableError as e:
        _metric_inc("login_failure_total", "auth_provider_unavailable")
        logger.warning("auth.login.provider_unavailable req_id=%s err=%s", req_id, e)
        _raise_auth_http_error(503, "auth_provider_unavailable", str(e))
    except AuthInvalidTokenError:
        _metric_inc("login_failure_total", "invalid_id_token")
        logger.info("auth.login.invalid_token req_id=%s", req_id)
        _raise_auth_http_error(401, "invalid_id_token", "invalid firebase id token")
    except AuthInvalidClaimsError as e:
        _metric_inc("login_failure_total", "invalid_token_claims")
        logger.info("auth.login.invalid_claims req_id=%s reason=%s", req_id, e)
        _raise_auth_http_error(401, "invalid_token_claims", str(e))
    except Exception:
        _metric_inc("login_failure_total", "auth_internal_error")
        logger.exception("auth.login.internal_error req_id=%s", req_id)
        _raise_auth_http_error(500, "auth_internal_error", "internal auth error")


@router.get("/ping")
async def auth_ping():
    return {"ok": True, "service": "auth"}


@router.get("/me", response_model=MeResponse)
async def me(request: Request):
    token = request.cookies.get("access_token")
    if not token:
        return MeResponse(authenticated=False, user=None)

    try:
        payload = _get_auth_service().decode_jwt(token)
        if payload.get("type") != "access":
            return MeResponse(authenticated=False, user=None)

        user_id = payload.get("sub")
        if not user_id:
            return MeResponse(authenticated=False, user=None)

        from backend.models.user import User

        db_gen = get_db()
        db = next(db_gen)
        try:
            user = db.query(User).filter(User.id == user_id).one_or_none()
            if user is None:
                return MeResponse(authenticated=False, user=None)
            return MeResponse(
                authenticated=True,
                user=UserResponse(
                    id=user.id,
                    email=user.email,
                    name=user.name,
                    photo_url=user.photo_url,
                ),
            )
        finally:
            try:
                next(db_gen)
            except StopIteration:
                pass
    except Exception as e:
        logger.warning("auth/me decode or DB error: %s", e, exc_info=True)
        return MeResponse(authenticated=False, user=None)


@router.post("/profile", response_model=UserResponse)
async def update_profile(
    req: UpdateProfileRequest,
    db: Session = Depends(get_db),
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
):
    if not access_token:
        raise HTTPException(status_code=401, detail="authentication required")

    try:
        payload = _get_auth_service().decode_jwt(access_token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="invalid token type")

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="token missing subject")

        from backend.models.user import User

        user = db.query(User).filter(User.id == user_id).one_or_none()
        if user is None:
            raise HTTPException(status_code=404, detail="user not found")

        user.name = req.name
        db.add(user)
        db.commit()
        db.refresh(user)

        return UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            photo_url=user.photo_url,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(
    request: Request,
    resp: Response,
    db: Session = Depends(get_db),
    refresh_token: Optional[str] = Cookie(default=None, alias="refresh_token"),
):
    req_id = _request_id(request)
    if not refresh_token:
        _metric_inc("refresh_failure_total", "refresh_missing")
        _raise_auth_http_error(401, "refresh_missing", "refresh token missing")

    try:
        svc = _get_auth_service()
        user_id = svc.validate_refresh_token(db, refresh_token)
        pair = svc.mint_token_pair(user_id)
        svc.persist_refresh_token(db, user_id, pair.refresh_token, pair.refresh_expires_at)
        svc.revoke_refresh_token(db, refresh_token)

        settings = get_settings()
        access_max_age = int((pair.access_expires_at - datetime.now(timezone.utc)).total_seconds())
        refresh_max_age = int((pair.refresh_expires_at - datetime.now(timezone.utc)).total_seconds())

        _set_cookie(request, resp, settings.COOKIE_NAME_ACCESS, pair.access_token, max_age=access_max_age)
        _set_cookie(request, resp, settings.COOKIE_NAME_REFRESH, pair.refresh_token, max_age=refresh_max_age)
        return RefreshResponse(success=True)
    except RefreshTokenExpiredError:
        _metric_inc("refresh_failure_total", "refresh_expired")
        logger.info("auth.refresh.expired req_id=%s", req_id)
        _raise_auth_http_error(401, "refresh_expired", "refresh token expired")
    except RefreshTokenRevokedError:
        _metric_inc("refresh_failure_total", "refresh_revoked")
        logger.info("auth.refresh.revoked req_id=%s", req_id)
        _raise_auth_http_error(401, "refresh_revoked", "refresh token revoked")
    except RefreshTokenInvalidError:
        _metric_inc("refresh_failure_total", "refresh_invalid")
        logger.info("auth.refresh.invalid req_id=%s", req_id)
        _raise_auth_http_error(401, "refresh_invalid", "refresh token invalid")
    except Exception:
        _metric_inc("refresh_failure_total", "refresh_internal_error")
        logger.exception("auth.refresh.internal_error req_id=%s", req_id)
        _raise_auth_http_error(500, "refresh_internal_error", "refresh internal error")


@router.post("/logout")
async def logout(
    request: Request,
    resp: Response,
    db: Session = Depends(get_db),
    refresh_token: Optional[str] = Cookie(default=None, alias="refresh_token"),
):
    settings = get_settings()
    if refresh_token:
        try:
            _get_auth_service().revoke_refresh_token(db, refresh_token)
        except Exception:
            pass

    _clear_cookie(request, resp, settings.COOKIE_NAME_ACCESS)
    _clear_cookie(request, resp, settings.COOKIE_NAME_REFRESH)
    return {"success": True}
