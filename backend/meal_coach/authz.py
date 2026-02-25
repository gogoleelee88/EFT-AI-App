from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from fastapi import Cookie, Header, HTTPException
from sqlalchemy.orm import Session

from backend.meal_coach.models import TenantMembership
from backend.models.user import User
from services.auth_service import AuthService


@dataclass
class Actor:
    user_id: str
    tenant_id: str
    role: str


def _extract_token(auth_header: Optional[str], access_cookie: Optional[str]) -> str:
    if auth_header and auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    if access_cookie:
        return access_cookie
    raise HTTPException(status_code=401, detail="Authentication required")


def resolve_actor(
    db: Session,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_tenant_id: Optional[str] = Header(default=None, alias="X-Tenant-Id"),
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
) -> Actor:
    token = _extract_token(authorization, access_token)
    payload = AuthService().decode_jwt(token)
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    user = db.query(User).filter(User.id == user_id).one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")

    tenant_id = (x_tenant_id or user_id).strip()
    if not tenant_id:
        raise HTTPException(status_code=400, detail="X-Tenant-Id is invalid")

    membership = (
        db.query(TenantMembership)
        .filter(TenantMembership.tenant_id == tenant_id, TenantMembership.user_id == user_id)
        .one_or_none()
    )
    if membership is None:
        # Personal tenant bootstrap.
        if tenant_id != user_id:
            raise HTTPException(status_code=403, detail="No tenant membership")
        membership = TenantMembership(tenant_id=tenant_id, user_id=user_id, role="Owner")
        db.add(membership)
        db.commit()
        db.refresh(membership)

    role = membership.role if membership.role in {"Owner", "Admin", "Member"} else "Member"
    return Actor(user_id=user_id, tenant_id=tenant_id, role=role)


def require_owner_or_admin(actor: Actor) -> None:
    if actor.role not in {"Owner", "Admin"}:
        raise HTTPException(status_code=403, detail="Owner/Admin role required")



