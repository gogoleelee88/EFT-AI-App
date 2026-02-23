# Mission ?ë¹??- ë¯¸ì/?¥ì/ë¯¸ì¸?ë ???ì¡°í ë¡ì§
from datetime import datetime
import logging
import os
from typing import Optional
from uuid import uuid4

import httpx
from fastapi import HTTPException
from sqlalchemy import desc, func, or_
from sqlalchemy.orm import Session

from config.settings import get_settings
from backend.spec_loop.models import MicroAction, MissionTemplate, Place, Task
from backend.spec_loop.mission.schemas import PlaceCreate, PlaceUpdate
from utils.text_norm import normalize_text

logger = logging.getLogger(__name__)


# === ?¥ì (Place) ê´ë¦?===
def get_user_places(db: Session, user_id: Optional[str] = None) -> list[Place]:
    """?¬ì©???¥ì ëª©ë¡ ì¡°í (?±ê³µë¥???"""
    query = db.query(Place)
    if user_id:
        query = query.filter(Place.user_id == user_id)
    return query.order_by(desc(Place.success_count), desc(Place.last_used_at)).all()


def get_place_by_id(db: Session, place_id: int, user_id: Optional[str] = None) -> Place:
    """?¥ì IDë¡?ì¡°í"""
    query = db.query(Place).filter(Place.place_id == place_id)
    if user_id:
        query = query.filter(Place.user_id == user_id)
    place = query.first()
    if not place:
        raise HTTPException(status_code=404, detail=f"Place {place_id} not found")
    return place


def create_place(db: Session, data: PlaceCreate, user_id: Optional[str] = None) -> Place:
    """???¥ì ?±ë¡"""
    place = Place(
        user_id=user_id,
        name=data.name,
        address=data.address,
        gps_lat=data.gps_lat,
        gps_lng=data.gps_lng,
        gps_radius=data.gps_radius,
        wifi_ssid=data.wifi_ssid,
        bluetooth_beacon_id=data.bluetooth_beacon_id,
        verification_method=data.verification_method,
    )
    db.add(place)
    db.commit()
    db.refresh(place)
    return place


def update_place(
    db: Session, place_id: int, data: PlaceUpdate, user_id: Optional[str] = None
) -> Place:
    """?¥ì ?ë³´ ?ì"""
    place = get_place_by_id(db, place_id, user_id)

    if data.name is not None:
        place.name = data.name
    if data.address is not None:
        place.address = data.address
    if data.gps_lat is not None:
        place.gps_lat = data.gps_lat
    if data.gps_lng is not None:
        place.gps_lng = data.gps_lng
    if data.gps_radius is not None:
        place.gps_radius = data.gps_radius
    if data.wifi_ssid is not None:
        place.wifi_ssid = data.wifi_ssid
    if data.bluetooth_beacon_id is not None:
        place.bluetooth_beacon_id = data.bluetooth_beacon_id
    if data.verification_method is not None:
        place.verification_method = data.verification_method

    db.commit()
    db.refresh(place)
    return place


def delete_place(db: Session, place_id: int, user_id: Optional[str] = None) -> None:
    """?¥ì ??"""
    place = get_place_by_id(db, place_id, user_id)
    db.delete(place)
    db.commit()


def _as_float(value: object) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


GOOGLE_AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete"
GOOGLE_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
GOOGLE_PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places/{place_id}"
KAKAO_KEYWORD_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"


def _google_maps_api_key() -> str:
    settings = get_settings()
    return (settings.GOOGLE_MAPS_API_KEY or os.getenv("GOOGLE_MAPS_API_KEY") or "").strip()


def _kakao_rest_api_key() -> str:
    settings = get_settings()
    return (settings.KAKAO_REST_API_KEY or os.getenv("KAKAO_REST_API_KEY") or "").strip()


def _normalize_google_place_id(value: object) -> Optional[str]:
    raw = str(value or "").strip()
    if not raw:
        return None
    if raw.startswith("places/"):
        raw = raw[len("places/") :]
    return raw or None


def _build_google_headers(api_key: str, field_mask: str) -> dict[str, str]:
    return {
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": field_mask,
        "Content-Type": "application/json",
    }


def _google_place_to_result(place: object) -> Optional[dict]:
    if not isinstance(place, dict):
        return None

    place_id = _normalize_google_place_id(
        place.get("id") or place.get("placeId") or place.get("name")
    )
    display_name = place.get("displayName")
    if isinstance(display_name, dict):
        place_name = str(display_name.get("text") or "").strip()
    else:
        place_name = str(display_name or "").strip()

    address = str(place.get("formattedAddress") or "").strip() or None
    if not place_name:
        place_name = address or ""

    location = place.get("location")
    lat = None
    lng = None
    if isinstance(location, dict):
        lat = _as_float(location.get("latitude"))
        lng = _as_float(location.get("longitude"))

    if lat is None or lng is None or not place_name:
        return None

    category_name = None
    types = place.get("types")
    if isinstance(types, list):
        cleaned_types = [str(item).strip() for item in types if str(item).strip()]
        if cleaned_types:
            category_name = " > ".join(cleaned_types[:3])

    return {
        "provider": "google",
        "provider_id": place_id,
        "place_name": place_name,
        "address": address,
        "road_address": address,
        "category_name": category_name,
        "lat": lat,
        "lng": lng,
    }


def _search_google_autocomplete_place_ids(
    client: httpx.Client,
    *,
    api_key: str,
    keyword: str,
    size: int,
    session_token: str,
) -> list[str]:
    headers = _build_google_headers(
        api_key,
        "suggestions.placePrediction.placeId,suggestions.placePrediction.place",
    )
    payload = {
        "input": keyword,
        "languageCode": "ko",
        "regionCode": "KR",
        "sessionToken": session_token,
    }
    response = client.post(
        GOOGLE_AUTOCOMPLETE_URL,
        headers=headers,
        json=payload,
    )
    response.raise_for_status()
    data = response.json()

    suggestions = data.get("suggestions")
    if not isinstance(suggestions, list):
        return []

    seen: set[str] = set()
    place_ids: list[str] = []
    for item in suggestions:
        if not isinstance(item, dict):
            continue
        prediction = item.get("placePrediction")
        if not isinstance(prediction, dict):
            continue

        place_id = _normalize_google_place_id(
            prediction.get("placeId") or prediction.get("place")
        )
        if not place_id or place_id in seen:
            continue

        seen.add(place_id)
        place_ids.append(place_id)
        if len(place_ids) >= size:
            break

    return place_ids


def _search_google_place_details(
    client: httpx.Client,
    *,
    api_key: str,
    place_id: str,
    session_token: str,
) -> Optional[dict]:
    headers = _build_google_headers(
        api_key,
        "id,displayName,formattedAddress,location,types",
    )
    params = {"sessionToken": session_token}
    response = client.get(
        GOOGLE_PLACE_DETAILS_URL.format(place_id=place_id),
        headers=headers,
        params=params,
    )
    response.raise_for_status()
    return _google_place_to_result(response.json())


def _search_google_text(
    client: httpx.Client,
    *,
    api_key: str,
    keyword: str,
    size: int,
) -> list[dict]:
    headers = _build_google_headers(
        api_key,
        "places.id,places.displayName,places.formattedAddress,places.location,places.types",
    )
    payload = {
        "textQuery": keyword,
        "pageSize": size,
        "languageCode": "ko",
        "regionCode": "KR",
    }
    response = client.post(
        GOOGLE_TEXT_SEARCH_URL,
        headers=headers,
        json=payload,
    )
    response.raise_for_status()
    data = response.json()

    places = data.get("places")
    if not isinstance(places, list):
        return []

    results: list[dict] = []
    for place in places:
        mapped = _google_place_to_result(place)
        if mapped is not None:
            results.append(mapped)
            if len(results) >= size:
                break
    return results


def _dedupe_place_results(rows: list[dict], *, size: int) -> list[dict]:
    unique: list[dict] = []
    seen: set[str] = set()

    for row in rows:
        provider_id = str(row.get("provider_id") or "").strip()
        if provider_id:
            key = f"id:{provider_id}"
        else:
            place_name = normalize_text(str(row.get("place_name") or ""))
            lat = _as_float(row.get("lat"))
            lng = _as_float(row.get("lng"))
            key = f"geo:{place_name}:{lat}:{lng}"

        if key in seen:
            continue

        seen.add(key)
        unique.append(row)
        if len(unique) >= size:
            break

    return unique


def _search_places_external_google(query: str, size: int = 8) -> list[dict]:
    """Search places via Google Places API (Autocomplete + Details + Text Search)."""
    keyword = (query or "").strip()
    if not keyword:
        return []

    api_key = _google_maps_api_key()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="?¥ì ê²?ì´ ë¹í?±í?ì´ ?ìµ?ë¤. ?ë²??GOOGLE_MAPS_API_KEYë¥??¤ì?ì¸??",
        )

    result_size = max(1, min(int(size), 15))
    session_token = uuid4().hex

    component_errors: list[Exception] = []
    detail_results: list[dict] = []
    text_results: list[dict] = []

    with httpx.Client(timeout=6.0) as client:
        place_ids: list[str] = []
        try:
            place_ids = _search_google_autocomplete_place_ids(
                client,
                api_key=api_key,
                keyword=keyword,
                size=result_size,
                session_token=session_token,
            )
        except (httpx.HTTPStatusError, httpx.RequestError) as exc:
            component_errors.append(exc)

        for place_id in place_ids:
            try:
                detail = _search_google_place_details(
                    client,
                    api_key=api_key,
                    place_id=place_id,
                    session_token=session_token,
                )
            except (httpx.HTTPStatusError, httpx.RequestError) as exc:
                logger.info(
                    "google place details failed place_id=%s error=%s",
                    place_id,
                    str(exc),
                )
                continue
            if detail is not None:
                detail_results.append(detail)
                if len(detail_results) >= result_size:
                    break

        try:
            text_results = _search_google_text(
                client,
                api_key=api_key,
                keyword=keyword,
                size=result_size,
            )
        except (httpx.HTTPStatusError, httpx.RequestError) as exc:
            component_errors.append(exc)

    merged = _dedupe_place_results(detail_results + text_results, size=result_size)
    if merged:
        return merged

    if component_errors:
        first_error = component_errors[0]
        if isinstance(first_error, httpx.HTTPStatusError):
            logger.warning(
                "google place search failed with status=%s",
                first_error.response.status_code,
            )
            raise HTTPException(status_code=502, detail="Google ?¥ì ê²??API ?¸ì¶???¤í¨?ìµ?ë¤.") from first_error
        logger.warning("google place search request error: %s", str(first_error))
        raise HTTPException(status_code=502, detail="Google ?¥ì ê²??API? ?µì?????ìµ?ë¤.") from first_error

    return []


def _search_places_external_kakao(query: str, size: int = 8) -> list[dict]:
    """Fallback search via Kakao Local keyword API."""
    keyword = (query or "").strip()
    if not keyword:
        return []

    api_key = _kakao_rest_api_key()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="?¥ì ê²?ì´ ë¹í?±í?ì´ ?ìµ?ë¤. ?ë²??KAKAO_REST_API_KEYë¥??¤ì?ì¸??",
        )

    result_size = max(1, min(int(size), 15))
    headers = {"Authorization": f"KakaoAK {api_key}"}
    params = {"query": keyword, "size": str(result_size)}

    try:
        with httpx.Client(timeout=6.0) as client:
            response = client.get(KAKAO_KEYWORD_SEARCH_URL, headers=headers, params=params)
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:
        logger.warning("kakao place search failed with status=%s", exc.response.status_code)
        raise HTTPException(status_code=502, detail="?¸ë? ?¥ì ê²??API ?¸ì¶???¤í¨?ìµ?ë¤.") from exc
    except httpx.RequestError as exc:
        logger.warning("kakao place search request error: %s", str(exc))
        raise HTTPException(status_code=502, detail="?¸ë? ?¥ì ê²??API? ?µì?????ìµ?ë¤.") from exc

    documents = payload.get("documents")
    if not isinstance(documents, list):
        return []

    results: list[dict] = []
    for doc in documents:
        if not isinstance(doc, dict):
            continue

        lat = _as_float(doc.get("y"))
        lng = _as_float(doc.get("x"))
        place_name = str(doc.get("place_name") or "").strip()
        if lat is None or lng is None or not place_name:
            continue

        road_address = str(doc.get("road_address_name") or "").strip() or None
        address = str(doc.get("address_name") or "").strip() or road_address

        results.append(
            {
                "provider": "kakao",
                "provider_id": str(doc.get("id") or "").strip() or None,
                "place_name": place_name,
                "address": address,
                "road_address": road_address,
                "category_name": str(doc.get("category_name") or "").strip() or None,
                "lat": lat,
                "lng": lng,
            }
        )

    return results


def _search_places_external(query: str, size: int = 8) -> list[dict]:
    """Search places externally with Google-first strategy."""
    try:
        return _search_places_external_google(query, size=size)
    except HTTPException as google_error:
        if google_error.status_code not in (502, 503):
            raise

        kakao_api_key = _kakao_rest_api_key()
        if not kakao_api_key:
            raise

        logger.warning(
            "google place search unavailable(status=%s), trying kakao fallback",
            google_error.status_code,
        )
        try:
            return _search_places_external_kakao(query, size=size)
        except HTTPException:
            raise google_error


def _search_saved_places(
    db: Optional[Session],
    *,
    keyword: str,
    size: int,
    user_id: Optional[str] = None,
) -> list[dict]:
    if db is None:
        return []

    needle = normalize_text(keyword)
    if not needle:
        return []

    query = db.query(Place).filter(
        Place.gps_lat.is_not(None),
        Place.gps_lng.is_not(None),
        or_(
            func.lower(Place.name).like(f"%{needle}%"),
            func.lower(func.coalesce(Place.address, "")).like(f"%{needle}%"),
        ),
    )
    if user_id:
        query = query.filter(Place.user_id == user_id)

    rows = (
        query.order_by(desc(Place.success_count), desc(Place.last_used_at), desc(Place.place_id))
        .limit(max(1, min(size, 15)))
        .all()
    )

    out: list[dict] = []
    for row in rows:
        lat = _as_float(row.gps_lat)
        lng = _as_float(row.gps_lng)
        if lat is None or lng is None:
            continue
        out.append(
            {
                "provider": "saved",
                "provider_id": str(row.place_id),
                "place_name": str(row.name or "").strip(),
                "address": str(row.address or "").strip() or None,
                "road_address": str(row.address or "").strip() or None,
                "category_name": "saved_place",
                "lat": lat,
                "lng": lng,
            }
        )
    return out


def search_places(
    query: str,
    size: int = 8,
    *,
    db: Optional[Session] = None,
    user_id: Optional[str] = None,
) -> list[dict]:
    keyword = (query or "").strip()
    if not keyword:
        return []

    result_size = max(1, min(int(size), 15))
    fallback = _search_saved_places(db, keyword=keyword, size=result_size, user_id=user_id)

    try:
        results = _search_places_external(keyword, result_size)
    except HTTPException as exc:
        if exc.status_code in (502, 503):
            logger.warning("place search external unavailable, fallback only: status=%s", exc.status_code)
            return fallback
        raise

    return results or fallback


# === ë¯¸ì¸?ë (MicroAction) ì¡°í ===
def get_micro_actions_by_task(
    db: Session,
    task_id: int,
    user_id: Optional[str] = None,
    limit: int = 10,
    search: Optional[str] = None,
    include_unused: bool = False,
) -> list[MicroAction]:
    """Fetch micro actions for a task with optional search."""
    query = db.query(MicroAction).filter(MicroAction.task_id == task_id)
    if user_id:
        query = query.filter(MicroAction.user_id == user_id)
    if search:
        needle = normalize_text(search)
        if needle:
            query = query.filter(func.lower(MicroAction.name).like(f"%{needle}%"))
    if not include_unused:
        query = query.filter(MicroAction.total_count > 0)
    return (
        query.order_by(
            desc(MicroAction.success_count),
            desc(MicroAction.total_count),
            desc(MicroAction.last_used_at),
        )
        .limit(limit)
        .all()
    )


def _find_micro_action_by_normalized_name(
    db: Session, task_id: int, name: str, user_id: Optional[str] = None
) -> Optional[MicroAction]:
    normalized = normalize_text(name)
    if not normalized:
        return None
    query = db.query(MicroAction).filter(MicroAction.task_id == task_id)
    if user_id:
        query = query.filter(MicroAction.user_id == user_id)
    for row in query.all():
        if normalize_text(row.name) == normalized:
            return row
    return None


def _resolve_task_id(
    db: Session,
    task_id: Optional[int],
    task_title: Optional[str],
    task_est_minutes: Optional[int],
) -> int:
    if task_id is not None:
        exists = db.query(Task.task_id).filter(Task.task_id == task_id).first()
        if not exists:
            raise HTTPException(status_code=404, detail='task_id not found')
        return task_id
    if not task_title:
        raise HTTPException(status_code=422, detail='task_id or task_title is required')
    est_minutes = task_est_minutes or 30
    new_task = Task(
        title=task_title,
        est_minutes=est_minutes,
        priority=1,
        tags=None,
        energy_cost=None,
        pain_sensitive=False,
        requires_focus=False,
    )
    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    return new_task.task_id


def get_or_create_micro_action(
    db: Session,
    task_id: int,
    name: str,
    description: Optional[str] = None,
    start_trigger: Optional[str] = None,
    source: str = 'user_custom',
    est_minutes: Optional[int] = None,
    user_id: Optional[str] = None,
) -> MicroAction:
    """Get or create micro action using normalized name matching."""
    existing = _find_micro_action_by_normalized_name(db, task_id, name, user_id)
    if existing:
        if description:
            existing.description = description
        if start_trigger:
            existing.start_trigger = start_trigger
        if est_minutes is not None:
            existing.est_minutes = est_minutes
        existing.last_used_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return existing

    micro_action = MicroAction(
        user_id=user_id,
        task_id=task_id,
        name=name,
        description=description,
        start_trigger=start_trigger,
        source=source,
        est_minutes=est_minutes,
        last_used_at=datetime.utcnow(),
    )
    db.add(micro_action)
    db.commit()
    db.refresh(micro_action)
    return micro_action


def create_micro_action(
    db: Session,
    name: str,
    description: Optional[str],
    start_trigger: Optional[str],
    source: str,
    est_minutes: Optional[int],
    task_id: Optional[int],
    task_title: Optional[str],
    task_est_minutes: Optional[int],
    user_id: Optional[str],
) -> MicroAction:
    resolved_task_id = _resolve_task_id(db, task_id, task_title, task_est_minutes)
    return get_or_create_micro_action(
        db=db,
        task_id=resolved_task_id,
        name=name,
        description=description,
        start_trigger=start_trigger,
        source=source,
        est_minutes=est_minutes,
        user_id=user_id,
    )


# === ë¯¸ì ?íë¦?(MissionTemplate) ì¡°í ===
def get_mission_presets(
    db: Session, micro_action_id: int, user_id: Optional[str] = None
) -> list[MissionTemplate]:
    """?¹ì ë¯¸ì¸?ë??ë¯¸ì ?ë¦¬??ì¡°í"""
    query = db.query(MissionTemplate).filter(MissionTemplate.micro_action_id == micro_action_id)
    if user_id:
        query = query.filter(MissionTemplate.user_id == user_id)
    return query.order_by(desc(MissionTemplate.last_used_at)).all()


def create_mission_template(
    db: Session,
    micro_action_id: int,
    mission_type: str,
    config: dict,
    enabled: bool = True,
    user_id: Optional[str] = None,
) -> MissionTemplate:
    """ë¯¸ì ?íë¦??ì±"""
    mission = MissionTemplate(
        user_id=user_id,
        micro_action_id=micro_action_id,
        mission_type=mission_type,
        enabled=enabled,
        config=config,
    )
    db.add(mission)
    db.commit()
    db.refresh(mission)
    return mission


# === Task ìµê·¼ ?¬ì© ?´ë¥ ===
def get_recent_tasks(db: Session, user_id: Optional[str] = None, limit: int = 10) -> list[dict]:
    """ìµê·¼ ?¬ì©??Task ëª©ë¡ (?±ê³µë¥??¬í¨)"""
    # DayPlan?ì Task ?¬ì© ?µê³ ì§ê³
    # ê°ë¨ êµ¬í: Task ?ì´ë¸ì??ìµê·¼ ?ì±?ì¼ë¡?ë°í (?¥í ExecutionLog ?°ë ?ì)
    tasks = db.query(Task).order_by(desc(Task.created_at)).limit(limit).all()

    results = []
    for task in tasks:
        # TODO: ExecutionLog?ì ?¤ì ?±ê³µë¥?ê³ì°
        results.append(
            {
                "task_id": task.task_id,
                "title": task.title,
                "est_minutes": task.est_minutes,
                "success_count": 0,  # ?ìê°?
                "total_count": 0,  # ?ìê°?
                "success_rate": 0.0,  # ?ìê°?
                "last_used_at": task.created_at,
            }
        )
    return results

