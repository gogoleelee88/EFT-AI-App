#!/usr/bin/env python3
"""
EFT AI 서버 스모크 테스트
기본 API 엔드포인트들이 정상 작동하는지 확인
"""

import sys
import json
import urllib.request
import urllib.parse
from urllib.error import URLError
import time

def test_endpoint(url, method="GET", data=None, headers=None):
    """엔드포인트 테스트"""
    try:
        if headers is None:
            headers = {}

        if data is not None:
            data = json.dumps(data).encode('utf-8')
            headers['Content-Type'] = 'application/json'

        req = urllib.request.Request(url, data=data, headers=headers, method=method)

        with urllib.request.urlopen(req, timeout=5) as response:
            status = response.getcode()
            content = response.read().decode('utf-8')

            try:
                json_content = json.loads(content)
                return status, json_content
            except json.JSONDecodeError:
                return status, content

    except URLError as e:
        return None, str(e)
    except Exception as e:
        return None, str(e)

def main():
    print("🧪 EFT AI 서버 스모크 테스트 시작")
    print("=" * 50)

    base_url = "http://127.0.0.1:8000"

    # 테스트 케이스들
    tests = [
        {
            "name": "헬스체크",
            "url": f"{base_url}/health",
            "method": "GET",
            "expected_status": 200
        },
        {
            "name": "OpenAPI 스키마",
            "url": f"{base_url}/openapi.json",
            "method": "GET",
            "expected_status": 200
        },
        {
            "name": "API 문서",
            "url": f"{base_url}/docs",
            "method": "GET",
            "expected_status": 200
        },
        {
            "name": "SUDS 저장",
            "url": f"{base_url}/suds",
            "method": "POST",
            "data": {
                "type": "manual",
                "score": 5,
                "session_id": "smoke_test",
                "user_id": "test_user"
            },
            "expected_status": 200
        }
    ]

    passed = 0
    failed = 0

    for test in tests:
        print(f"📋 테스트: {test['name']}")
        print(f"   URL: {test['url']}")

        status, result = test_endpoint(
            test['url'],
            method=test.get('method', 'GET'),
            data=test.get('data')
        )

        if status == test.get('expected_status', 200):
            print(f"   ✅ 성공 (HTTP {status})")
            passed += 1

            # 결과 요약 출력
            if isinstance(result, dict):
                if 'ok' in result:
                    print(f"   📊 응답: ok={result['ok']}")
                elif 'status' in result:
                    print(f"   📊 응답: status={result['status']}")
                else:
                    print(f"   📊 응답: {type(result).__name__} 객체")
            else:
                print(f"   📊 응답: {len(str(result))} 문자")

        else:
            print(f"   ❌ 실패 (HTTP {status})")
            print(f"   🔍 오류: {result}")
            failed += 1

        print()

    print("=" * 50)
    print(f"📊 테스트 결과: ✅ {passed}개 성공, ❌ {failed}개 실패")

    if failed == 0:
        print("🎉 모든 테스트 통과! 서버가 정상 작동 중입니다.")
        return 0
    else:
        print("⚠️ 일부 테스트 실패. 서버 상태를 확인해주세요.")
        return 1

if __name__ == "__main__":
    try:
        exit_code = main()
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\n\n⏹️ 테스트가 중단되었습니다.")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n💥 예상치 못한 오류: {e}")
        sys.exit(1)