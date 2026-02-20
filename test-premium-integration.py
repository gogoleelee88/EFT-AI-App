#!/usr/bin/env python3
"""
프리미엄 인증 통합 테스트 스크립트
백엔드 + 프론트엔드 연동 검증
"""

import requests
import json
import time
import os
from typing import Dict, Any

# 테스트 설정
BASE_URL = "http://127.0.0.1:8000"
VALID_PREMIUM_KEY = os.getenv("PREMIUM_API_KEY", "TEST_PREMIUM_KEY_PLACEHOLDER")
INVALID_KEY = "invalid-key-12345"
GENERAL_KEY = os.getenv("API_KEY", "TEST_API_KEY_PLACEHOLDER")

class PremiumIntegrationTest:
    def __init__(self, base_url: str = BASE_URL):
        self.base_url = base_url
        self.results = []

    def log_result(self, test_name: str, success: bool, details: str = ""):
        """테스트 결과 로깅"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   📝 {details}")

        self.results.append({
            "test": test_name,
            "success": success,
            "details": details
        })

    def test_premium_key_validation(self):
        """프리미엄 키 검증 엔드포인트 테스트"""
        print("\n🔑 프리미엄 키 검증 테스트")

        # 1) 키 없음
        try:
            response = requests.get(f"{self.base_url}/api/premium/validate")
            success = response.status_code == 401
            self.log_result("키 없음 → 401", success, f"Status: {response.status_code}")
        except Exception as e:
            self.log_result("키 없음 → 401", False, f"Error: {e}")

        # 2) 잘못된 키
        try:
            response = requests.get(
                f"{self.base_url}/api/premium/validate",
                headers={"X-API-Key": INVALID_KEY}
            )
            success = response.status_code == 401
            self.log_result("잘못된 키 → 401", success, f"Status: {response.status_code}")
        except Exception as e:
            self.log_result("잘못된 키 → 401", False, f"Error: {e}")

        # 3) 올바른 키
        try:
            response = requests.get(
                f"{self.base_url}/api/premium/validate",
                headers={"X-API-Key": VALID_PREMIUM_KEY}
            )
            success = response.status_code == 200
            if success:
                data = response.json()
                details = f"Tier: {data.get('tier')}, Valid: {data.get('valid')}"
            else:
                details = f"Status: {response.status_code}"
            self.log_result("올바른 키 → 200", success, details)
        except Exception as e:
            self.log_result("올바른 키 → 200", False, f"Error: {e}")

    def test_premium_chat_auth(self):
        """프리미엄 채팅 인증 테스트"""
        print("\n💬 프리미엄 채팅 인증 테스트")

        payload = {
            "message": "Hello, this is a premium test",
            "temperature": 0.7,
            "max_tokens": 100
        }

        # 1) 키 없음
        try:
            response = requests.post(
                f"{self.base_url}/api/chat/premium",
                json=payload,
                headers={"Content-Type": "application/json"}
            )
            success = response.status_code == 401
            self.log_result("프리미엄 채팅 키 없음 → 401", success, f"Status: {response.status_code}")
        except Exception as e:
            self.log_result("프리미엄 채팅 키 없음 → 401", False, f"Error: {e}")

        # 2) 잘못된 키
        try:
            response = requests.post(
                f"{self.base_url}/api/chat/premium",
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-API-Key": INVALID_KEY
                }
            )
            success = response.status_code == 401
            self.log_result("프리미엄 채팅 잘못된 키 → 401", success, f"Status: {response.status_code}")
        except Exception as e:
            self.log_result("프리미엄 채팅 잘못된 키 → 401", False, f"Error: {e}")

        # 3) 올바른 키 (실제 AI 연결 불가 시 500/503 예상)
        try:
            response = requests.post(
                f"{self.base_url}/api/chat/premium",
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-API-Key": VALID_PREMIUM_KEY
                },
                timeout=30
            )
            # 인증 통과면 200 또는 503(서비스 불가)
            success = response.status_code in [200, 503]
            if response.status_code == 200:
                details = "AI 응답 성공"
            elif response.status_code == 503:
                details = "인증 통과, AI 서비스 일시 불가"
            else:
                details = f"Status: {response.status_code}"
            self.log_result("프리미엄 채팅 올바른 키", success, details)
        except Exception as e:
            self.log_result("프리미엄 채팅 올바른 키", False, f"Error: {e}")

    def test_free_tier_access(self):
        """무료 티어 접근 테스트"""
        print("\n🆓 무료 티어 접근 테스트")

        payload = {
            "message": "Hello, this is a free tier test",
            "temperature": 0.7,
            "max_tokens": 100
        }

        # 1) 일반 키로 무료 엔드포인트
        try:
            response = requests.post(
                f"{self.base_url}/api/chat/compare",
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-API-Key": GENERAL_KEY
                },
                timeout=15
            )
            success = response.status_code in [200, 503]
            if response.status_code == 200:
                data = response.json()
                details = f"Faster: {data.get('faster_model')}"
            else:
                details = f"Status: {response.status_code}"
            self.log_result("무료 티어 일반 키", success, details)
        except Exception as e:
            self.log_result("무료 티어 일반 키", False, f"Error: {e}")

        # 2) 프리미엄 키로도 무료 엔드포인트 접근 가능한지
        try:
            response = requests.post(
                f"{self.base_url}/api/chat/compare",
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-API-Key": VALID_PREMIUM_KEY
                },
                timeout=15
            )
            success = response.status_code in [200, 503]
            details = f"Status: {response.status_code} (프리미엄 키로 무료 접근)"
            self.log_result("무료 티어 프리미엄 키", success, details)
        except Exception as e:
            self.log_result("무료 티어 프리미엄 키", False, f"Error: {e}")

    def test_cors_headers(self):
        """CORS 헤더 테스트"""
        print("\n🌐 CORS 헤더 테스트")

        # OPTIONS 요청으로 CORS 확인
        try:
            response = requests.options(
                f"{self.base_url}/api/chat/premium",
                headers={
                    "Origin": "http://localhost:5173",
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "X-API-Key,Content-Type"
                }
            )

            success = response.status_code in [200, 204]
            cors_headers = response.headers.get("Access-Control-Allow-Headers", "")
            has_api_key = "X-API-Key" in cors_headers or "x-api-key" in cors_headers.lower()

            details = f"CORS Headers: {cors_headers}, X-API-Key 허용: {has_api_key}"
            self.log_result("CORS X-API-Key 헤더 허용", success and has_api_key, details)
        except Exception as e:
            self.log_result("CORS X-API-Key 헤더 허용", False, f"Error: {e}")

    def run_all_tests(self):
        """모든 테스트 실행"""
        print("🧪 프리미엄 인증 통합 테스트 시작")
        print("=" * 60)

        start_time = time.time()

        self.test_premium_key_validation()
        self.test_premium_chat_auth()
        self.test_free_tier_access()
        self.test_cors_headers()

        end_time = time.time()

        # 결과 요약
        print(f"\n📊 테스트 결과 요약")
        print("=" * 60)

        total_tests = len(self.results)
        passed_tests = sum(1 for r in self.results if r["success"])
        failed_tests = total_tests - passed_tests

        print(f"전체 테스트: {total_tests}")
        print(f"✅ 성공: {passed_tests}")
        print(f"❌ 실패: {failed_tests}")
        print(f"⏱️ 소요 시간: {end_time - start_time:.2f}초")

        success_rate = (passed_tests / total_tests) * 100 if total_tests > 0 else 0
        print(f"📈 성공률: {success_rate:.1f}%")

        if failed_tests > 0:
            print(f"\n❌ 실패한 테스트:")
            for result in self.results:
                if not result["success"]:
                    print(f"   - {result['test']}: {result['details']}")

        return success_rate >= 80  # 80% 이상 성공 시 전체 성공으로 간주

if __name__ == "__main__":
    # 서버 연결 확인
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        if response.status_code != 200:
            print(f"❌ 서버 연결 실패: {BASE_URL}")
            exit(1)
    except Exception as e:
        print(f"❌ 서버 연결 실패: {e}")
        exit(1)

    # 테스트 실행
    tester = PremiumIntegrationTest()
    success = tester.run_all_tests()

    exit(0 if success else 1)
