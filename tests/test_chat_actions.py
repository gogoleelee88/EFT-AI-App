"""채팅 엔드포인트 액션 검증 테스트"""
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_chat_returns_actions_list():
    """액션 필드가 항상 리스트로 반환되는지 검증(일반 인사 케이스)"""
    res = client.post(
        "/api/chat",
        json={
            "message": "안녕하세요. 오늘 상담 시작할게요.",
            "conversation_history": [],
            "session_id": "test_session_1"
        }
    )
    assert res.status_code == 200
    data = res.json()
    assert "actions" in data
    assert isinstance(data["actions"], list)

def test_chat_ask_suds_action_present():
    """자연스러운 대화형에서 ask_suds 액션이 포함되는지 검증"""
    cases = [
        "EFT 시작하고 싶어요. 첫 단계부터 안내해줘.",
        "두드리기(EFT) 해보자. 뭐부터 하면 돼?",
        "지금 마음이 불안하고 가슴이 답답해요. 진정하고 싶어요. 도와줄래요?",
        "7"
    ]

    for msg in cases:
        res = client.post(
            "/api/chat",
            json={
                "message": msg,
                "conversation_history": [],
                "session_id": f"test_session_{hash(msg)}"
            }
        )
        assert res.status_code == 200
        actions = res.json().get("actions", [])
        assert any(isinstance(a, dict) and a.get("type") == "ask_suds" for a in actions), f"missing ask_suds for '{msg}'"
