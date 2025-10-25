#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
P11 휴리스틱 테스트 스크립트 - /api/chat/compare 엔드포인트
"""
import requests
import json
import sys

# UTF-8 출력 설정
if sys.platform == "win32":
    import codecs
    sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach())

API_BASE_URL = "http://127.0.0.1:8000"

def test_compare_endpoint(message, test_name, expected_action_types):
    """
    /api/chat/compare 엔드포인트 테스트
    부정적 감정 감지 → EFT 제안 + SUDS 측정 플로우 검증
    """
    print(f"\n{'='*60}")
    print(f"Test: {test_name}")
    print(f"Message: {message}")
    print(f"Expected Actions: {expected_action_types}")
    print(f"{'='*60}")

    payload = {
        "message": message,
        "temperature": 0.7,
        "max_tokens": 512
    }

    try:
        response = requests.post(
            f"{API_BASE_URL}/api/chat/compare",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=120
        )

        print(f"Status Code: {response.status_code}")

        if response.status_code != 200:
            print(f"Error Response: {response.text}")
            return False

        data = response.json()

        # 필드 확인
        print(f"Response Keys: {list(data.keys())}")
        print(f"Has 'actions' field: {'actions' in data}")

        if "actions" not in data:
            print("❌ FAIL: 'actions' field missing from response")
            print(f"Full Response: {json.dumps(data, ensure_ascii=False, indent=2)[:1000]}")
            return False

        actions = data.get("actions", [])
        print(f"Actions count: {len(actions)}")
        print(f"Actions: {json.dumps(actions, ensure_ascii=False, indent=2)}")

        # 예상되는 액션 타입들이 모두 있는지 확인
        action_types = [a.get("type") for a in actions]
        all_found = all(expected_type in action_types for expected_type in expected_action_types)

        if all_found:
            print(f"✅ PASS: 모든 예상 액션 발견 ({expected_action_types})")
            return True
        else:
            missing = [et for et in expected_action_types if et not in action_types]
            print(f"❌ FAIL: 누락된 액션 타입: {missing}")
            print(f"실제 액션 타입: {action_types}")
            return False

    except Exception as e:
        print(f"❌ Exception: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """메인 테스트 실행"""
    print("=" * 60)
    print("부정적 감정 감지 → EFT 자동 제안 플로우 테스트")
    print("=" * 60)

    # 부정적 감정 기반 테스트 케이스
    tests = [
        ("너무 스트레스받아요", "Test 1: 스트레스 감정", ["suggest_eft"]),
        ("불안해서 잠이 안 와요", "Test 2: 불안 감정", ["suggest_eft"]),
        ("화가 나서 미칠 것 같아요", "Test 3: 분노 감정", ["suggest_eft"]),
    ]

    results = []
    for message, test_name, expected_actions in tests:
        result = test_compare_endpoint(message, test_name, expected_actions)
        results.append((test_name, result))

    # 최종 결과
    print("\n" + "=" * 60)
    print("테스트 결과 요약")
    print("=" * 60)
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")

    total = len(results)
    passed = sum(1 for _, r in results if r)
    print(f"\n총 {passed}/{total} 테스트 통과")

    if passed == total:
        print("🎉 모든 테스트 통과!")
        sys.exit(0)
    else:
        print("⚠️ 일부 테스트 실패")
        sys.exit(1)

if __name__ == "__main__":
    main()
