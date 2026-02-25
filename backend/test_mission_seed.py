#!/usr/bin/env python3
"""
ë¯¸ì ?¤ì ê¸°ë¥ ?ì¤???°ì´???ë ?¤í¬ë¦½í¸

?¤í:
    cd backend
    python test_mission_seed.py
"""

from datetime import datetime
from sqlalchemy.orm import Session

from backend.database import SessionLocal, Base, engine
from backend.spec_loop.models import (
    Task,
    MicroAction,
    MissionTemplate,
    Place,
)


def seed_test_data():
    """?ì¤?¸ì© ?°ì´???ì±"""
    db = SessionLocal()

    try:
        print("?± ?ì¤???°ì´???ë ?ì...")

        # ?ì´ë¸??ì± (?ì¼ë©?
        Base.metadata.create_all(bind=engine)
        print("???ì´ë¸??ì± ?ë£")

        # 1. ?ì¤??Task ?ì±
        tasks_data = [
            {"title": "?í ê³µë??ê¸°", "est_minutes": 60, "priority": 1},
            {"title": "?ì´ ?¨ì´ ?¸ì°ê¸?, "est_minutes": 30, "priority": 2},
            {"title": "?´ë?ê¸°", "est_minutes": 45, "priority": 3},
            {"title": "?ì?ê¸°", "est_minutes": 50, "priority": 2},
        ]

        tasks = []
        for data in tasks_data:
            existing = db.query(Task).filter(Task.title == data["title"]).first()
            if existing:
                tasks.append(existing)
                print(f"  ??¸  Task '{data['title']}' ?´ë? ì¡´ì¬ (ID: {existing.task_id})")
            else:
                task = Task(**data)
                db.add(task)
                db.flush()
                tasks.append(task)
                print(f"  ??Task '{data['title']}' ?ì± (ID: {task.task_id})")

        db.commit()

        # 2. ë¯¸ì¸?ë ?ì± (Taskë³ë¡)
        micro_actions_data = [
            {
                "task_id": tasks[0].task_id,  # ?í ê³µë?
                "name": "??ë¬¸ìë§??ê¸?,
                "description": "1ë²?ë¬¸ì ????ì",
                "start_trigger": "ë¬¸ì???ê·¸?¼ë? ì¹ê¸°",
                "source": "user_history",
                "success_count": 9,
                "total_count": 10,
            },
            {
                "task_id": tasks[0].task_id,
                "name": "ê°ë ê°ì ?£ê¸°",
                "description": "ê°ë ê°ì 1ê°??ì²",
                "start_trigger": "ê°ì ?ì ?¬ì",
                "source": "user_history",
                "success_count": 6,
                "total_count": 7,
            },
            {
                "task_id": tasks[1].task_id,  # ?ì´ ?¨ì´
                "name": "?¨ì´ 10ê°ë§ ?¸ì°ê¸?,
                "description": "?¨ì´??ì²?10ê°?,
                "start_trigger": "?¨ì´???¼ì¹ê¸?,
                "source": "user_history",
                "success_count": 8,
                "total_count": 10,
            },
            {
                "task_id": tasks[2].task_id,  # ?´ë
                "name": "?¤í¸?ì¹ 5ë¶?,
                "description": "ê°ë²¼ì´ ?¤í¸?ì¹?¼ë¡ ?ì",
                "start_trigger": "ë§¤í¸ ê¹ê¸°",
                "source": "user_history",
                "success_count": 7,
                "total_count": 8,
            },
        ]

        micro_actions = []
        for data in micro_actions_data:
            existing = (
                db.query(MicroAction)
                .filter(
                    MicroAction.task_id == data["task_id"],
                    MicroAction.name == data["name"],
                )
                .first()
            )
            if existing:
                micro_actions.append(existing)
                print(
                    f"  ??¸  MicroAction '{data['name']}' ?´ë? ì¡´ì¬ (ID: {existing.micro_action_id})"
                )
            else:
                micro_action = MicroAction(
                    user_id=None,  # NULL (?ì¤?¸ì©)
                    last_used_at=datetime.utcnow(),
                    **data,
                )
                db.add(micro_action)
                db.flush()
                micro_actions.append(micro_action)
                print(
                    f"  ??MicroAction '{data['name']}' ?ì± (ID: {micro_action.micro_action_id})"
                )

        db.commit()

        # 3. ?¥ì ?ì±
        places_data = [
            {
                "name": "?¤í°?ì¹´??,
                "address": "?ì¸??ê°ë¨êµ??í¤?ë¡?123",
                "gps_lat": 37.5012,
                "gps_lng": 127.0396,
                "gps_radius": 50,
                "wifi_ssid": "studycafe_5G",
                "verification_method": ["gps", "wifi"],
                "success_count": 9,
                "total_count": 10,
            },
            {
                "name": "ì§?- ì±ì",
                "address": "?ì¸???ì´êµ?,
                "wifi_ssid": "iptime_5G_1234",
                "verification_method": ["wifi"],
                "success_count": 6,
                "total_count": 7,
            },
            {
                "name": "?ìê´ 3ì¸?,
                "address": "?ì¸???ì´êµ?ë°í¬?ë¡?201",
                "gps_lat": 37.4833,
                "gps_lng": 127.0322,
                "gps_radius": 30,
                "verification_method": ["gps"],
                "success_count": 3,
                "total_count": 4,
            },
        ]

        places = []
        for data in places_data:
            existing = db.query(Place).filter(Place.name == data["name"]).first()
            if existing:
                places.append(existing)
                print(f"  ??¸  Place '{data['name']}' ?´ë? ì¡´ì¬ (ID: {existing.place_id})")
            else:
                place = Place(
                    user_id=None,  # NULL (?ì¤?¸ì©)
                    last_used_at=datetime.utcnow(),
                    **data,
                )
                db.add(place)
                db.flush()
                places.append(place)
                print(f"  ??Place '{data['name']}' ?ì± (ID: {place.place_id})")

        db.commit()

        # 4. ë¯¸ì ?íë¦??ì± (ë¯¸ì¸?ëë³ë¡)
        mission_templates_data = [
            {
                "micro_action_id": micro_actions[0].micro_action_id,  # ??ë¬¸ìë§??ê¸?
                "mission_type": "photo",
                "enabled": True,
                "config": {
                    "requirement": "?ê·¸?¼ë? + ??+ ë¬¸ìì§?,
                    "description": "ë¬¸ì???ê·¸?¼ë? ì¹??¬ì§",
                    "ocr_keywords": ["1", "ë²?],
                    "objects_required": ["pen", "book", "circle_mark"],
                    "verification_method": "OCR(ë¬¸ì ë²í¸) + ??ì±?ê°ì²´ ê²ì¶?,
                },
                "success_count": 9,
                "total_count": 10,
            },
            {
                "micro_action_id": micro_actions[0].micro_action_id,
                "mission_type": "location",
                "enabled": True,
                "config": {
                    "place_id": places[0].place_id,
                    "place_name": "?¤í°?ì¹´??,
                    "gps": {"lat": 37.5012, "lng": 127.0396, "radius": 50},
                    "wifi_ssid": "studycafe_5G",
                    "verification_method": ["gps", "wifi"],
                },
                "success_count": 9,
                "total_count": 10,
            },
            {
                "micro_action_id": micro_actions[2].micro_action_id,  # ?¨ì´ ?¸ì°ê¸?
                "mission_type": "photo",
                "enabled": True,
                "config": {
                    "requirement": "?¨ì´??+ ??,
                    "description": "?¨ì´?¥ê³¼ ?ì´ ë³´ì´???¬ì§",
                    "objects_required": ["book", "pen"],
                    "verification_method": "ê°ì²´ ê²ì¶?,
                },
                "success_count": 8,
                "total_count": 10,
            },
        ]

        for data in mission_templates_data:
            existing = (
                db.query(MissionTemplate)
                .filter(
                    MissionTemplate.micro_action_id == data["micro_action_id"],
                    MissionTemplate.mission_type == data["mission_type"],
                )
                .first()
            )
            if existing:
                print(
                    f"  ??¸  MissionTemplate (type={data['mission_type']}) ?´ë? ì¡´ì¬"
                )
            else:
                mission = MissionTemplate(
                    user_id=None,  # NULL (?ì¤?¸ì©)
                    last_used_at=datetime.utcnow(),
                    **data,
                )
                db.add(mission)
                db.flush()
                print(
                    f"  ??MissionTemplate (type={data['mission_type']}) ?ì± (ID: {mission.mission_template_id})"
                )

        db.commit()

        print("\n? ?ì¤???°ì´???ë ?ë£!")
        print(f"  - Tasks: {len(tasks)}ê°?)
        print(f"  - MicroActions: {len(micro_actions)}ê°?)
        print(f"  - Places: {len(places)}ê°?)
        print(f"  - MissionTemplates: {len(mission_templates_data)}ê°?)

    except Exception as e:
        db.rollback()
        print(f"\n???ë ?¤í¨: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_test_data()


