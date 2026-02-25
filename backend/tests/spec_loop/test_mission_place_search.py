from fastapi import HTTPException

from backend.models.user import User
from backend.spec_loop.mission import service
from backend.spec_loop.models import Place


def _seed_user(db_session, user_id: str) -> str:
    row = db_session.query(User).filter(User.id == user_id).one_or_none()
    if row is not None:
        return user_id
    db_session.add(
        User(
            id=user_id,
            firebase_uid=f"firebase-{user_id}",
            email=f"{user_id}@example.com",
            name="tester",
        )
    )
    db_session.commit()
    return user_id


def test_search_places_fallback_empty_on_external_error(monkeypatch):
    def _raise_external(_query: str, _size: int):
        raise HTTPException(status_code=502, detail="external unavailable")

    monkeypatch.setattr(service, "_search_places_external", _raise_external)

    results = service.search_places("역삼어반필드", size=8)
    assert results == []


def test_search_places_fallback_to_saved_places(db_session, monkeypatch):
    user_id = _seed_user(db_session, "place-fallback-user")
    place = Place(
        user_id=user_id,
        name="역삼어반필드",
        address="서울 강남구 테헤란로 123",
        gps_lat=37.5001,
        gps_lng=127.0364,
        gps_radius=50,
        verification_method=["gps"],
    )
    db_session.add(place)
    db_session.commit()

    def _raise_external(_query: str, _size: int):
        raise HTTPException(status_code=503, detail="no api key")

    monkeypatch.setattr(service, "_search_places_external", _raise_external)

    results = service.search_places(
        "역삼어반필드",
        size=8,
        db=db_session,
        user_id=user_id,
    )

    assert len(results) == 1
    assert results[0]["provider"] == "saved"
    assert results[0]["place_name"] == "역삼어반필드"
