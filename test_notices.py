#!/usr/bin/env python3
"""
공지사항 시스템 테스트 스크립트
End-to-End 테스트용
"""

import requests
import json
from datetime import datetime, timezone, timedelta

# 백엔드 서버 URL
BASE_URL = "http://localhost:8000"
NOTICES_API = f"{BASE_URL}/api/notices"

# 테스트용 관리자 API 키 (실제 환경에서는 안전하게 관리)
TEST_API_KEY = "test-admin-key-12345"

def test_create_notices():
    """테스트용 공지사항 생성"""

    # 현재 시간
    now = datetime.now(timezone.utc)
    tomorrow = now + timedelta(days=1)

    test_notices = [
        {
            "title": "🎉 TOCMOOD 베타 서비스 오픈!",
            "body": "**감정관리의 새로운 시작**\n\nTOCMOOD 베타 서비스가 공식 오픈되었습니다! AI 상담과 EFT 탭핑을 통해 일상의 감정을 건강하게 관리해보세요.\n\n- ✅ AI 개인화 상담\n- ✅ AR EFT 탭핑 가이드\n- ✅ 게임형 통찰 시스템",
            "severity": "success",
            "pinned": True,
            "lang": "ko",
            "startsAt": now.isoformat(),
            "endsAt": (now + timedelta(days=7)).isoformat()
        },
        {
            "title": "⚠️ 서버 점검 안내",
            "body": "더 나은 서비스 제공을 위해 **오늘 23:00-23:30** 서버 점검을 진행합니다.\n\n점검 시간 중에는 일시적으로 서비스 이용이 어려울 수 있습니다. 이용에 불편을 드려 죄송합니다.",
            "severity": "warning",
            "pinned": True,
            "lang": "ko",
            "startsAt": now.isoformat(),
            "endsAt": tomorrow.isoformat()
        },
        {
            "title": "💡 AI 상담 품질 개선 업데이트",
            "body": "AI 상담 시스템의 품질이 크게 개선되었습니다!\n\n**개선사항:**\n- Engine A/B 병렬 비교 시스템 도입\n- 한국어 이해력 30% 향상\n- 응답 속도 2배 개선\n\n더욱 자연스럽고 도움이 되는 상담을 경험해보세요.",
            "severity": "info",
            "pinned": False,
            "lang": "ko"
        },
        {
            "title": "🌟 Welcome to TOCMOOD Beta!",
            "body": "**Your emotional wellness journey starts here**\n\nTOCMOOD beta service is now officially open! Manage your daily emotions healthily through AI counseling and EFT tapping.\n\n- ✅ Personalized AI Counseling\n- ✅ AR EFT Tapping Guide\n- ✅ Gamified Insight System",
            "severity": "success",
            "pinned": False,
            "lang": "en",
            "startsAt": now.isoformat(),
            "endsAt": (now + timedelta(days=7)).isoformat()
        }
    ]

    created_notices = []

    print("🚀 테스트용 공지사항 생성 중...")

    for notice_data in test_notices:
        try:
            response = requests.post(
                NOTICES_API,
                headers={
                    "Content-Type": "application/json",
                    "X-API-Key": TEST_API_KEY
                },
                json=notice_data
            )

            if response.status_code == 200:
                notice = response.json()
                created_notices.append(notice)
                print(f"✅ 공지사항 생성 성공: {notice['title']}")
            else:
                print(f"❌ 공지사항 생성 실패: {response.status_code} - {response.text}")

        except Exception as e:
            print(f"❌ 요청 실패: {e}")

    return created_notices

def test_get_notices():
    """공지사항 목록 조회 테스트"""

    print("\n📋 공지사항 목록 조회 테스트...")

    try:
        # 기본 조회
        response = requests.get(NOTICES_API)

        if response.status_code == 200:
            notices = response.json()
            print(f"✅ 전체 공지사항 조회 성공: {len(notices)}개")

            for notice in notices[:3]:  # 상위 3개만 출력
                print(f"  - {notice['title']} ({notice['severity']}) [고정: {notice['pinned']}]")
        else:
            print(f"❌ 공지사항 조회 실패: {response.status_code}")

        # 언어별 조회
        response_ko = requests.get(f"{NOTICES_API}?lang=ko")
        response_en = requests.get(f"{NOTICES_API}?lang=en")

        if response_ko.status_code == 200 and response_en.status_code == 200:
            ko_notices = response_ko.json()
            en_notices = response_en.json()
            print(f"✅ 언어별 조회 성공: 한국어 {len(ko_notices)}개, 영어 {len(en_notices)}개")

        # ETag 테스트
        etag = response.headers.get('ETag')
        if etag:
            print(f"✅ ETag 확인: {etag}")

            # 304 테스트
            response_304 = requests.get(NOTICES_API, headers={"If-None-Match": etag})
            if response_304.status_code == 304:
                print("✅ 304 Not Modified 캐싱 작동 확인")
            else:
                print(f"⚠️ 304 테스트 실패: {response_304.status_code}")

    except Exception as e:
        print(f"❌ 요청 실패: {e}")

def test_notice_detail():
    """공지사항 상세 조회 테스트"""

    print("\n🔍 공지사항 상세 조회 테스트...")

    try:
        # 먼저 목록을 가져와서 첫 번째 공지사항 ID 얻기
        response = requests.get(NOTICES_API)

        if response.status_code == 200:
            notices = response.json()
            if notices:
                notice_id = notices[0]['id']

                # 상세 조회
                detail_response = requests.get(f"{NOTICES_API}/{notice_id}")

                if detail_response.status_code == 200:
                    notice = detail_response.json()
                    print(f"✅ 상세 조회 성공: {notice['title']}")
                    print(f"  ID: {notice['id']}")
                    print(f"  언어: {notice['lang']}")
                    print(f"  중요도: {notice['severity']}")
                else:
                    print(f"❌ 상세 조회 실패: {detail_response.status_code}")
            else:
                print("⚠️ 조회할 공지사항이 없습니다")

    except Exception as e:
        print(f"❌ 요청 실패: {e}")

def test_admin_endpoints():
    """관리자 엔드포인트 테스트"""

    print("\n🔒 관리자 엔드포인트 테스트...")

    try:
        # 전체 공지사항 조회 (관리자)
        response = requests.get(
            f"{NOTICES_API}/admin/all",
            headers={"X-API-Key": TEST_API_KEY}
        )

        if response.status_code == 200:
            notices = response.json()
            print(f"✅ 관리자 전체 조회 성공: {len(notices)}개")
        else:
            print(f"❌ 관리자 조회 실패: {response.status_code}")

    except Exception as e:
        print(f"❌ 요청 실패: {e}")

def test_health_status():
    """시스템 상태 확인"""

    print("\n🏥 시스템 상태 확인...")

    try:
        # 백엔드 헬스체크
        response = requests.get(f"{BASE_URL}/health")

        if response.status_code == 200:
            print("✅ 백엔드 서버 정상")
        else:
            print(f"❌ 백엔드 서버 이상: {response.status_code}")

        # 공지사항 시스템 상태
        response = requests.get(f"{NOTICES_API}/health/status")

        if response.status_code == 200:
            status = response.json()
            print(f"✅ 공지사항 시스템 상태: {status['status']}")
            print(f"  전체 공지: {status.get('total_notices', 0)}개")
            print(f"  활성 공지: {status.get('active_notices', 0)}개")
            print(f"  고정 공지: {status.get('pinned_notices', 0)}개")
        else:
            print(f"❌ 공지사항 시스템 이상: {response.status_code}")

    except Exception as e:
        print(f"❌ 서버 연결 실패: {e}")
        print("\n💡 백엔드 서버가 실행 중인지 확인하세요:")
        print("   cd C:/Users/lco20/Desktop/moodtalk_public/backend")
        print("   python main.py")

def main():
    """메인 테스트 실행"""

    print("=" * 60)
    print("🧪 TOCMOOD 공지사항 시스템 End-to-End 테스트")
    print("=" * 60)

    # 1. 시스템 상태 확인
    test_health_status()

    # 2. 테스트 공지사항 생성
    created_notices = test_create_notices()

    # 3. 공지사항 조회 테스트
    test_get_notices()

    # 4. 상세 조회 테스트
    test_notice_detail()

    # 5. 관리자 기능 테스트
    test_admin_endpoints()

    print("\n" + "=" * 60)
    print("🎉 테스트 완료!")
    print("=" * 60)

    if created_notices:
        print(f"\n✅ 총 {len(created_notices)}개의 테스트 공지사항이 생성되었습니다.")
        print("\n💡 프론트엔드에서 공지사항 배너를 확인해보세요:")
        print("   http://localhost:5173")
        print("\n📱 백엔드 API 문서:")
        print("   http://localhost:8000/docs")

if __name__ == "__main__":
    main()