"""
프리미엄 인증 의존성 및 요청 검증
X-API-Key 헤더 기반 프리미엄 사용자 인증 + Content-Type 검증
"""

from typing import Annotated, Optional
from fastapi import Depends, Header, HTTPException
from backend.config.settings import get_settings

def verify_premium_api_key(x_api_key: Optional[str] = Header(default=None, alias="X-API-Key")) -> str:
    """프리미엄 API 키 검증"""
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key", headers={"WWW-Authenticate": "API-Key"})

    settings = get_settings()
    if x_api_key != settings.PREMIUM_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid X-API-Key")

    return x_api_key

def require_json_content_type(content_type: Optional[str] = Header(default=None, alias="Content-Type")) -> str:
    """JSON Content-Type 강제 검증"""
    if not content_type:
        raise HTTPException(
            status_code=415,
            detail="Content-Type header is required",
            headers={"Accept": "application/json"}
        )

    if "application/json" not in content_type.lower():
        raise HTTPException(
            status_code=415,
            detail="Content-Type must be application/json",
            headers={"Accept": "application/json"}
        )

    return content_type

# ✅ 라우터에서 타입으로 바로 쓸 수 있게 Annotated 별칭으로 노출
PremiumAuth = Annotated[str, Depends(verify_premium_api_key)]
RequireJSON = Annotated[str, Depends(require_json_content_type)]