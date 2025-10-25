"""should_ask_suds 함수 단위 테스트

다양한 시나리오에서 SUDS 측정 요청이 올바르게 생성되는지 검증.
"""

import sys
sys.path.insert(0, ".")

from backend.utils.action_builder import should_ask_suds


print("=" * 60)
print("should_ask_suds() 단위 테스트")
print("=" * 60)

cases = [
    # (설명, message, meta, expected)
    (
        "정상: 부정 감정 + 높은 강도",
        "외로워서 힘들어요",
        {"emotion_analysis": {"primary_emotion": "불안", "intensity": 1.0}},
        True
    ),
    (
        "보이지 않는 문자: zero-width space",
        "외로워요",
        {"emotion_analysis": {"primary_emotion": "불안\u200b", "intensity": 0.6}},
        True
    ),
    (
        "영어 + 대소문자 혼합",
        "I feel lonely",
        {"emotion_analysis": {"primary_emotion": "AnXiEtY", "intensity": 0.5}},
        True
    ),
    (
        "백업 규칙: 메시지에 키워드 포함",
        "진짜 외로워",
        {"emotion_analysis": {"primary_emotion": "기쁨", "intensity": 0.1}},
        True
    ),
    (
        "백업 규칙: 메시지에 '불안해' 포함",
        "요즘 불안해요",
        {"emotion_analysis": {"primary_emotion": "중립", "intensity": 0.3}},
        True
    ),
    (
        "무관: 긍정 감정 + 낮은 강도",
        "오늘 하늘 이뻐요",
        {"emotion_analysis": {"primary_emotion": "기쁨", "intensity": 0.2}},
        False
    ),
    (
        "경계값: intensity = 0.4 (정확히 임계값)",
        "약간 스트레스받아요",
        {"emotion_analysis": {"primary_emotion": "stress", "intensity": 0.4}},
        True
    ),
    (
        "경계값: intensity = 0.39 (임계값 미만)",
        "약간 스트레스",
        {"emotion_analysis": {"primary_emotion": "stress", "intensity": 0.39}},
        False
    ),
]

all_passed = True
passed_count = 0
failed_count = 0

for i, (desc, msg, meta, expected) in enumerate(cases, 1):
    got = should_ask_suds(msg, meta)
    status = "[PASS]" if got == expected else "[FAIL]"

    print(f"{status} | case#{i}: {desc}")
    print(f"         | message: {msg[:30]}...")
    print(f"         | expected={expected}, got={got}")

    if got == expected:
        passed_count += 1
    else:
        failed_count += 1
        all_passed = False
    print()

print("=" * 60)
print(f"Result: {passed_count}/{len(cases)} passed, {failed_count}/{len(cases)} failed")
print("=" * 60)

if all_passed:
    print("[SUCCESS] All tests passed!")
    sys.exit(0)
else:
    print("[FAILED] Some tests failed")
    sys.exit(1)
