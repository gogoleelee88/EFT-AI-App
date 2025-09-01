#!/usr/bin/env python3
"""
EFT AI 서버 기본 테스트 스크립트
서버 실행 전 기본 기능 점검
"""

import asyncio
import time
import json
import sys
from pathlib import Path

# 현재 디렉토리를 Python 경로에 추가
sys.path.append(str(Path(__file__).parent))

from services.ai_engine import EFTAIEngine
from services.prompt_manager import EFTPromptManager
from services.emotion_analyzer import EmotionAnalyzer
from models.chat_models import EmotionType
from config.settings import get_development_settings
from utils.logger import get_logger

logger = get_logger(__name__)

async def test_emotion_analyzer():
    """감정 분석기 테스트"""
    print("\n감정 분석기 테스트 시작...")
    
    analyzer = EmotionAnalyzer()
    
    test_texts = [
        "오늘 너무 스트레스받아서 힘들어요",
        "회사에서 상사가 계속 야근시켜서 정말 화나요",
        "요즘 마음이 너무 우울하고 외로워요",
        "시험 때문에 너무 불안하고 걱정돼요",
        "친구들과 놀아서 정말 즐거웠어요"
    ]
    
    for i, text in enumerate(test_texts, 1):
        print(f"\n테스트 {i}: '{text}'")
        analysis = await analyzer.analyze(text)
        
        print(f"  주요감정: {analysis.primary_emotion} (강도: {analysis.intensity:.2f})")
        print(f"  보조감정: {analysis.secondary_emotion}")
        print(f"  신뢰도: {analysis.confidence:.2f}")
        print(f"  키워드: {', '.join(analysis.emotional_keywords[:3])}")
        
        time.sleep(0.5)  # 간격 두기
    
    print("\n감정 분석기 테스트 완료")

async def test_prompt_manager():
    """프롬프트 매니저 테스트"""
    print("\n 프롬프트 매니저 테스트 시작...")
    
    prompt_manager = EFTPromptManager()
    analyzer = EmotionAnalyzer()
    
    # 테스트 감정 분석
    test_message = "스트레스가 너무 심해서 잠도 못 자겠어요"
    emotion_analysis = await analyzer.analyze(test_message)
    
    # 프롬프트 생성
    prompt = prompt_manager.build_eft_prompt(
        user_message=test_message,
        emotion_state=emotion_analysis
    )
    
    print(f"생성된 프롬프트 길이: {len(prompt)} 문자")
    print(f"감정 기반 EFT 추천: {len(prompt_manager.recommend_eft_techniques(emotion_analysis))}개")
    
    # EFT 추천 테스트
    recommendations = prompt_manager.recommend_eft_techniques(emotion_analysis)
    if recommendations:
        print(f"추천 기법: {recommendations[0].technique_name}")
        print(f"탭핑 포인트: {', '.join([p.value for p in recommendations[0].tapping_points])}")
        print(f"셋업 구문: {recommendations[0].setup_phrase}")
    
    print("\n 프롬프트 매니저 테스트 완료")

async def test_ai_engine_initialization():
    """AI 엔진 초기화 테스트 (모델 로드 없이)"""
    print("\n AI 엔진 초기화 테스트 시작...")
    
    settings = get_development_settings()
    print(f"모델명: {settings.MODEL_NAME}")
    print(f"디바이스: {settings.DEVICE}")
    print(f"4bit 로드: {settings.LOAD_IN_4BIT}")
    
    # AI 엔진 인스턴스 생성 (초기화는 하지 않음)
    ai_engine = EFTAIEngine()
    
    print(f"AI 엔진 생성 완료 (모델 로드는 실제 서버 실행 시 수행)")
    print(f"모델 캐시 디렉토리: {settings.MODEL_CACHE_DIR}")
    
    print("\n AI 엔진 초기화 테스트 완료")

def test_model_configuration():
    """모델 설정 테스트"""
    print("\n 모델 설정 테스트 시작...")
    
    from config.settings import MODEL_PRESETS, apply_model_preset
    
    print("사용 가능한 모델 프리셋:")
    for name, config in MODEL_PRESETS.items():
        print(f"  {name}: {config['model_name']} ({config.get('max_memory', 'auto')})")
    
    # 개발용 프리셋 적용 테스트
    settings = apply_model_preset('llama2-7b-quick')
    print(f"\n적용된 설정:")
    print(f"  모델: {settings.MODEL_NAME}")
    print(f"  4bit 로드: {settings.LOAD_IN_4BIT}")
    print(f"  최대 메모리: {settings.MAX_MEMORY}")
    
    print("\n 모델 설정 테스트 완료")

async def test_integration():
    """통합 워크플로우 테스트"""
    print("\n 통합 워크플로우 테스트 시작...")
    
    # 1. 감정 분석
    analyzer = EmotionAnalyzer()
    test_message = "회사 일이 너무 많아서 스트레스가 심해요. 어떻게 해야 할까요?"
    
    print(f"사용자 메시지: '{test_message}'")
    
    emotion_analysis = await analyzer.analyze(test_message)
    print(f"감정 분석: {emotion_analysis.primary_emotion} (강도: {emotion_analysis.intensity:.1f})")
    
    # 2. 프롬프트 생성
    prompt_manager = EFTPromptManager()
    prompt = prompt_manager.build_eft_prompt(
        user_message=test_message,
        emotion_state=emotion_analysis
    )
    
    print(f"프롬프트 생성: {len(prompt)} 문자")
    
    # 3. EFT 추천
    recommendations = prompt_manager.recommend_eft_techniques(emotion_analysis)
    print(f"EFT 추천: {len(recommendations)}개 기법")
    
    if recommendations:
        best_recommendation = recommendations[0]
        print(f"최적 기법: {best_recommendation.technique_name}")
        print(f"효과성: {best_recommendation.effectiveness_score:.0%}")
    
    # 4. 응답 후처리
    mock_ai_response = "스트레스가 많으시군요. 깊게 숨을 쉬어보세요. 함께 마음을 달래는 EFT 기법을 해보아요."
    
    processed = prompt_manager.post_process_response(mock_ai_response, emotion_analysis)
    print(f"후처리된 응답: {processed['text'][:50]}...")
    print(f"신뢰도: {processed['confidence']:.2f}")
    print(f"제안 액션: {len(processed['suggested_actions'])}개")
    
    print("\n 통합 워크플로우 테스트 완료")

async def main():
    """메인 테스트 실행"""
    print("EFT AI 서버 기본 테스트 시작")
    print("="*60)
    
    start_time = time.time()
    
    try:
        # 개별 컴포넌트 테스트
        await test_emotion_analyzer()
        await test_prompt_manager()
        await test_ai_engine_initialization()
        test_model_configuration()
        
        # 통합 테스트
        await test_integration()
        
        elapsed = time.time() - start_time
        
        print("\n" + "="*60)
        print(f"모든 테스트 완료! (소요시간: {elapsed:.1f}초)")
        print("\n다음 단계:")
        print("1. 백엔드 서버 시작: python start.py --env dev --model-preset llama2-7b-quick")
        print("2. 프론트엔드 시작: npm run dev (frontend 폴더)")
        print("3. 브라우저에서 테스트: http://localhost:3000")
        
    except Exception as e:
        print(f"\n테스트 실패: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())