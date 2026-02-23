from pathlib import Path
from typing import TYPE_CHECKING
import json

if TYPE_CHECKING:
    from backend.models.suds import SUDSEntry

_ROOT = Path(__file__).resolve().parents[1]
_DATA_DIR = _ROOT / "data"
SUDS_FILE = _DATA_DIR / "suds.jsonl"

def _ensure_dir() -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)

def append_suds(entry: "SUDSEntry") -> None:
    # ì§???í¬???í ì°¸ì¡° ?í¼)
    from backend.models.suds import SUDSEntry  # noqa: F401
    _ensure_dir()

    # Pydantic v2: model_dump() ??dict ??json.dumps(ensure_ascii=False)
    # v1: dict() ??json.dumps(ensure_ascii=False)
    if hasattr(entry, 'model_dump'):
        data = entry.model_dump()  # Pydantic v2
    else:
        data = entry.dict()        # Pydantic v1

    with SUDS_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(data, ensure_ascii=False) + "\n")

