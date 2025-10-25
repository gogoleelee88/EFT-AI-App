#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
P11 E2E Smoke Test - ask_suds Action Auto-Emission
로컬/운영 환경 모두 테스트 가능
"""
import requests
import json
import sys
import os
from typing import Dict, Any

# 환경변수로 API URL 주입 가능
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")

class Color:
    """ANSI 색상 코드"""
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'
    BOLD = '\033[1m'

def print_header(text: str):
    """섹션 헤더 출력"""
    print(f"\n{Color.BOLD}{Color.BLUE}{'=' * 70}{Color.RESET}")
    print(f"{Color.BOLD}{Color.BLUE}{text}{Color.RESET}")
    print(f"{Color.BOLD}{Color.BLUE}{'=' * 70}{Color.RESET}\n")

def print_pass(text: str):
    """성공 메시지 출력"""
    print(f"{Color.GREEN}✓ PASS{Color.RESET}: {text}")

def print_fail(text: str):
    """실패 메시지 출력"""
    print(f"{Color.RED}✗ FAIL{Color.RESET}: {text}")

def print_info(text: str):
    """정보 메시지 출력"""
    print(f"{Color.YELLOW}ℹ INFO{Color.RESET}: {text}")

def test_ask_suds_emission(test_name: str, message: str, expected_trigger: str) -> bool:
    """
    ask_suds 액션 방출 테스트

    Args:
        test_name: 테스트 케이스 이름
        message: 사용자 메시지
        expected_trigger: 예상되는 트리거 (설명용)

    Returns:
        bool: 테스트 성공 여부
    """
    print_header(test_name)
    print_info(f"Message: '{message}'")
    print_info(f"Expected Trigger: {expected_trigger}")

    payload = {
        "message": message,
        "conversation_history": []
    }

    try:
        response = requests.post(
            f"{API_BASE_URL}/api/chat",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=120
        )

        print_info(f"HTTP Status: {response.status_code}")

        if response.status_code != 200:
            print_fail(f"Expected HTTP 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False

        data = response.json()

        # AI 응답 출력 (처음 100자)
        ai_response = data.get('response', '')[:100]
        print_info(f"AI Response: {ai_response}...")

        # actions 배열 확인
        actions = data.get('actions', [])
        print_info(f"Actions: {json.dumps(actions, indent=2, ensure_ascii=False)}")

        # ask_suds 액션 존재 여부 확인
        ask_suds_found = any(
            a.get('type') == 'ask_suds' for a in actions
        )

        if ask_suds_found:
            # payload 확인
            ask_suds_action = next(
                a for a in actions if a.get('type') == 'ask_suds'
            )
            payload = ask_suds_action.get('payload', {})
            measurement_type = payload.get('measurement_type')

            if measurement_type == 'check':
                print_pass(f"ask_suds action emitted with correct payload")
                return True
            else:
                print_fail(f"ask_suds payload incorrect: {payload}")
                return False
        else:
            print_fail("ask_suds action NOT found in actions array")
            return False

    except requests.exceptions.Timeout:
        print_fail("Request timed out (>120s)")
        return False
    except requests.exceptions.ConnectionError:
        print_fail(f"Connection failed to {API_BASE_URL}")
        return False
    except Exception as e:
        print_fail(f"Unexpected error: {e}")
        return False

def main():
    """메인 테스트 실행"""
    print_header(f"P11 E2E Smoke Test - ask_suds Auto-Emission")
    print_info(f"API URL: {API_BASE_URL}")

    # 헬스체크
    try:
        health_response = requests.get(f"{API_BASE_URL}/health", timeout=10)
        if health_response.status_code == 200:
            print_pass("API server is healthy")
        else:
            print_fail(f"API health check failed: HTTP {health_response.status_code}")
            sys.exit(1)
    except Exception as e:
        print_fail(f"Cannot connect to API: {e}")
        sys.exit(1)

    # 테스트 케이스
    tests = [
        {
            "name": "Test 1: AI Response with '0~10' Pattern",
            "message": "지금 내 불안 정도를 0에서 10까지 평가해줘",
            "trigger": "AI가 '0~10' 패턴을 포함한 응답 생성 시"
        },
        {
            "name": "Test 2: User Inputs Number (0-10)",
            "message": "7",
            "trigger": "사용자가 0-10 범위 숫자만 입력 시"
        },
        {
            "name": "Test 3: User Keyword '평가'",
            "message": "내 기분을 평가하고 싶어요",
            "trigger": "사용자가 '평가' 키워드 사용 시"
        }
    ]

    results = []
    for test in tests:
        result = test_ask_suds_emission(
            test["name"],
            test["message"],
            test["trigger"]
        )
        results.append(result)

    # 최종 결과
    print_header("Final Results")

    passed = sum(results)
    total = len(results)

    for i, (test, result) in enumerate(zip(tests, results), 1):
        status = f"{Color.GREEN}✓ PASS{Color.RESET}" if result else f"{Color.RED}✗ FAIL{Color.RESET}"
        print(f"  {i}. {test['name']}: {status}")

    print(f"\n{Color.BOLD}Summary: {passed}/{total} tests passed{Color.RESET}\n")

    if passed == total:
        print(f"{Color.GREEN}{Color.BOLD}🎉 All tests passed! P11 feature is working correctly.{Color.RESET}\n")
        sys.exit(0)
    else:
        print(f"{Color.RED}{Color.BOLD}❌ Some tests failed. Check the output above for details.{Color.RESET}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()
