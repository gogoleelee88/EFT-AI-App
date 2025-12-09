#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""STRICT6 EFT 스크립트 생성 테스트"""

import requests
import json

url = "http://127.0.0.1:8000/api/chat"

# STRICT6 테스트 데이터
payload = {
    "message": "EFT 스크립트 요청",
    "strict_intake": {
        "core_emotion": "불안",
        "situation_context": "내일 발표를 앞두고 자료를 다시 확인하는 중",
        "automatic_thought": "망치면 어쩌지, 다들 나를 무능하다고 볼 것 같아",
        "physical_sensation": "가슴이 꽉 막히고 손에 힘이 잘 안 들어감",
        "behavioral_reaction": "계속 자료를 확인하고 있음",
        "intensity": 7,
        "immediate_goal": "최소한 준비한 만큼만 안정적으로 발표하고 싶다",
        "available_time": 10
    }
}

print("🚀 STRICT6 EFT 스크립트 생성 테스트 시작...\n")
print(f"요청 URL: {url}")
print(f"요청 데이터:")
print(json.dumps(payload, ensure_ascii=False, indent=2))
print("\n" + "="*60 + "\n")

try:
    response = requests.post(url, json=payload, timeout=30)
    print(f"응답 상태 코드: {response.status_code}")

    if response.status_code == 200:
        result = response.json()
        print("\n✅ 성공! EFT 스크립트 생성 완료\n")

        # eft_script 확인
        if "eft_script" in result and result["eft_script"]:
            script = result["eft_script"]
            print("📋 EFT 스크립트:")
            print(f"  셋업 구문: {script['setup_phrase']}")
            print(f"  포커스 단어: {', '.join(script['focus_words'])}")
            print(f"  감정 강도: {script['intensity_label']}")
            print(f"  권장 시간: {script['recommended_duration']}분")
            print(f"  대상 감정: {script['target_emotion']}")
            print(f"\n  상황 요약:\n{script['situation_summary']}")
        else:
            print("⚠️ eft_script가 응답에 없습니다!")
            print("응답 내용:")
            print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"\n❌ 실패: {response.status_code}")
        print(f"응답 내용: {response.text}")

except Exception as e:
    print(f"\n❌ 오류 발생: {str(e)}")
    import traceback
    traceback.print_exc()

print("\n" + "="*60)
print("테스트 종료")
