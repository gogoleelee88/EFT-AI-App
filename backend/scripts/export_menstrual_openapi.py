from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from backend.main import (\n
    app,\n
)
PROJECT_ROOT = Path(__file__).resolve().parents[2]
OUT_YAML = PROJECT_ROOT / "docs" / "api" / "menstrual-openapi.generated.yaml"
OUT_JSON = PROJECT_ROOT / "docs" / "api" / "menstrual-openapi.generated.json"


def _extract_refs(node: Any, refs: set[str]) -> None:
    if isinstance(node, dict):
        ref = node.get("$ref")
        if isinstance(ref, str) and ref.startswith("#/components/schemas/"):
            refs.add(ref.rsplit("/", 1)[-1])
        for value in node.values():
            _extract_refs(value, refs)
    elif isinstance(node, list):
        for item in node:
            _extract_refs(item, refs)


def _yaml_scalar(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value)
    escaped = text.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def _to_yaml(node: Any, indent: int = 0) -> str:
    pad = " " * indent
    if isinstance(node, dict):
        lines: list[str] = []
        for key, value in node.items():
            if isinstance(value, (dict, list)):
                lines.append(f"{pad}{key}:")
                lines.append(_to_yaml(value, indent + 2))
            else:
                lines.append(f"{pad}{key}: {_yaml_scalar(value)}")
        return "\n".join(lines)
    if isinstance(node, list):
        lines: list[str] = []
        for item in node:
            if isinstance(item, (dict, list)):
                lines.append(f"{pad}-")
                lines.append(_to_yaml(item, indent + 2))
            else:
                lines.append(f"{pad}- {_yaml_scalar(item)}")
        return "\n".join(lines)
    return f"{pad}{_yaml_scalar(node)}"


def build_menstrual_openapi() -> dict[str, Any]:
    full = app.openapi()
    paths = {path: item for path, item in full.get("paths", {}).items() if path.startswith("/v1/menstrual")}

    used_refs: set[str] = set()
    _extract_refs(paths, used_refs)

    schemas = full.get("components", {}).get("schemas", {})
    selected_schemas = {name: schemas[name] for name in sorted(used_refs) if name in schemas}

    return {
        "openapi": full.get("openapi", "3.0.3"),
        "info": {
            "title": "Menstrual Module API (Generated)",
            "version": full.get("info", {}).get("version", "1.0.0"),
            "description": "Auto-generated from FastAPI app.openapi().",
        },
        "paths": paths,
        "components": {"schemas": selected_schemas},
    }


def main() -> None:
    spec = build_menstrual_openapi()
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT_YAML.write_text(_to_yaml(spec) + "\n", encoding="utf-8")
    print(f"WROTE {OUT_JSON}")
    print(f"WROTE {OUT_YAML}")


if __name__ == "__main__":
    main()


