import asyncio
import sys
sys.path.insert(0, '/home/moodtalk/tocmood/moodtalk-public')

from backend.services.emotion_candidates_service import get_emotion_candidates

async def test():
    user_input = "직장에서 상사한테 야단맞아서 너무 스트레스받아요"
    strict6 = {
        "situation_context": "팀 미팅에서 발표 중 상사가 실수를 지적함",
        "automatic_thought": "내가 능력이 없어서 그런가봐",
        "physical_sensation": "가슴이 답답하고 손이 떨림",
        "intensity": 8,
        "available_time": "10분",
        "immediate_goal": "마음을 진정시키고 싶어요"
    }
    
    print("=== 감정 후보 생성 테스트 (Engine B) ===")
    print(f"입력: {user_input}")
    print()
    
    result = await get_emotion_candidates(user_input, strict6, engine="b")
    
    if result:
        print(f"✅ 성공! 감정 후보 {len(result)}개 생성됨:\n")
        for i, candidate in enumerate(result, 1):
            print(f"{i}. 감정: {candidate.label}")
            print(f"   신뢰도: {candidate.confidence}")
            print(f"   이유: {candidate.reason}")
            print()
    else:
        print("❌ 실패: None 반환")
        print("   → Engine A로 fallback 시도했을 가능성 있음")

asyncio.run(test())
