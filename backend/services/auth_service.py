from __future__ import annotations

import base64
import hashlib
import json
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict
from uuid import uuid4

from sqlalchemy import func
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from config.settings import get_settings
from backend.models.refresh_token import RefreshToken
from backend.models.user import User


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


@dataclass
class TokenPair:
    access_token: str
    refresh_token: str
    access_expires_at: datetime
    refresh_expires_at: datetime
    refresh_token_id: str


class AuthService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._firebase_ready = False
        self._init_firebase_admin_if_possible()

    def _init_firebase_admin_if_possible(self) -> None:
        """Initialize Firebase Admin using env JSON, env path, or default local path."""
        try:
            import firebase_admin
            from firebase_admin import credentials

            if firebase_admin._apps:
                self._firebase_ready = True
                return

            cred_json = self.settings.FIREBASE_CREDENTIALS_JSON or os.getenv("FIREBASE_CREDENTIALS_JSON")
            cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")

            if cred_json:
                decoded = cred_json
                try:
                    decoded = base64.b64decode(cred_json).decode("utf-8")
                except Exception:
                    # Keep raw JSON path when value is not base64.
                    pass
                info = json.loads(decoded)
                firebase_admin.initialize_app(credentials.Certificate(info))
                self._firebase_ready = True
                print("[AuthService] Firebase Admin initialized from FIREBASE_CREDENTIALS_JSON")
                return

            if cred_path and os.path.isfile(cred_path):
                firebase_admin.initialize_app(credentials.Certificate(cred_path))
                self._firebase_ready = True
                print(f"[AuthService] Firebase Admin initialized from GOOGLE_APPLICATION_CREDENTIALS={cred_path}")
                return

            default_path = Path(__file__).resolve().parents[2] / "backend" / "firebase-adminsdk.json"
            if default_path.is_file():
                firebase_admin.initialize_app(credentials.Certificate(str(default_path)))
                self._firebase_ready = True
                print(f"[AuthService] Firebase Admin initialized from default path {default_path}")
                return

            print("[AuthService] Firebase Admin not initialized: no credentials found.")
        except Exception as exc:
            print(f"[AuthService] Firebase Admin init failed: {exc}")
            self._firebase_ready = False

    def verify_firebase_id_token(self, id_token: str) -> Dict[str, Any]:
        if not self._firebase_ready:
            raise RuntimeError(
                "Firebase Admin is not initialized. Set FIREBASE_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS."
            )

        from firebase_admin import auth as fb_auth

        return fb_auth.verify_id_token(id_token, check_revoked=False)

    def upsert_user_from_firebase(self, db: Session, decoded: Dict[str, Any]) -> User:
        firebase_uid = decoded.get("uid")
        email = (decoded.get("email") or "").strip()
        name = decoded.get("name") or decoded.get("displayName")
        picture = decoded.get("picture")

        if not firebase_uid or not email:
            raise ValueError("Firebase token missing uid/email")

        normalized_email = email.lower()

        user = db.query(User).filter(User.firebase_uid == firebase_uid).one_or_none()
        if user is None:
            existing_user = db.query(User).filter(func.lower(User.email) == normalized_email).one_or_none()
            if existing_user is None:
                user = User(
                    id=str(uuid4()),
                    firebase_uid=firebase_uid,
                    email=email,
                    name=name,
                    photo_url=picture,
                    level=1,
                    xp=0,
                    gems=50,
                )
                db.add(user)
            else:
                user = existing_user
                user.firebase_uid = firebase_uid
                user.email = email
                user.name = name
                user.photo_url = picture
        else:
            user.email = email
            user.name = name
            user.photo_url = picture

        try:
            db.commit()
        except IntegrityError:
            # Handle race/misaligned identity between firebase uid + email uniqueness constraints.
            db.rollback()
            existing_user = db.query(User).filter(func.lower(User.email) == normalized_email).one_or_none()
            if existing_user is None:
                raise

            user = existing_user
            user.firebase_uid = firebase_uid
            user.email = email
            user.name = name
            user.photo_url = picture
            db.commit()

        db.refresh(user)
        return user

    def _require_secret(self) -> str:
        secret = (self.settings.SECRET_KEY or "").strip()
        if not secret:
            raise ValueError("SECRET_KEY is missing")
        return secret

    def mint_token_pair(self, user_id: str) -> TokenPair:
        now = _utcnow()
        access_exp = now + timedelta(minutes=self.settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        refresh_exp = now + timedelta(days=self.settings.REFRESH_TOKEN_EXPIRE_DAYS)

        access_payload = {
            "sub": user_id,
            "type": "access",
            "iat": int(now.timestamp()),
            "exp": int(access_exp.timestamp()),
        }

        refresh_token_id = uuid4().hex
        refresh_secret = uuid4().hex
        refresh_payload = {
            "sub": user_id,
            "type": "refresh",
            "jti": refresh_token_id,
            "sec": refresh_secret,
            "iat": int(now.timestamp()),
            "exp": int(refresh_exp.timestamp()),
        }

        secret = self._require_secret()
        access_token = jwt.encode(access_payload, secret, algorithm=self.settings.JWT_ALG)
        refresh_token = jwt.encode(refresh_payload, secret, algorithm=self.settings.JWT_ALG)

        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            access_expires_at=access_exp,
            refresh_expires_at=refresh_exp,
            refresh_token_id=refresh_token_id,
        )

    def persist_refresh_token(
        self,
        db: Session,
        user_id: str,
        refresh_jwt: str,
        refresh_expires_at: datetime,
    ) -> None:
        payload = self.decode_jwt(refresh_jwt)
        if payload.get("type") != "refresh":
            raise ValueError("Token type is not refresh")

        jti = payload.get("jti")
        sec = payload.get("sec")
        if not jti or not sec:
            raise ValueError("Refresh payload missing jti/sec")

        row = RefreshToken(
            id=jti,
            user_id=user_id,
            token_hash=_sha256_hex(f"{jti}:{sec}"),
            expires_at=refresh_expires_at,
        )
        db.add(row)
        db.commit()

    def decode_jwt(self, token: str) -> Dict[str, Any]:
        secret = self._require_secret()
        try:
            return jwt.decode(token, secret, algorithms=[self.settings.JWT_ALG])
        except JWTError as exc:
            raise ValueError("Invalid JWT") from exc

    def validate_refresh_token(self, db: Session, refresh_jwt: str) -> str:
        payload = self.decode_jwt(refresh_jwt)
        if payload.get("type") != "refresh":
            raise ValueError("Token type is not refresh")

        user_id = payload.get("sub")
        jti = payload.get("jti")
        sec = payload.get("sec")
        if not user_id or not jti or not sec:
            raise ValueError("Refresh payload is incomplete")

        row = db.query(RefreshToken).filter(RefreshToken.id == jti).one_or_none()
        if row is None:
            raise ValueError("Refresh token is not registered")
        if row.revoked_at is not None:
            raise ValueError("Refresh token is revoked")
        if row.expires_at < _utcnow():
            raise ValueError("Refresh token is expired")

        expected = row.token_hash
        actual = _sha256_hex(f"{jti}:{sec}")
        if expected != actual:
            raise ValueError("Refresh token hash mismatch")

        return str(user_id)

    def revoke_refresh_token(self, db: Session, refresh_jwt: str) -> None:
        try:
            payload = self.decode_jwt(refresh_jwt)
        except Exception:
            return

        jti = payload.get("jti")
        if not jti:
            return

        row = db.query(RefreshToken).filter(RefreshToken.id == jti).one_or_none()
        if row is None:
            return

        row.revoked_at = _utcnow()
        db.commit()

