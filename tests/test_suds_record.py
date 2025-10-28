from pathlib import Path
import sys

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.routers.suds import router


def _build_test_client() -> TestClient:
    from fastapi import FastAPI

    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_post_suds_returns_start_eftar():
    client = _build_test_client()
    response = client.post("/suds", json={"type": "manual", "score": 7})
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["actions"][0]["type"] == "start_eftar"
    assert response.headers["access-control-allow-origin"] == "*"


def test_legacy_post_route_normalizes_payload():
    client = _build_test_client()
    response = client.post("/api/suds/record", json={"value": 8, "source": "compare"})
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["actions"][0]["type"] == "start_eftar"


def test_options_returns_cors_headers():
    client = _build_test_client()
    response = client.options(
        "/api/suds/record",
        headers={
            "Origin": "https://example.com",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["Access-Control-Allow-Methods"] == "GET, POST, OPTIONS"


def test_options_suds_uses_shared_cors_headers():
    client = _build_test_client()
    response = client.options(
        "/suds",
        headers={
            "Origin": "https://example.com",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["Access-Control-Allow-Methods"] == "GET, POST, OPTIONS"


def test_legacy_post_requires_score():
    client = _build_test_client()
    response = client.post("/api/suds/record", json={"source": "compare"})
    assert response.status_code == 422


def test_post_suds_rejects_out_of_range_score():
    client = _build_test_client()
    response = client.post("/suds", json={"type": "manual", "score": 11})
    assert response.status_code == 422


def test_legacy_post_accepts_string_score():
    client = _build_test_client()
    response = client.post("/api/suds/record", json={"value": "9"})
    assert response.status_code == 200
    assert response.json()["actions"][0]["type"] == "start_eftar"


def test_legacy_post_rejects_invalid_string_score():
    client = _build_test_client()
    response = client.post("/api/suds/record", json={"value": "invalid"})
    assert response.status_code == 422
