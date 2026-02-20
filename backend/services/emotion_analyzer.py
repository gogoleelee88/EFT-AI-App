"""
ê°ì • ë¶„ì„ ?œë¹„???ìŠ¤??ê¸°ë°˜ ê°ì • ?íƒœ ë¶„ì„ ë°?EFT ë§ì¶¤ ì¶”ì²œ???„í•œ ?„ì²˜ë¦??œêµ­??ë¬¸ì¥??ë£°ë² ?´ìŠ¤ë¡?ê°ì • ?¼ë²¨ + ê°•ë„ + ë§¥ë½??ë½‘ì•„?? EFT ì¶”ì²œ ?”ì§„???°ê¸° ì¢‹ì? êµ¬ì¡°ë¡??•ë¦¬?´ì£¼???„ì²˜ë¦¬ê¸°
"""

import re
import asyncio
from typing import Dict, List, Tuple, Optional, Any
import numpy as np
from collections import Counter

from models.chat_models import EmotionAnalysis, EmotionType
from utils.logger import get_logger

logger = get_logger(__name__)

class EmotionAnalyzer:
    """?œêµ­???ìŠ¤??ê°ì • ë¶„ì„ê¸?""
    
    def __init__(self):
        """ê°ì • ë¶„ì„ê¸?ì´ˆê¸°??""
        self.emotion_keywords = self._load_emotion_keywords()
        self.intensity_modifiers = self._load_intensity_modifiers()
        self.context_patterns = self._load_context_patterns()
        self.negation_words = self._load_negation_words()
        
        logger.info("??ê°ì • ë¶„ì„ê¸?ì´ˆê¸°???„ë£Œ")
    
    def _load_emotion_keywords(self) -> Dict[EmotionType, List[str]]:
        """ê°ì •ë³??¤ì›Œ???¬ì „"""
        return {
            EmotionType.JOY: [
                "ê¸°ì˜", "?‰ë³µ", "ì¦ê±°", "? ë‚˜", "ì¢?, "ë§Œì¡±", "?˜ìƒ", "ìµœê³ ", "?„ë²½",
                "??, "ë¯¸ì†Œ", "?¤ë ˆ", "?¥ë¶„", "?œê¸°", "?ì¾Œ", "ê¸°ë¶„ì¢?, "?¬í¬",
                "?¼í˜¸", "?€??, "?€ë°?, "ì§?, "ê¿€", "?¬ë‘?¤ëŸ¬", "?¬ì½¤", "?°ëœ»"
            ],
            EmotionType.SADNESS: [
                "?¬í”„", "?„í”„", "?°ìš¸", "?ˆë¬¼", "??, "ë§ˆìŒ?„íŒŒ", "?ìƒ", "?µë‹µ", 
                "?ˆë¬´", "?ˆë§", "ì¢Œì ˆ", "?˜ë“¤", "ê´´ë¡œ", "ê³ í†µ", "ë¹„ì°¸", "ì²˜ëŸ‰",
                "?¸ì“¸", "?¸ë¡œ", "ê³µí—ˆ", "?”ìš¸", "ì¹¨ìš¸", "ê¹Šì??œìˆ¨", "?œìˆ¨", "ì²´ë…"
            ],
            EmotionType.ANGER: [
                "??, "ì§œì¦", "?´ë°›", "ë¶„ë…¸", "?µìš¸", "ë¹¡ì³", "ë¯¸ì¹˜ê²?, "ë­ì•¼",
                "?´ì´??, "ë§ë„?ˆë¼", "ê°œë¹¡", "ê°œì—´ë°?, "ì§„ì§œ", "?´ë–»ê²?, "??,
                "ì£½ì´ê³ ì‹¶", "?Œë¦¬ê³ ì‹¶", "ë³µìˆ˜", "?ë§", "ì¦ì˜¤", "?ˆì••", "ì°¸ì„?˜ì—†"
            ],
            EmotionType.FEAR: [
                "ë¬´ì„­", "?ë ¤", "ê±±ì •", "ê·¼ì‹¬", "ë¶ˆì•ˆ", "ê³µí¬", "ë¬´ì„œ??, "?¨ë ¤",
                "?¤ì‹¹", "?Œë¦„", "ê¸´ì¥", "ì´ˆì¡°", "ì¡°ë§ˆì¡°ë§ˆ", "?¬ì¥", "?ì??€", 
                "?¨ë¦¼", "ê²?, "ê³µí¬ê°?, "ë¶ˆì•ˆê°?, "?„í—˜", "?„ê¸°ê°?
            ],
            EmotionType.SURPRISE: [
                "?€??, "ê¹œì§", "??", "??, "?€", "?´ë¨¸", "?¸ìƒ??, "ì§„ì§œ?",
                "?¤ë§ˆ", "?´ë–»ê²?, "ë¯¿ì„?˜ì—†", "?ìƒëª»í–ˆ", "?ˆìƒëª»í–ˆ", "ê°‘ìê¸?,
                "?ë‹·?†ì´", "ì¶©ê²©", "?¹í™©", "?´ë¦¬?¥ì ˆ"
            ],
            EmotionType.DISGUST: [
                "??²¨", "??, "ê¼´ë³´ê¸°ì‹«", "êµ¬ì—­ì§?, "?”ëŸ¬", "ì§€ê²?, "ì§œì¦", "??,
                "?°ì›©", "? ë‚˜?€", "ëª»ë´ì£¼ê² ", "?œì‹¬", "?´ì´??, "ê¸°ê?ë§‰í?"
            ],
            EmotionType.STRESS: [
                "?¤íŠ¸?ˆìŠ¤", "?•ë°•", "ë¶€??, "?¼ê³¤", "ì§€ì³?, "?˜ë“¤", "ë²…ì°¨", "ëª°ë ¤",
                "?“ì—¬", "?°ì§ˆê²ƒê°™", "?œê³„", "ê³¼ë¡œ", "ë²ˆì•„??, "?Œì§„", "ì§€ì¹?,
                "ë¬´ë¦¬", "ë²„ê±°", "ê°ë‹¹?ˆë¼", "ë¨¸ë¦¬?„íŒŒ", "ëª©ì–´ê¹?, "ê·¼ìœ¡", "ê¸´ì¥"
            ],
            EmotionType.ANXIETY: [
                "ë¶ˆì•ˆ", "ê±±ì •", "ê·¼ì‹¬", "ì´ˆì¡°", "ì¡°ê¸‰", "ë¶ˆì•ˆ??, "?™ìš”", "?¼ë ¤",
                "?°ë ¤", "ê±±ì •?¤ëŸ¬", "ë§ˆìŒ?¸í•˜ì§€??, "?ˆì ˆë¶€??, "ì¡°ë§ˆì¡°ë§ˆ", 
                "ê°€?´ë‹µ??, "?¬ì¥?ê·¼", "?ë–¨ë¦?, "?ì??€", "ë¶ˆë©´", "? ëª»??
            ],
            EmotionType.LONELINESS: [
                "?¸ë¡œ", "?¼ì", "?¸ì“¸", "ê³ ë¦½", "?¨ì ˆ", "?Œì™¸", "ê³µí—ˆ", "?…ë¹ˆ",
                "?„ë¬´?„ì—†", "?€ë¡?, "ê³ì—??, "ë²„ë¦¼ë°?, "?Œí†µ?ˆë¼", "?´í•´?ˆë¼",
                "?¼ë°¥", "?¼ìˆ ", "?¼ì˜", "?¼ìë§?, "?¸í†¨??
            ],
            EmotionType.FRUSTRATION: [
                "?µë‹µ", "ë§‰ë§‰", "ì¢Œì ˆ", "?¬ê¸°", "?ˆë¼", "?´ë–»ê²?, "ë°©ë²•??, "ê¸¸ë§‰",
                "ì§„ì „??, "?œìë¦?, "ë°œì „??, "?Œìš©??, "?›ìˆ˜ê³?, "ë²?, "?œê³„",
                "ë§‰ë‹¤ë¥?, "?ˆë§??, "?¬ë§??, "?´ì©”?˜ì—†"
            ]
        }
    
    def _load_intensity_modifiers(self) -> Dict[str, float]:
        """ê°•ë„ ?˜ì‹???¬ì „ (ë°°ìœ¨)"""
        return {
            # ê°•í™” ?˜ì‹??            "?•ë§": 1.5, "?ˆë¬´": 1.4, "ì§„ì§œ": 1.3, "?„ì „": 1.3, "?„ì²­": 1.3,
            "ë¬´ì²™": 1.2, "ë§¤ìš°": 1.2, "ê½?: 1.1, "?ë‹¹??: 1.2, "ê·¹ë„ë¡?: 1.6,
            "ìµœê³ ë¡?: 1.5, "ìµœë?ë¡?: 1.5, "?¬ê°?˜ê²Œ": 1.4, "ì¹˜ëª…?ìœ¼ë¡?: 1.6,
            "ì£½ë„ë¡?: 1.5, "ë¯¸ì¹˜?„ë¡": 1.4, "?Œë©¸?ìœ¼ë¡?: 1.6,
            
            # ?„í™” ?˜ì‹?? 
            "ì¢€": 0.8, "?½ê°„": 0.7, "?´ì§": 0.6, "ì¡°ê¸ˆ": 0.7, "ê·¸ëƒ¥": 0.8,
            "ë³„ë¡œ": 0.6, "ê·¸ë ‡ê²?: 0.8, "ê·¸ëŸ°?€ë¡?: 0.7, "?´ëŠ?•ë„": 0.8,
            "?ë‹¹??: 0.7, "?¤ì†Œ": 0.8, "?´ëŠ?•ë„": 0.8,
            
            # ë°˜ë³µ/ì§€??ê°•í™”
            "ê³„ì†": 1.3, "ì§€?ì ?¼ë¡œ": 1.2, "?Šì„?†ì´": 1.4, "ì­?: 1.2,
            "??ƒ": 1.3, "??: 1.2, "?ê¾¸": 1.3, "??: 1.1, "?¤ì‹œ": 1.1
        }
    
    def _load_context_patterns(self) -> Dict[str, Dict[str, Any]]:
        """?í™©ë³??¨í„´ ?¸ì‹"""
        return {
            "work_stress": {
                "patterns": [
                    r"(?Œì‚¬|ì§ì¥|?…ë¬´|???ì‚¬|?™ë£Œ|?¼ê·¼|ì¶œê·¼|?´ê·¼|?”ê¸‰|?¹ì§„)",
                    r"(?„ë¡œ?íŠ¸|ë§ˆê°|?Œì˜|ë³´ê³ ??ë°œí‘œ|?‰ê?|?±ê³¼)"
                ],
                "boost_emotions": [EmotionType.STRESS, EmotionType.FRUSTRATION],
                "multiplier": 1.2
            },
            "relationship_issues": {
                "patterns": [
                    r"(?¨ì¹œ|?¬ì¹œ|? ì¸|?°ì¸|ì§ì‚¬???´ë³„|?¤ì–´|ì°¨ì„|ë°”ëŒ)",
                    r"(ì¹œêµ¬|?™ê¸°|? í›„ë°??¸ê°„ê´€ê³??¬ëŒ???Œí†µ|ê°ˆë“±)"
                ],
                "boost_emotions": [EmotionType.SADNESS, EmotionType.LONELINESS, EmotionType.ANGER],
                "multiplier": 1.3
            },
            "family_problems": {
                "patterns": [
                    r"(ë¶€ëª??„ë§ˆ|?„ë¹ |ê°€ì¡??•ì œ|?ë§¤|?œëŒ|ì²˜ê?|?œì–´ë¨¸ë‹ˆ|?¥ëª¨)",
                    r"(ê°€??ì§?ê²°í˜¼|?¡ì•„|?„ì´|?ì‹)"
                ],
                "boost_emotions": [EmotionType.STRESS, EmotionType.FRUSTRATION, EmotionType.SADNESS],
                "multiplier": 1.4
            },
            "health_concerns": {
                "patterns": [
                    r"(?„í”„|ë³?ëª¸ì‚´|ê°ê¸°|ë³‘ì›|?˜ì‚¬|??ì¹˜ë£Œ|ê±´ê°•|ëª?",
                    r"(?í†µ|ë³µí†µ|?Œí™”|ë¶ˆë©´|? ëª»|?¼ê³¤|ì§€ì³?"
                ],
                "boost_emotions": [EmotionType.ANXIETY, EmotionType.SADNESS],
                "multiplier": 1.3
            },
            "financial_stress": {
                "patterns": [
                    r"(??ë¹„ìš©|ë¹„ì‹¸|ë¹„ìš©|?”ì„¸|?€ì¶?ë¹?ì¹´ë“œ|?ê¸ˆ|?¬ì)",
                    r"(ê²½ì œ|?¬ì •|?˜ì…|ì§€ì¶??í™œë¹??©ëˆ)"
                ],
                "boost_emotions": [EmotionType.STRESS, EmotionType.ANXIETY],
                "multiplier": 1.3
            }
        }
    
    def _load_negation_words(self) -> List[str]:
        """ë¶€?•ì–´ ë¦¬ìŠ¤??""
        return [
            "??, "ëª?, "?„ë‹ˆ", "??, "ë§ê³ ", "ë§ì•„", "?„ëƒ", "?„ë‹ˆ??, 
            "?ˆë?", "?„í?", "ì¡°ê¸ˆ??, "ë³„ë¡œ", "ê·¸ë¦¬", "?±íˆ"
        ]
    
    async def analyze(self, text: str) -> EmotionAnalysis:
        """?ìŠ¤??ê°ì • ë¶„ì„ ë©”ì¸ ?¨ìˆ˜"""
        
        if not text or len(text.strip()) == 0:
            return self._create_neutral_emotion()
        
        try:
            # 1. ?ìŠ¤???„ì²˜ë¦?            cleaned_text = self._preprocess_text(text)
            
            # 2. ê°ì •ë³??ìˆ˜ ê³„ì‚°
            emotion_scores = self._calculate_emotion_scores(cleaned_text)
            
            # 3. ?í™©ë³?ì»¨í…?¤íŠ¸ ë¶€?¤íŠ¸ ?ìš©
            emotion_scores = self._apply_context_boost(cleaned_text, emotion_scores)
            
            # 4. ë¶€?•ì–´ ì²˜ë¦¬
            emotion_scores = self._handle_negation(cleaned_text, emotion_scores)
            
            # 5. ìµœì¢… ê°ì • ë°?ê°•ë„ ê²°ì •
            primary_emotion, secondary_emotion, intensity = self._determine_final_emotions(emotion_scores)
            
            # 6. ê°ì • ?¤ì›Œ??ì¶”ì¶œ
            emotional_keywords = self._extract_emotional_keywords(cleaned_text, primary_emotion)
            
            # 7. ? ë¢°??ê³„ì‚°
            confidence = self._calculate_confidence(emotion_scores, cleaned_text)
            
            # 8. ?í™© ë¶„ì„ (ë§¥ë½ ?•ë³´)
            context_analysis = self._analyze_context(cleaned_text)
            
            return EmotionAnalysis(
                primary_emotion=primary_emotion,
                secondary_emotion=secondary_emotion,
                intensity=intensity,
                confidence=confidence,
                emotional_keywords=emotional_keywords,
                context_analysis=context_analysis
            )
            
        except Exception as e:
            logger.error(f"ê°ì • ë¶„ì„ ?¤ë¥˜: {e}")
            return self._create_neutral_emotion()
    
    def _preprocess_text(self, text: str) -> str:
        """?ìŠ¤???„ì²˜ë¦?""
        # ?Œë¬¸??ë³€??ë°?ê³µë°± ?•ë¦¬
        cleaned = text.lower().strip()
        
        # ë°˜ë³µ ë¬¸ì ?•ë¦¬ (?? "?„ì•„?„ì•…" -> "?„ì•…")
        cleaned = re.sub(r'(.)\1{2,}', r'\1\1', cleaned)
        
        # ?˜ë??†ëŠ” ?¹ìˆ˜ë¬¸ì ?œê±° (ê°ì • ?œí˜„?€ ? ì?)
        cleaned = re.sub(r'[^\w\s!?.,~? ã…œ?‹ã…]', '', cleaned)
        
        return cleaned
    
    def _calculate_emotion_scores(self, text: str) -> Dict[EmotionType, float]:
        """ê°ì •ë³??ìˆ˜ ê³„ì‚°"""
        emotion_scores = {emotion: 0.0 for emotion in EmotionType}
        
        for emotion, keywords in self.emotion_keywords.items():
            for keyword in keywords:
                # ?¤ì›Œ??ë§¤ì¹­ ?Ÿìˆ˜
                matches = len(re.findall(keyword, text))
                base_score = matches * 1.0
                
                if base_score > 0:
                    # ê°•ë„ ?˜ì‹???ìš©
                    intensity_boost = self._calculate_intensity_boost(text, keyword)
                    final_score = base_score * intensity_boost
                    
                    emotion_scores[emotion] += final_score
        
        return emotion_scores
    
    def _calculate_intensity_boost(self, text: str, keyword: str) -> float:
        """ê°•ë„ ?˜ì‹?´ì— ?°ë¥¸ ë°°ìœ¨ ê³„ì‚°"""
        boost = 1.0
        
        # ?¤ì›Œ???ë’¤ 5ê¸€??ë²”ìœ„?ì„œ ?˜ì‹??ì°¾ê¸°
        keyword_positions = [m.start() for m in re.finditer(keyword, text)]
        
        for pos in keyword_positions:
            start = max(0, pos - 10)
            end = min(len(text), pos + len(keyword) + 10)
            context = text[start:end]
            
            for modifier, multiplier in self.intensity_modifiers.items():
                if modifier in context:
                    boost *= multiplier
                    break  # ì²?ë²ˆì§¸ ?˜ì‹?´ë§Œ ?ìš©
        
        return boost
    
    def _apply_context_boost(self, text: str, emotion_scores: Dict[EmotionType, float]) -> Dict[EmotionType, float]:
        """?í™©ë³?ì»¨í…?¤íŠ¸ ë¶€?¤íŠ¸ ?ìš©"""
        
        for context_name, context_info in self.context_patterns.items():
            context_matched = False
            
            # ?¨í„´ ë§¤ì¹­ ì²´í¬
            for pattern in context_info["patterns"]:
                if re.search(pattern, text):
                    context_matched = True
                    break
            
            if context_matched:
                # ?´ë‹¹ ?í™©?ì„œ ê°•í™”??ê°ì •?¤ì— ë°°ìœ¨ ?ìš©
                for emotion in context_info["boost_emotions"]:
                    if emotion in emotion_scores:
                        emotion_scores[emotion] *= context_info["multiplier"]
                
                logger.debug(f"ì»¨í…?¤íŠ¸ ë¶€?¤íŠ¸ ?ìš©: {context_name}")
        
        return emotion_scores
    
    def _handle_negation(self, text: str, emotion_scores: Dict[EmotionType, float]) -> Dict[EmotionType, float]:
        """ë¶€?•ì–´ ì²˜ë¦¬"""
        
        # ê°„ë‹¨??ë¶€?•ì–´ ì²˜ë¦¬ (?? "??ì¢‹ì•„" -> ê¸°ì¨ ê°ì†Œ)
        negation_count = sum(text.count(neg_word) for neg_word in self.negation_words)
        
        if negation_count > 0:
            # ê¸ì • ê°ì •?€ ê°ì†Œ, ë¶€??ê°ì •?€ ? ì?
            positive_emotions = [EmotionType.JOY, EmotionType.SURPRISE]
            negative_emotions = [
                EmotionType.SADNESS, EmotionType.ANGER, EmotionType.FEAR,
                EmotionType.STRESS, EmotionType.ANXIETY, EmotionType.FRUSTRATION
            ]
            
            negation_factor = 0.7 ** negation_count  # ë¶€?•ì–´ê°€ ë§ì„?˜ë¡ ê°•í•œ ê°ì†Œ
            
            for emotion in positive_emotions:
                emotion_scores[emotion] *= negation_factor
        
        return emotion_scores
    
    def _determine_final_emotions(self, emotion_scores: Dict[EmotionType, float]) -> Tuple[EmotionType, Optional[EmotionType], float]:
        """ìµœì¢… ê°ì • ë°?ê°•ë„ ê²°ì •"""
        
        # ?ìˆ˜ê°€ ?ˆëŠ” ê°ì •ë§??„í„°ë§?        non_zero_emotions = {k: v for k, v in emotion_scores.items() if v > 0}
        
        if not non_zero_emotions:
            return EmotionType.NEUTRAL, None, 0.5
        
        # ?ìˆ˜ ?œìœ¼ë¡??•ë ¬
        sorted_emotions = sorted(non_zero_emotions.items(), key=lambda x: x[1], reverse=True)
        
        primary_emotion = sorted_emotions[0][0]
        primary_score = sorted_emotions[0][1]
        
        # ë³´ì¡° ê°ì • (2?„ê? 1?„ì˜ 50% ?´ìƒ????
        secondary_emotion = None
        if len(sorted_emotions) > 1:
            secondary_score = sorted_emotions[1][1]
            if secondary_score >= primary_score * 0.5:
                secondary_emotion = sorted_emotions[1][0]
        
        # ê°•ë„ ê³„ì‚° (0.0 ~ 1.0)
        max_possible_score = 10.0  # ê°€?•ëœ ìµœë? ?ìˆ˜
        intensity = min(primary_score / max_possible_score, 1.0)
        
        # ê°•ë„ ë³´ì • (?ˆë¬´ ??? ?Šë„ë¡?
        intensity = max(intensity, 0.3)
        
        return primary_emotion, secondary_emotion, intensity
    
    def _extract_emotional_keywords(self, text: str, primary_emotion: EmotionType) -> List[str]:
        """ê°ì • ?¤ì›Œ??ì¶”ì¶œ"""
        keywords = []
        
        if primary_emotion in self.emotion_keywords:
            emotion_keywords = self.emotion_keywords[primary_emotion]
            for keyword in emotion_keywords:
                if keyword in text:
                    keywords.append(keyword)
        
        # ì¤‘ë³µ ?œê±° ë°?ê¸¸ì´ ?œí•œ
        unique_keywords = list(set(keywords))[:10]
        
        return unique_keywords
    
    def _calculate_confidence(self, emotion_scores: Dict[EmotionType, float], text: str) -> float:
        """ë¶„ì„ ? ë¢°??ê³„ì‚°"""
        
        confidence = 0.5  # ê¸°ë³¸ ? ë¢°??        
        # 1. ?„ì²´ ê°ì • ?ìˆ˜ê°€ ?’ì„?˜ë¡ ? ë¢°??ì¦ê?
        total_score = sum(emotion_scores.values())
        if total_score > 5:
            confidence += 0.2
        elif total_score > 2:
            confidence += 0.1
        
        # 2. ?ìŠ¤??ê¸¸ì´ê°€ ?ì ˆ????? ë¢°??ì¦ê?
        text_length = len(text)
        if 10 <= text_length <= 200:
            confidence += 0.1
        elif 200 < text_length <= 500:
            confidence += 0.05
        
        # 3. ê°ì • ?¤ì›Œ?œê? ?¤ì–‘????? ë¢°??ì¦ê?
        unique_emotions = len([k for k, v in emotion_scores.items() if v > 0])
        if unique_emotions >= 2:
            confidence += 0.1
        elif unique_emotions == 1:
            confidence += 0.05
        
        # 4. ê°•ë„ ?˜ì‹?´ê? ?ˆì„ ??? ë¢°??ì¦ê?
        has_modifiers = any(modifier in text for modifier in self.intensity_modifiers.keys())
        if has_modifiers:
            confidence += 0.1
        
        # ìµœë? 1.0?¼ë¡œ ?œí•œ
        return min(confidence, 1.0)
    
    def _analyze_context(self, text: str) -> Dict[str, Any]:
        """?í™© ë¶„ì„ (ë§¥ë½ ?•ë³´)"""
        
        context = {
            "detected_situations": [],
            "text_characteristics": {},
            "emotional_complexity": "simple"
        }
        
        # 1. ?í™© ê°ì?
        for situation_name, situation_info in self.context_patterns.items():
            for pattern in situation_info["patterns"]:
                if re.search(pattern, text):
                    context["detected_situations"].append(situation_name)
                    break
        
        # 2. ?ìŠ¤???¹ì„± ë¶„ì„
        context["text_characteristics"] = {
            "length": len(text),
            "sentence_count": len(text.split('.')),
            "question_marks": text.count('?'),
            "exclamation_marks": text.count('!'),
            "repetitive_chars": len(re.findall(r'(.)\1{2,}', text))
        }
        
        # 3. ê°ì • ë³µì¡??ê²°ì •
        if len(context["detected_situations"]) > 2:
            context["emotional_complexity"] = "complex"
        elif len(context["detected_situations"]) == 2:
            context["emotional_complexity"] = "moderate"
        
        return context
    
    def _create_neutral_emotion(self) -> EmotionAnalysis:
        """ì¤‘ë¦½ ê°ì • ?ì„± (?¤ë¥˜ ?ëŠ” ë¶„ì„ ë¶ˆê? ??"""
        return EmotionAnalysis(
            primary_emotion=EmotionType.NEUTRAL,
            secondary_emotion=None,
            intensity=0.5,
            confidence=0.3,
            emotional_keywords=[],
            context_analysis={"error": "ë¶„ì„ ?¤íŒ¨ ?ëŠ” ì¤‘ë¦½???ìŠ¤??}
        )

# ?„ì—­ ê°ì • ë¶„ì„ê¸??¸ìŠ¤?´ìŠ¤ (?±ê???
_emotion_analyzer_instance: Optional[EmotionAnalyzer] = None

def get_emotion_analyzer() -> EmotionAnalyzer:
    """ê°ì • ë¶„ì„ê¸??¸ìŠ¤?´ìŠ¤ ë°˜í™˜ (?±ê???"""
    global _emotion_analyzer_instance
    if _emotion_analyzer_instance is None:
        _emotion_analyzer_instance = EmotionAnalyzer()
    return _emotion_analyzer_instance
