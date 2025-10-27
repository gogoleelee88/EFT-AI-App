from pathlib import Path
import sys

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.main import app


def test_suds_record_returns_start_eftar():
    client = TestClient(app)
    response = client.post("/api/suds/record", json={"value": 5})
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert any(action.get("type") == "start_eftar" for action in data.get("actions", []))
