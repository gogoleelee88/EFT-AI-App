"""
?„ë¦¬ë¯¸ì—„ ?¸ì¦ ?˜ì¡´??ë°??”ì²­ ê²€ì¦?X-API-Key ?¤ë” ê¸°ë°˜ ?„ë¦¬ë¯¸ì—„ ?¬ìš©???¸ì¦ + Content-Type ê²€ì¦?"""

from typing import Annotated, Optional
from fastapi import Depends, Header, HTTPException
from config.settings import get_settings

def verify_premium_api_key(x_api_key: Optional[str] = Header(default=None, alias="X-API-Key")) -> str:
    """?„ë¦¬ë¯¸ì—„ API ??ê²€ì¦?""
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key", headers={"WWW-Authenticate": "API-Key"})

    settings = get_settings()
    if x_api_key != settings.PREMIUM_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid X-API-Key")

    return x_api_key

def require_json_content_type(content_type: Optional[str] = Header(default=None, alias="Content-Type")) -> str:
    """JSON Content-Type ê°•ì œ ê²€ì¦?""
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

# ???¼ìš°?°ì—???€?…ìœ¼ë¡?ë°”ë¡œ ?????ˆê²Œ Annotated ë³„ì¹­?¼ë¡œ ?¸ì¶œ
PremiumAuth = Annotated[str, Depends(verify_premium_api_key)]
RequireJSON = Annotated[str, Depends(require_json_content_type)]
