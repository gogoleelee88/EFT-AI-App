#!/usr/bin/env python3
"""
EFT AI ?ë² ê¸°ë³¸ ?ì¤???¤í¬ë¦½í¸
?ë² ?¤í ??ê¸°ë³¸ ê¸°ë¥ ?ê?
"""

import asyncio
import time
import json
import sys
from pathlib import Path

# ?ì¬ ?ë?ë¦¬ë¥?Python ê²½ë¡??ì¶ê?
sys.path.append(str(Path(__file__).parent))

from backend.services.ai_engine import EFTAIEngine
from backend.services.prompt_manager import EFTPromptManager
from backend.services.emotion_analyzer import EmotionAnalyzer
from backend.models.chat_models import EmotionType
from config.settings import get_development_settings
from backend.utils.logger import get_logger

logger = get_logger(__name__)

async def test_emotion_analyzer():
    """ê°ì ë¶ìê¸??ì¤??""
    print("\nê°ì ë¶ìê¸??ì¤???ì...")
    
    analyzer = EmotionAnalyzer()
    
    test_texts = [
        "?¤ë ?ë¬´ ?¤í¸?ì¤ë°ì???ë¤?´ì",
        "?ì¬?ì ?ì¬ê° ê³ì ?¼ê·¼?ì¼???ë§ ?ë??,
        "?ì¦ ë§ì???ë¬´ ?°ì¸?ê³ ?¸ë¡?ì",
        "?í ?ë¬¸???ë¬´ ë¶ì?ê³ ê±±ì?¼ì",
        "ì¹êµ¬?¤ê³¼ ??ì ?ë§ ì¦ê±°?ì´??
    ]
    
    for i, text in enumerate(test_texts, 1):
        print(f"\n?ì¤??{i}: '{text}'")
        analysis = await analyzer.analyze(text)
        
        print(f"  ì£¼ìê°ì: {analysis.primary_emotion} (ê°ë: {analysis.intensity:.2f})")
        print(f"  ë³´ì¡°ê°ì: {analysis.secondary_emotion}")
        print(f"  ?ë¢°?? {analysis.confidence:.2f}")
        print(f"  ?¤ì?? {', '.join(analysis.emotional_keywords[:3])}")
        
        time.sleep(0.5)  # ê°ê²© ?ê¸°
    
    print("\nê°ì ë¶ìê¸??ì¤???ë£")

async def test_prompt_manager():
    """?ë¡¬?í¸ ë§¤ë? ?ì¤??""
    print("\n ?ë¡¬?í¸ ë§¤ë? ?ì¤???ì...")
    
    prompt_manager = EFTPromptManager()
    analyzer = EmotionAnalyzer()
    
    # ?ì¤??ê°ì ë¶ì
    test_message = "?¤í¸?ì¤ê° ?ë¬´ ?¬í´???ë ëª??ê²?´ì"
    emotion_analysis = await analyzer.analyze(test_message)
    
    # ?ë¡¬?í¸ ?ì±
    prompt = prompt_manager.build_eft_prompt(
        user_message=test_message,
        emotion_state=emotion_analysis
    )
    
    print(f"?ì±???ë¡¬?í¸ ê¸¸ì´: {len(prompt)} ë¬¸ì")
    print(f"ê°ì ê¸°ë° EFT ì¶ì²: {len(prompt_manager.recommend_eft_techniques(emotion_analysis))}ê°?)
    
    # EFT ì¶ì² ?ì¤??    recommendations = prompt_manager.recommend_eft_techniques(emotion_analysis)
    if recommendations:
        print(f"ì¶ì² ê¸°ë²: {recommendations[0].technique_name}")
        print(f"?? ?¬ì¸?? {', '.join([p.value for p in recommendations[0].tapping_points])}")
        print(f"?ì êµ¬ë¬¸: {recommendations[0].setup_phrase}")
    
    print("\n ?ë¡¬?í¸ ë§¤ë? ?ì¤???ë£")

async def test_ai_engine_initialization():
    """AI ?ì§ ì´ê¸°???ì¤??(ëª¨ë¸ ë¡ë ?ì´)"""
    print("\n AI ?ì§ ì´ê¸°???ì¤???ì...")
    
    settings = get_development_settings()
    print(f"ëª¨ë¸ëª? {settings.MODEL_NAME}")
    print(f"?ë°?´ì¤: {settings.DEVICE}")
    print(f"4bit ë¡ë: {settings.LOAD_IN_4BIT}")
    
    # AI ?ì§ ?¸ì¤?´ì¤ ?ì± (ì´ê¸°?ë ?ì? ?ì)
    ai_engine = EFTAIEngine()
    
    print(f"AI ?ì§ ?ì± ?ë£ (ëª¨ë¸ ë¡ë???¤ì ?ë² ?¤í ???í)")
    print(f"ëª¨ë¸ ìºì ?ë?ë¦¬: {settings.MODEL_CACHE_DIR}")
    
    print("\n AI ?ì§ ì´ê¸°???ì¤???ë£")

def test_model_configuration():
    """ëª¨ë¸ ?¤ì ?ì¤??""
    print("\n ëª¨ë¸ ?¤ì ?ì¤???ì...")
    
    from config.settings import MODEL_PRESETS, apply_model_preset
    
    print("?¬ì© ê°?¥í ëª¨ë¸ ?ë¦¬??")
    for name, config in MODEL_PRESETS.items():
        print(f"  {name}: {config['model_name']} ({config.get('max_memory', 'auto')})")
    
    # ê°ë°???ë¦¬???ì© ?ì¤??    settings = apply_model_preset('llama2-7b-quick')
    print(f"\n?ì©???¤ì:")
    print(f"  ëª¨ë¸: {settings.MODEL_NAME}")
    print(f"  4bit ë¡ë: {settings.LOAD_IN_4BIT}")
    print(f"  ìµë? ë©ëª¨ë¦? {settings.MAX_MEMORY}")
    
    print("\n ëª¨ë¸ ?¤ì ?ì¤???ë£")

async def test_integration():
    """?µí© ?í¬?ë¡???ì¤??""
    print("\n ?µí© ?í¬?ë¡???ì¤???ì...")
    
    # 1. ê°ì ë¶ì
    analyzer = EmotionAnalyzer()
    test_message = "?ì¬ ?¼ì´ ?ë¬´ ë§ì???¤í¸?ì¤ê° ?¬í´?? ?´ë»ê²??´ì¼ ?ê¹??"
    
    print(f"?¬ì©??ë©ìì§: '{test_message}'")
    
    emotion_analysis = await analyzer.analyze(test_message)
    print(f"ê°ì ë¶ì: {emotion_analysis.primary_emotion} (ê°ë: {emotion_analysis.intensity:.1f})")
    
    # 2. ?ë¡¬?í¸ ?ì±
    prompt_manager = EFTPromptManager()
    prompt = prompt_manager.build_eft_prompt(
        user_message=test_message,
        emotion_state=emotion_analysis
    )
    
    print(f"?ë¡¬?í¸ ?ì±: {len(prompt)} ë¬¸ì")
    
    # 3. EFT ì¶ì²
    recommendations = prompt_manager.recommend_eft_techniques(emotion_analysis)
    print(f"EFT ì¶ì²: {len(recommendations)}ê°?ê¸°ë²")
    
    if recommendations:
        best_recommendation = recommendations[0]
        print(f"ìµì ê¸°ë²: {best_recommendation.technique_name}")
        print(f"?¨ê³¼?? {best_recommendation.effectiveness_score:.0%}")
    
    # 4. ?ëµ ?ì²ë¦?    mock_ai_response = "?¤í¸?ì¤ê° ë§ì¼?êµ°?? ê¹ê² ?¨ì ?¬ì´ë³´ì¸?? ?¨ê» ë§ì???¬ë??EFT ê¸°ë²???´ë³´?ì."
    
    processed = prompt_manager.post_process_response(mock_ai_response, emotion_analysis)
    print(f"?ì²ë¦¬ë ?ëµ: {processed['text'][:50]}...")
    print(f"?ë¢°?? {processed['confidence']:.2f}")
    print(f"?ì ?¡ì: {len(processed['suggested_actions'])}ê°?)
    
    print("\n ?µí© ?í¬?ë¡???ì¤???ë£")

async def main():
    """ë©ì¸ ?ì¤???¤í"""
    print("EFT AI ?ë² ê¸°ë³¸ ?ì¤???ì")
    print("="*60)
    
    start_time = time.time()
    
    try:
        # ê°ë³ ì»´í¬?í¸ ?ì¤??        await test_emotion_analyzer()
        await test_prompt_manager()
        await test_ai_engine_initialization()
        test_model_configuration()
        
        # ?µí© ?ì¤??        await test_integration()
        
        elapsed = time.time() - start_time
        
        print("\n" + "="*60)
        print(f"ëª¨ë ?ì¤???ë£! (?ì?ê°: {elapsed:.1f}ì´?")
        print("\n?¤ì ?¨ê³:")
        print("1. ë°±ì???ë² ?ì: python start.py --env dev --model-preset llama2-7b-quick")
        print("2. ?ë¡?¸ì???ì: npm run dev (frontend ?´ë)")
        print("3. ë¸ë¼?°ì??ì ?ì¤?? http://localhost:3000")
        
    except Exception as e:
        print(f"\n?ì¤???¤í¨: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())

