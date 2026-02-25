#!/usr/bin/env python3
"""
하위 호환성 검증 스크립트

기존 API가 여전히 정상 동작하는지 확인합니다.
"""

import requests
from datetime import date

BASE_URL = "http://localhost:8000"


def test_legacy_plan_day_api():
    """기존 POST /api/spec/plan/day API 테스트"""
    print("\n" + "=" * 60)
    print("🧪 하위 호환성 테스트: POST /api/spec/plan/day")
    print("=" * 60)

    today = date.today().isoformat()

    # 기존 방식 (micro_action, missions 필드 없음)
    legacy_payload = {
        "date": today,
        "mode": 70,
        "items": [
            {
                "task_title": "레거시 테스트 Task 1",
                "est_minutes": 30,
                "planned_block_minutes": 25,
                "micro_steps": ["단계1", "단계2", "단계3"],
            },
            {
                "task_id": 1,  # 기존 Task 재사용
                "planned_block_minutes": 40,
                "micro_steps": ["첫 2분 착수"],
            },
        ],
    }

    print(f"\n📤 요청: {legacy_payload}")

    try:
        response = requests.post(
            f"{BASE_URL}/api/spec/plan/day",
            json=legacy_payload,
            headers={"Content-Type": "application/json"},
        )

        print(f"\n📥 응답 상태: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            print(f"✅ 성공!")
            print(f"   day_id: {data.get('day_id')}")
            print(f"   date: {data.get('date')}")
            print(f"   mode: {data.get('mode')}")
            print(f"   items: {len(data.get('items', []))}개")

            # items 구조 확인
            for idx, item in enumerate(data.get("items", [])):
                print(f"\n   Item {idx + 1}:")
                print(f"     task_id: {item.get('task_id')}")
                print(f"     planned_block_minutes: {item.get('planned_block_minutes')}")
                print(f"     micro_steps: {item.get('micro_steps')}")
                # 🔍 micro_action, missions 필드가 없어도 OK
                if "micro_action" in item:
                    print(f"     ⚠️  micro_action: {item.get('micro_action')}")
                if "missions" in item:
                    print(f"     ⚠️  missions: {item.get('missions')}")

            return True
        else:
            print(f"❌ 실패: {response.text}")
            return False

    except Exception as e:
        print(f"❌ 오류: {e}")
        return False


def test_new_plan_day_with_mission_api():
    """새 POST /api/spec/plan/day-with-mission API 테스트"""
    print("\n" + "=" * 60)
    print("🧪 신규 API 테스트: POST /api/spec/plan/day-with-mission")
    print("=" * 60)

    today = date.today().isoformat()

    # 새 방식 (micro_action, missions 포함)
    new_payload = {
        "date": today,
        "mode": 100,
        "items": [
            {
                "task_title": "신규 API 테스트 Task",
                "est_minutes": 40,
                "planned_block_minutes": 30,
                "micro_steps": ["스텝1"],
                "micro_action": {
                    "name": "테스트 미세행동",
                    "description": "테스트용 미세행동",
                    "start_trigger": "시작하기",
                    "source": "user_custom",
                },
                "missions": [
                    {
                        "mission_id": "mission_1",
                        "type": "photo",
                        "enabled": True,
                        "config": {
                            "requirement": "테스트 사진",
                            "description": "테스트용",
                        },
                    }
                ],
                "missions_combination_mode": "basic",
                "alarm": {"time": "20:00", "repeat": "daily"},
            }
        ],
    }

    print(f"\n📤 요청: {new_payload}")

    try:
        response = requests.post(
            f"{BASE_URL}/api/spec/plan/day-with-mission",
            json=new_payload,
            headers={"Content-Type": "application/json"},
        )

        print(f"\n📥 응답 상태: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            print(f"✅ 성공!")
            print(f"   day_id: {data.get('day_id')}")

            # items 구조 확인
            for idx, item in enumerate(data.get("items", [])):
                print(f"\n   Item {idx + 1}:")
                print(f"     task_id: {item.get('task_id')}")
                print(f"     micro_action: {item.get('micro_action', {}).get('name')}")
                print(f"     missions: {len(item.get('missions', []))}개")
                print(f"     alarm: {item.get('alarm', {}).get('time')}")

            return True
        else:
            print(f"❌ 실패: {response.text}")
            return False

    except Exception as e:
        print(f"❌ 오류: {e}")
        return False


def test_get_plan_day():
    """GET /api/spec/plan/day/{day_id} 테스트"""
    print("\n" + "=" * 60)
    print("🧪 GET /api/spec/plan/day/{day_id} 테스트")
    print("=" * 60)

    # 먼저 plan 생성
    today = date.today().isoformat()
    create_response = requests.post(
        f"{BASE_URL}/api/spec/plan/day",
        json={
            "date": today,
            "mode": 100,
            "items": [{"task_title": "조회 테스트", "est_minutes": 20, "planned_block_minutes": 20}],
        },
    )

    if create_response.status_code == 200:
        day_id = create_response.json().get("day_id")
        print(f"✅ DayPlan 생성 (day_id: {day_id})")

        # 조회
        get_response = requests.get(f"{BASE_URL}/api/spec/plan/day/{day_id}")
        if get_response.status_code == 200:
            print(f"✅ 조회 성공!")
            return True
        else:
            print(f"❌ 조회 실패: {get_response.text}")
            return False
    else:
        print(f"❌ DayPlan 생성 실패")
        return False


def main():
    """전체 테스트 실행"""
    print("\n" + "=" * 60)
    print("🎯 미션 설정 기능 하위 호환성 검증")
    print("=" * 60)

    results = []

    # 1. 기존 API 테스트
    results.append(("기존 /plan/day", test_legacy_plan_day_api()))

    # 2. 신규 API 테스트
    results.append(("신규 /plan/day-with-mission", test_new_plan_day_with_mission_api()))

    # 3. 조회 API 테스트
    results.append(("GET /plan/day/{id}", test_get_plan_day()))

    # 결과 요약
    print("\n" + "=" * 60)
    print("📊 테스트 결과 요약")
    print("=" * 60)

    for name, result in results:
        status = "✅ 통과" if result else "❌ 실패"
        print(f"  {name}: {status}")

    all_passed = all(r[1] for r in results)
    if all_passed:
        print("\n🎉 모든 하위 호환성 테스트 통과!")
    else:
        print("\n⚠️  일부 테스트 실패. 위 로그를 확인하세요.")

    return all_passed


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
