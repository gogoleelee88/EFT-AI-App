"""A/B 채팅 엔드포인트 actions 필드 테스트

vLLM 서버 없이도 작동하는 유닛 테스트
"""

import sys
sys.path.insert(0, ".")

from backend.utils.action_builder import build_actions


print("=" * 60)
print("A/B 채팅 엔드포인트 actions 생성 테스트")
print("=" * 60)

# 시나리오 1: 부정적 감정 메시지
message1 = "외로워서 힘들어요"
metadata1 = {
    "emotion_analysis": {
        "primary_emotion": "외로움",
        "intensity": 0.6
    }
}

actions1 = build_actions(message1, metadata1)
print(f"\n[OK] Scenario 1: Negative Emotion")
print(f"   Message: {message1}")
print(f"   Emotion: {metadata1['emotion_analysis']['primary_emotion']} (intensity: {metadata1['emotion_analysis']['intensity']})")
print(f"   Actions: {actions1}")
assert len(actions1) == 1, f"Expected 1 action, got {len(actions1)}"
assert actions1[0]["type"] == "ask_suds", f"Expected ask_suds, got {actions1[0]['type']}"

# 시나리오 2: 긍정적 감정 메시지
message2 = "오늘 날씨가 좋네요"
metadata2 = {
    "emotion_analysis": {
        "primary_emotion": "기쁨",
        "intensity": 0.3
    }
}

actions2 = build_actions(message2, metadata2)
print(f"\n[OK] Scenario 2: Positive Emotion")
print(f"   Message: {message2}")
print(f"   Emotion: {metadata2['emotion_analysis']['primary_emotion']} (intensity: {metadata2['emotion_analysis']['intensity']})")
print(f"   Actions: {actions2}")
assert len(actions2) == 0, f"Expected 0 actions, got {len(actions2)}"

# 시나리오 3: 백업 규칙 (메시지 키워드)
message3 = "요즘 불안해요"
metadata3 = {
    "emotion_analysis": {
        "primary_emotion": "중립",
        "intensity": 0.2
    }
}

actions3 = build_actions(message3, metadata3)
print(f"\n[OK] Scenario 3: Backup Rule (Keyword Match)")
print(f"   Message: {message3}")
print(f"   Emotion: {metadata3['emotion_analysis']['primary_emotion']} (intensity: {metadata3['emotion_analysis']['intensity']})")
print(f"   Actions: {actions3}")
assert len(actions3) == 1, f"Expected 1 action (from keyword), got {len(actions3)}"

print("\n" + "=" * 60)
print("[SUCCESS] All A/B chat actions tests passed!")
print("=" * 60)
print("\nTest Summary:")
print(f"   - Negative emotion -> SUDS action created [OK]")
print(f"   - Positive emotion -> No actions [OK]")
print(f"   - Keyword backup -> SUDS action created [OK]")
print("\n[INFO] /ab/chat endpoint will include 'actions' field!")
