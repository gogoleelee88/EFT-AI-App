from typing import Any, Dict, Optional, Tuple, Literal
from pydantic import BaseModel, Field, ValidationError


class StartEFTARv1(BaseModel):
    type: Literal["start_eftar"] = Field(default="start_eftar")
    payload: Dict[str, Any]

    @classmethod
    def build(
        cls,
        *,
        script: str = "standard_relief",
        suds: Optional[int] = None,
        route: str = "/eftar",
        params: Optional[Dict[str, Any]] = None,
    ) -> "StartEFTARv1":
        p: Dict[str, Any] = {"script": script, "route": route, "action_version": "v1"}
        if suds is not None:
            p["suds"] = suds
        if params:
            p["params"] = params
        return cls(payload=p)


_LEGACY_TYPE_ALIASES = {
    "start_eftar": "start_eftar",
    "startEFTAR": "start_eftar",
    "eft_start": "start_eftar",
    "eftar_start": "start_eftar",
    "begin_eft": "start_eftar",
}

_LEGACY_PAYLOAD_KEYS = {
    "script": ["script", "template", "flow", "preset", "program", "scene"],
    "suds": ["suds", "sudsScore", "score", "intensity"],
    "route": ["route", "path", "redirect", "url"],
    "params": ["params", "extra", "meta"],
}


def _pick(payload: Dict[str, Any], keys: list[str], default=None):
    for k in keys:
        if k in payload:
            return payload.get(k)
    return default


def normalize_start_eftar(action: Dict[str, Any]) -> Tuple[Optional[StartEFTARv1], Optional[str]]:
    if not isinstance(action, dict):
        return None, "not_a_dict"
    atype = action.get("type")
    payload = action.get("payload") or {}
    mapped = _LEGACY_TYPE_ALIASES.get(atype)
    if mapped != "start_eftar":
        return None, f"unsupported_type:{atype}"
    script = _pick(payload, _LEGACY_PAYLOAD_KEYS["script"], "standard_relief")
    suds = _pick(payload, _LEGACY_PAYLOAD_KEYS["suds"], None)
    route = _pick(payload, _LEGACY_PAYLOAD_KEYS["route"], "/eftar")
    params = _pick(payload, _LEGACY_PAYLOAD_KEYS["params"], None)
    try:
        suds_int = int(suds) if suds is not None else None
    except Exception:
        suds_int = None
    try:
        canon = StartEFTARv1.build(script=script, suds=suds_int, route=route, params=params)
        return canon, None
    except ValidationError as e:
        return None, f"validation_error:{e}"
