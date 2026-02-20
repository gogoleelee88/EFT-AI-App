#!/usr/bin/env python3
"""
EFT AI ?œë²„ ê¸°ë³¸ ?ŒìŠ¤???¤í¬ë¦½íŠ¸
?œë²„ ?¤í–‰ ??ê¸°ë³¸ ê¸°ëŠ¥ ?ê?
"""

import asyncio
import time
import json
import sys
from pathlib import Path

# ?„ì¬ ?”ë ‰? ë¦¬ë¥?Python ê²½ë¡œ??ì¶”ê?
sys.path.append(str(Path(__file__).parent))

from services.ai_engine import EFTAIEngine
from services.prompt_manager import EFTPromptManager
from services.emotion_analyzer import EmotionAnalyzer
from models.chat_models import EmotionType
from config.settings import get_development_settings
from utils.logger import get_logger

logger = get_logger(__name__)

async def test_emotion_analyzer():
    """ê°ì • ë¶„ì„ê¸??ŒìŠ¤??""
    print("\nê°ì • ë¶„ì„ê¸??ŒìŠ¤???œì‘...")
    
    analyzer = EmotionAnalyzer()
    
    test_texts = [
        "?¤ëŠ˜ ?ˆë¬´ ?¤íŠ¸?ˆìŠ¤ë°›ì•„???˜ë“¤?´ìš”",
        "?Œì‚¬?ì„œ ?ì‚¬ê°€ ê³„ì† ?¼ê·¼?œì¼œ???•ë§ ?”ë‚˜??,
        "?”ì¦˜ ë§ˆìŒ???ˆë¬´ ?°ìš¸?˜ê³  ?¸ë¡œ?Œìš”",
        "?œí—˜ ?Œë¬¸???ˆë¬´ ë¶ˆì•ˆ?˜ê³  ê±±ì •?¼ìš”",
        "ì¹œêµ¬?¤ê³¼ ?€?„ì„œ ?•ë§ ì¦ê±°? ì–´??
    ]
    
    for i, text in enumerate(test_texts, 1):
        print(f"\n?ŒìŠ¤??{i}: '{text}'")
        analysis = await analyzer.analyze(text)
        
        print(f"  ì£¼ìš”ê°ì •: {analysis.primary_emotion} (ê°•ë„: {analysis.intensity:.2f})")
        print(f"  ë³´ì¡°ê°ì •: {analysis.secondary_emotion}")
        print(f"  ? ë¢°?? {analysis.confidence:.2f}")
        print(f"  ?¤ì›Œ?? {', '.join(analysis.emotional_keywords[:3])}")
        
        time.sleep(0.5)  # ê°„ê²© ?ê¸°
    
    print("\nê°ì • ë¶„ì„ê¸??ŒìŠ¤???„ë£Œ")

async def test_prompt_manager():
    """?„ë¡¬?„íŠ¸ ë§¤ë‹ˆ?€ ?ŒìŠ¤??""
    print("\n ?„ë¡¬?„íŠ¸ ë§¤ë‹ˆ?€ ?ŒìŠ¤???œì‘...")
    
    prompt_manager = EFTPromptManager()
    analyzer = EmotionAnalyzer()
    
    # ?ŒìŠ¤??ê°ì • ë¶„ì„
    test_message = "?¤íŠ¸?ˆìŠ¤ê°€ ?ˆë¬´ ?¬í•´??? ë„ ëª??ê² ?´ìš”"
    emotion_analysis = await analyzer.analyze(test_message)
    
    # ?„ë¡¬?„íŠ¸ ?ì„±
    prompt = prompt_manager.build_eft_prompt(
        user_message=test_message,
        emotion_state=emotion_analysis
    )
    
    print(f"?ì„±???„ë¡¬?„íŠ¸ ê¸¸ì´: {len(prompt)} ë¬¸ì")
    print(f"ê°ì • ê¸°ë°˜ EFT ì¶”ì²œ: {len(prompt_manager.recommend_eft_techniques(emotion_analysis))}ê°?)
    
    # EFT ì¶”ì²œ ?ŒìŠ¤??    recommendations = prompt_manager.recommend_eft_techniques(emotion_analysis)
    if recommendations:
        print(f"ì¶”ì²œ ê¸°ë²•: {recommendations[0].technique_name}")
        print(f"??•‘ ?¬ì¸?? {', '.join([p.value for p in recommendations[0].tapping_points])}")
        print(f"?‹ì—… êµ¬ë¬¸: {recommendations[0].setup_phrase}")
    
    print("\n ?„ë¡¬?„íŠ¸ ë§¤ë‹ˆ?€ ?ŒìŠ¤???„ë£Œ")

async def test_ai_engine_initialization():
    """AI ?”ì§„ ì´ˆê¸°???ŒìŠ¤??(ëª¨ë¸ ë¡œë“œ ?†ì´)"""
    print("\n AI ?”ì§„ ì´ˆê¸°???ŒìŠ¤???œì‘...")
    
    settings = get_development_settings()
    print(f"ëª¨ë¸ëª? {settings.MODEL_NAME}")
    print(f"?”ë°”?´ìŠ¤: {settings.DEVICE}")
    print(f"4bit ë¡œë“œ: {settings.LOAD_IN_4BIT}")
    
    # AI ?”ì§„ ?¸ìŠ¤?´ìŠ¤ ?ì„± (ì´ˆê¸°?”ëŠ” ?˜ì? ?ŠìŒ)
    ai_engine = EFTAIEngine()
    
    print(f"AI ?”ì§„ ?ì„± ?„ë£Œ (ëª¨ë¸ ë¡œë“œ???¤ì œ ?œë²„ ?¤í–‰ ???˜í–‰)")
    print(f"ëª¨ë¸ ìºì‹œ ?”ë ‰? ë¦¬: {settings.MODEL_CACHE_DIR}")
    
    print("\n AI ?”ì§„ ì´ˆê¸°???ŒìŠ¤???„ë£Œ")

def test_model_configuration():
    """ëª¨ë¸ ?¤ì • ?ŒìŠ¤??""
    print("\n ëª¨ë¸ ?¤ì • ?ŒìŠ¤???œì‘...")
    
    from config.settings import MODEL_PRESETS, apply_model_preset
    
    print("?¬ìš© ê°€?¥í•œ ëª¨ë¸ ?„ë¦¬??")
    for name, config in MODEL_PRESETS.items():
        print(f"  {name}: {config['model_name']} ({config.get('max_memory', 'auto')})")
    
    # ê°œë°œ???„ë¦¬???ìš© ?ŒìŠ¤??    settings = apply_model_preset('llama2-7b-quick')
    print(f"\n?ìš©???¤ì •:")
    print(f"  ëª¨ë¸: {settings.MODEL_NAME}")
    print(f"  4bit ë¡œë“œ: {settings.LOAD_IN_4BIT}")
    print(f"  ìµœë? ë©”ëª¨ë¦? {settings.MAX_MEMORY}")
    
    print("\n ëª¨ë¸ ?¤ì • ?ŒìŠ¤???„ë£Œ")

async def test_integration():
    """?µí•© ?Œí¬?Œë¡œ???ŒìŠ¤??""
    print("\n ?µí•© ?Œí¬?Œë¡œ???ŒìŠ¤???œì‘...")
    
    # 1. ê°ì • ë¶„ì„
    analyzer = EmotionAnalyzer()
    test_message = "?Œì‚¬ ?¼ì´ ?ˆë¬´ ë§ì•„???¤íŠ¸?ˆìŠ¤ê°€ ?¬í•´?? ?´ë–»ê²??´ì•¼ ? ê¹Œ??"
    
    print(f"?¬ìš©??ë©”ì‹œì§€: '{test_message}'")
    
    emotion_analysis = await analyzer.analyze(test_message)
    print(f"ê°ì • ë¶„ì„: {emotion_analysis.primary_emotion} (ê°•ë„: {emotion_analysis.intensity:.1f})")
    
    # 2. ?„ë¡¬?„íŠ¸ ?ì„±
    prompt_manager = EFTPromptManager()
    prompt = prompt_manager.build_eft_prompt(
        user_message=test_message,
        emotion_state=emotion_analysis
    )
    
    print(f"?„ë¡¬?„íŠ¸ ?ì„±: {len(prompt)} ë¬¸ì")
    
    # 3. EFT ì¶”ì²œ
    recommendations = prompt_manager.recommend_eft_techniques(emotion_analysis)
    print(f"EFT ì¶”ì²œ: {len(recommendations)}ê°?ê¸°ë²•")
    
    if recommendations:
        best_recommendation = recommendations[0]
        print(f"ìµœì  ê¸°ë²•: {best_recommendation.technique_name}")
        print(f"?¨ê³¼?? {best_recommendation.effectiveness_score:.0%}")
    
    # 4. ?‘ë‹µ ?„ì²˜ë¦?    mock_ai_response = "?¤íŠ¸?ˆìŠ¤ê°€ ë§ìœ¼?œêµ°?? ê¹Šê²Œ ?¨ì„ ?¬ì–´ë³´ì„¸?? ?¨ê»˜ ë§ˆìŒ???¬ë˜??EFT ê¸°ë²•???´ë³´?„ìš”."
    
    processed = prompt_manager.post_process_response(mock_ai_response, emotion_analysis)
    print(f"?„ì²˜ë¦¬ëœ ?‘ë‹µ: {processed['text'][:50]}...")
    print(f"? ë¢°?? {processed['confidence']:.2f}")
    print(f"?œì•ˆ ?¡ì…˜: {len(processed['suggested_actions'])}ê°?)
    
    print("\n ?µí•© ?Œí¬?Œë¡œ???ŒìŠ¤???„ë£Œ")

async def main():
    """ë©”ì¸ ?ŒìŠ¤???¤í–‰"""
    print("EFT AI ?œë²„ ê¸°ë³¸ ?ŒìŠ¤???œì‘")
    print("="*60)
    
    start_time = time.time()
    
    try:
        # ê°œë³„ ì»´í¬?ŒíŠ¸ ?ŒìŠ¤??        await test_emotion_analyzer()
        await test_prompt_manager()
        await test_ai_engine_initialization()
        test_model_configuration()
        
        # ?µí•© ?ŒìŠ¤??        await test_integration()
        
        elapsed = time.time() - start_time
        
        print("\n" + "="*60)
        print(f"ëª¨ë“  ?ŒìŠ¤???„ë£Œ! (?Œìš”?œê°„: {elapsed:.1f}ì´?")
        print("\n?¤ìŒ ?¨ê³„:")
        print("1. ë°±ì—”???œë²„ ?œì‘: python start.py --env dev --model-preset llama2-7b-quick")
        print("2. ?„ë¡ ?¸ì—”???œì‘: npm run dev (frontend ?´ë”)")
        print("3. ë¸Œë¼?°ì??ì„œ ?ŒìŠ¤?? http://localhost:3000")
        
    except Exception as e:
        print(f"\n?ŒìŠ¤???¤íŒ¨: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
