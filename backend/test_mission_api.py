#!/usr/bin/env python3
"""
미션 설정 API 엔드포인트 테스트 스크립트

실행:
    cd backend
    python test_mission_api.py
"""

import asyncio
import requests
from datetime import date

BASE_URL = "http://localhost:8000"


def test_api(method: str, path: str, **kwargs):
    """API 호출 헬퍼"""
    url = f"{BASE_URL}{path}"
    print(f"\n🔹 {method} {path}")

    try:
        if method == "GET":
            response = requests.get(url, **kwargs)
        elif method == "POST":
            response = requests.post(url, **kwargs)
        elif method == "PUT":
            response = requests.put(url, **kwargs)
        elif method == "DELETE":
            response = requests.delete(url, **kwargs)
        else:
            raise ValueError(f"Unknown method: {method}")

        print(f"   Status: {response.status_code}")
        if response.status_code < 400:
            data = response.json() if response.content else None
            print(f"   ✅ 성공")
            if data:
                print(f"   Data: {str(data)[:200]}...")
            return data
        else:
            print(f"   ❌ 실패: {response.text[:200]}")
            return None
    except Exception as e:
        print(f"   ❌ 오류: {e}")
        return None


def main():
    print("=" * 60)
    print("🧪 미션 설정 API 테스트")
    print("=" * 60)

    # 1. 헬스체크
    print("\n📍 1. 헬스체크")
    test_api("GET", "/health")

    # 2. Task 최근 이력
    print("\n📍 2. Task 최근 이력 조회")
    tasks = test_api("GET", "/api/spec/tasks/recent?limit=5")

    # 3. 장소 목록
    print("\n📍 3. 장소 목록 조회")
    places = test_api("GET", "/api/spec/places")

    # 4. 장소 등록
    print("\n📍 4. 새 장소 등록")
    new_place = test_api(
        "POST",
        "/api/spec/places",
        json={
            "name": "헬스장",
            "address": "서울시 강남구",
            "gps_lat": 37.5,
            "gps_lng": 127.0,
            "gps_radius": 50,
            "verification_method": ["gps"],
        },
    )

    # 5. 미세행동 조회 (Task ID 필요)
    if tasks and len(tasks) > 0:
        task_id = tasks[0].get("task_id")
        if task_id:
            print(f"\n📍 5. 미세행동 이력 조회 (Task ID: {task_id})")
            micro_actions = test_api(
                "GET", f"/api/spec/micro-actions?task_id={task_id}"
            )

            # 6. 미션 프리셋 조회 (MicroAction ID 필요)
            if micro_actions and len(micro_actions) > 0:
                micro_action_id = micro_actions[0].get("micro_action_id")
                if micro_action_id:
                    print(
                        f"\n📍 6. 미션 프리셋 조회 (MicroAction ID: {micro_action_id})"
                    )
                    test_api(
                        "GET",
                        f"/api/spec/missions/presets?micro_action_id={micro_action_id}",
                    )

    # 7. AI 미세행동 추천
    print("\n📍 7. AI 미세행동 추천 (ChatGPT)")
    test_api("POST", "/api/spec/micro-actions/recommend?task_title=수학%20공부하기")

    # 8. AI 미션 추천
    print("\n📍 8. AI 미션 추천 (ChatGPT)")
    test_api(
        "POST",
        "/api/spec/missions/recommend?task_title=수학%20공부&micro_action_name=한%20문제만%20풀기",
    )

    # 9. 미션 포함 DayPlan 저장
    print("\n📍 9. 미션 포함 DayPlan 저장")
    today = date.today().isoformat()
    plan_data = {
        "date": today,
        "mode": 100,
        "items": [
            {
                "task_title": "테스트 할 일",
                "est_minutes": 30,
                "planned_block_minutes": 25,
                "micro_steps": ["첫 단계"],
                "micro_action": {
                    "name": "테스트 미세행동",
                    "description": "테스트용",
                    "source": "user_custom",
                },
                "missions": [
                    {
                        "type": "photo",
                        "enabled": True,
                        "config": {
                            "requirement": "테스트 사진",
                            "description": "테스트용 사진",
                        },
                    }
                ],
                "missions_combination_mode": "basic",
                "alarm": {"time": "19:00", "repeat": "daily"},
            }
        ],
    }
    saved_plan = test_api("POST", "/api/spec/plan/day-with-mission", json=plan_data)

    # 10. 하위 호환성 테스트 (기존 API)
    print("\n📍 10. 하위 호환성 테스트 (기존 /plan/day)")
    legacy_plan_data = {
        "date": today,
        "mode": 70,
        "items": [
            {
                "task_title": "레거시 테스트",
                "est_minutes": 20,
                "planned_block_minutes": 20,
                "micro_steps": ["단계1", "단계2"],
            }
        ],
    }
    test_api("POST", "/api/spec/plan/day", json=legacy_plan_data)

    print("\n" + "=" * 60)
    print("✅ 테스트 완료!")
    print("=" * 60)


if __name__ == "__main__":
    main()
