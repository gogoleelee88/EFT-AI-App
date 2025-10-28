from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.main import app as main_app


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(main_app) as client:
        yield client


def test_post_suds_returns_start_eftar(client: TestClient):
    response = client.post("/suds", json={"type": "manual", "score": 7})
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["actions"][0]["type"] == "start_eftar"
    assert response.headers["access-control-allow-origin"] == "*"
    assert isinstance(data["trace_id"], str)
    assert isinstance(data["saved_at"], str)


def test_legacy_post_route_normalizes_payload(client: TestClient):
    response = client.post("/api/suds/record", json={"value": 8, "source": "compare"})
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["actions"][0]["type"] == "start_eftar"
    assert isinstance(data["trace_id"], str)
    assert isinstance(data["saved_at"], str)


def test_options_returns_cors_headers(client: TestClient):
    response = client.options(
        "/api/suds/record",
        headers={
            "Origin": "https://example.com",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["Access-Control-Allow-Methods"] == "GET, POST, OPTIONS"


def test_options_suds_uses_shared_cors_headers(client: TestClient):
    response = client.options(
        "/suds",
        headers={
            "Origin": "https://example.com",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["Access-Control-Allow-Methods"] == "GET, POST, OPTIONS"


def test_legacy_post_requires_score(client: TestClient):
    response = client.post("/api/suds/record", json={"source": "compare"})
    assert response.status_code == 422


def test_post_suds_rejects_out_of_range_score(client: TestClient):
    response = client.post("/suds", json={"type": "manual", "score": 11})
    assert response.status_code == 422


def test_legacy_post_accepts_string_score(client: TestClient):
    response = client.post("/api/suds/record", json={"value": "9"})
    assert response.status_code == 200
    assert response.json()["actions"][0]["type"] == "start_eftar"


def test_legacy_post_rejects_invalid_string_score(client: TestClient):
    response = client.post("/api/suds/record", json={"value": "invalid"})
    assert response.status_code == 422
