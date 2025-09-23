#!/usr/bin/env python3
"""
프리미엄 인증 테스트 스크립트
"""

import requests
import json

BASE_URL = "http://127.0.0.1:8000"

# 테스트 데이터
PREMIUM_API_KEY = "premium-eft-ai-moodtalk-2025!"
INVALID_API_KEY = "invalid-key"

def test_premium_auth():
    """프리미엄 인증 테스트"""
    print("🧪 프리미엄 인증 테스트 시작")
    print("=" * 50)

    # 테스트 페이로드
    payload = {
        "message": "안녕하세요, 오늘 기분이 좋지 않아요",
        "temperature": 0.7,
        "max_tokens": 100
    }

    tests = [
        {
            "name": "1. API 키 없이 요청",
            "headers": {"Content-Type": "application/json"},
            "expected_status": 401
        },
        {
            "name": "2. 잘못된 API 키로 요청",
            "headers": {
                "Content-Type": "application/json",
                "X-API-Key": INVALID_API_KEY
            },
            "expected_status": 401
        },
        {
            "name": "3. 올바른 프리미엄 API 키로 요청",
            "headers": {
                "Content-Type": "application/json",
                "X-API-Key": PREMIUM_API_KEY
            },
            "expected_status": 200
        }
    ]

    for test in tests:
        print(f"\n📋 {test['name']}")

        try:
            response = requests.post(
                f"{BASE_URL}/api/chat/premium",
                headers=test["headers"],
                json=payload,
                timeout=10
            )

            status = response.status_code
            print(f"   응답 상태: {status}")

            if status == test["expected_status"]:
                print(f"   ✅ 성공 (예상: {test['expected_status']})")

                if status == 200:
                    try:
                        result = response.json()
                        print(f"   📊 응답 타입: {type(result)}")
                        if isinstance(result, dict) and "response" in result:
                            print(f"   💬 AI 응답: {result['response'][:100]}...")
                    except:
                        print("   📊 응답 파싱 실패")

            else:
                print(f"   ❌ 실패 (예상: {test['expected_status']}, 실제: {status})")

            if status >= 400:
                try:
                    error = response.json()
                    print(f"   🔍 오류 메시지: {error.get('detail', 'Unknown error')}")
                except:
                    print(f"   🔍 오류 내용: {response.text[:100]}")

        except requests.exceptions.RequestException as e:
            print(f"   💥 요청 실패: {e}")
        except Exception as e:
            print(f"   💥 예상치 못한 오류: {e}")

def test_health_check():
    """헬스체크 테스트"""
    print("\n\n🏥 헬스체크 테스트")
    print("=" * 30)

    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        print(f"상태: {response.status_code}")

        if response.status_code == 200:
            result = response.json()
            print(f"서버 상태: {result.get('status', 'unknown')}")
        else:
            print("헬스체크 실패")

    except Exception as e:
        print(f"헬스체크 오류: {e}")

if __name__ == "__main__":
    test_health_check()
    test_premium_auth()
    print("\n🎉 테스트 완료!")