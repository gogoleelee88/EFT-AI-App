from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any


_DEFAULT_PRIORS_PATH = Path(__file__).resolve().parents[1] / "datasets" / "dataset_priors.json"


def _merge_dict(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    out = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _merge_dict(out[key], value)
        else:
            out[key] = value
    return out


@lru_cache(maxsize=1)
def load_dataset_priors() -> dict[str, Any]:
    path = Path(os.getenv("DATASET_PRIORS_PATH") or _DEFAULT_PRIORS_PATH)
    if not path.exists():
        return {}

    try:
        with path.open("r", encoding="utf-8") as fp:
            data = json.load(fp)
            if isinstance(data, dict):
                return data
    except Exception:
        return {}
    return {}


def get_dataset_priors(defaults: dict[str, Any] | None = None) -> dict[str, Any]:
    loaded = load_dataset_priors()
    if not defaults:
        return loaded
    return _merge_dict(defaults, loaded)

