"""
FastAPI router export.
main.py에서 import할 때 사용.
"""


def _optional_import(path: str, attr: str = "router"):
    try:
        mod = __import__(path, fromlist=[attr])
        return getattr(mod, attr)
    except Exception as e:
        print(f"[WARN] {path} failed to import:", e)
        return None


guidance_router = _optional_import("backend.routers.guidance_router")
voice_router = _optional_import("backend.routers.voice")

proposal_profiles_router = _optional_import("backend.routers.profiles")
proposal_signals_router = _optional_import("backend.routers.signals")
proposal_router = _optional_import("backend.routers.proposals")

menstrual_router = _optional_import("backend.routers.menstrual")
