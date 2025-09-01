"""
감정 분석 서비스
텍스트 기반 감정 상태 분석 및 EFT 맞춤 추천을 위한 전처리
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
    """한국어 텍스트 감정 분석기"""
    
    def __init__(self):
        """감정 분석기 초기화"""
        self.emotion_keywords = self._load_emotion_keywords()
        self.intensity_modifiers = self._load_intensity_modifiers()
        self.context_patterns = self._load_context_patterns()
        self.negation_words = self._load_negation_words()
        
        logger.info("✅ 감정 분석기 초기화 완료")
    
    def _load_emotion_keywords(self) -> Dict[EmotionType, List[str]]:
        """감정별 키워드 사전"""
        return {
            EmotionType.JOY: [
                "기쁘", "행복", "즐거", "신나", "좋", "만족", "환상", "최고", "완벽",
                "웃", "미소", "설레", "흥분", "활기", "상쾌", "기분좋", "희희",
                "야호", "와우", "대박", "짱", "꿀", "사랑스러", "달콤", "따뜻"
            ],
            EmotionType.SADNESS: [
                "슬프", "아프", "우울", "눈물", "울", "마음아파", "속상", "답답", 
                "허무", "절망", "좌절", "힘들", "괴로", "고통", "비참", "처량",
                "쓸쓸", "외로", "공허", "암울", "침울", "깊은한숨", "한숨", "체념"
            ],
            EmotionType.ANGER: [
                "화", "짜증", "열받", "분노", "억울", "빡쳐", "미치겠", "뭐야",
                "어이없", "말도안돼", "개빡", "개열받", "진짜", "어떻게", "왜",
                "죽이고싶", "때리고싶", "복수", "원망", "증오", "혈압", "참을수없"
            ],
            EmotionType.FEAR: [
                "무섭", "두려", "걱정", "근심", "불안", "공포", "무서워", "떨려",
                "오싹", "소름", "긴장", "초조", "조마조마", "심장", "식은땀", 
                "떨림", "겁", "공포감", "불안감", "위험", "위기감"
            ],
            EmotionType.SURPRISE: [
                "놀라", "깜짝", "어?", "헉", "와", "어머", "세상에", "진짜?",
                "설마", "어떻게", "믿을수없", "상상못했", "예상못했", "갑자기",
                "느닷없이", "충격", "당황", "어리둥절"
            ],
            EmotionType.DISGUST: [
                "역겨", "싫", "꼴보기싫", "구역질", "더러", "지겨", "짜증", "엣",
                "우웩", "토나와", "못봐주겠", "한심", "어이없", "기가막혀"
            ],
            EmotionType.STRESS: [
                "스트레스", "압박", "부담", "피곤", "지쳐", "힘들", "벅차", "몰려",
                "쌓여", "터질것같", "한계", "과로", "번아웃", "소진", "지침",
                "무리", "버거", "감당안돼", "머리아파", "목어깨", "근육", "긴장"
            ],
            EmotionType.ANXIETY: [
                "불안", "걱정", "근심", "초조", "조급", "불안정", "동요", "염려",
                "우려", "걱정스러", "마음편하지않", "안절부절", "조마조마", 
                "가슴답답", "심장두근", "손떨림", "식은땀", "불면", "잠못자"
            ],
            EmotionType.LONELINESS: [
                "외로", "혼자", "쓸쓸", "고립", "단절", "소외", "공허", "텅빈",
                "아무도없", "홀로", "곁에없", "버림받", "소통안돼", "이해안돼",
                "혼밥", "혼술", "혼영", "혼자만", "외톨이"
            ],
            EmotionType.FRUSTRATION: [
                "답답", "막막", "좌절", "포기", "안돼", "어떻게", "방법없", "길막",
                "진전없", "제자리", "발전없", "소용없", "헛수고", "벽", "한계",
                "막다른", "절망적", "희망없", "어쩔수없"
            ]
        }
    
    def _load_intensity_modifiers(self) -> Dict[str, float]:
        """강도 수식어 사전 (배율)"""
        return {
            # 강화 수식어
            "정말": 1.5, "너무": 1.4, "진짜": 1.3, "완전": 1.3, "엄청": 1.3,
            "무척": 1.2, "매우": 1.2, "꽤": 1.1, "상당히": 1.2, "극도로": 1.6,
            "최고로": 1.5, "최대로": 1.5, "심각하게": 1.4, "치명적으로": 1.6,
            "죽도록": 1.5, "미치도록": 1.4, "파멸적으로": 1.6,
            
            # 완화 수식어  
            "좀": 0.8, "약간": 0.7, "살짝": 0.6, "조금": 0.7, "그냥": 0.8,
            "별로": 0.6, "그렇게": 0.8, "그런대로": 0.7, "어느정도": 0.8,
            "적당히": 0.7, "다소": 0.8, "어느정도": 0.8,
            
            # 반복/지속 강화
            "계속": 1.3, "지속적으로": 1.2, "끊임없이": 1.4, "쭉": 1.2,
            "항상": 1.3, "늘": 1.2, "자꾸": 1.3, "또": 1.1, "다시": 1.1
        }
    
    def _load_context_patterns(self) -> Dict[str, Dict[str, Any]]:
        """상황별 패턴 인식"""
        return {
            "work_stress": {
                "patterns": [
                    r"(회사|직장|업무|일|상사|동료|야근|출근|퇴근|월급|승진)",
                    r"(프로젝트|마감|회의|보고서|발표|평가|성과)"
                ],
                "boost_emotions": [EmotionType.STRESS, EmotionType.FRUSTRATION],
                "multiplier": 1.2
            },
            "relationship_issues": {
                "patterns": [
                    r"(남친|여친|애인|연인|짝사랑|이별|헤어|차임|바람)",
                    r"(친구|동기|선후배|인간관계|사람들|소통|갈등)"
                ],
                "boost_emotions": [EmotionType.SADNESS, EmotionType.LONELINESS, EmotionType.ANGER],
                "multiplier": 1.3
            },
            "family_problems": {
                "patterns": [
                    r"(부모|엄마|아빠|가족|형제|자매|시댁|처가|시어머니|장모)",
                    r"(가정|집|결혼|육아|아이|자식)"
                ],
                "boost_emotions": [EmotionType.STRESS, EmotionType.FRUSTRATION, EmotionType.SADNESS],
                "multiplier": 1.4
            },
            "health_concerns": {
                "patterns": [
                    r"(아프|병|몸살|감기|병원|의사|약|치료|건강|몸)",
                    r"(두통|복통|소화|불면|잠못|피곤|지쳐)"
                ],
                "boost_emotions": [EmotionType.ANXIETY, EmotionType.SADNESS],
                "multiplier": 1.3
            },
            "financial_stress": {
                "patterns": [
                    r"(돈|비용|비싸|비용|월세|대출|빚|카드|적금|투자)",
                    r"(경제|재정|수입|지출|생활비|용돈)"
                ],
                "boost_emotions": [EmotionType.STRESS, EmotionType.ANXIETY],
                "multiplier": 1.3
            }
        }
    
    def _load_negation_words(self) -> List[str]:
        """부정어 리스트"""
        return [
            "안", "못", "아니", "없", "말고", "말아", "아냐", "아니야", 
            "절대", "전혀", "조금도", "별로", "그리", "딱히"
        ]
    
    async def analyze(self, text: str) -> EmotionAnalysis:
        """텍스트 감정 분석 메인 함수"""
        
        if not text or len(text.strip()) == 0:
            return self._create_neutral_emotion()
        
        try:
            # 1. 텍스트 전처리
            cleaned_text = self._preprocess_text(text)
            
            # 2. 감정별 점수 계산
            emotion_scores = self._calculate_emotion_scores(cleaned_text)
            
            # 3. 상황별 컨텍스트 부스트 적용
            emotion_scores = self._apply_context_boost(cleaned_text, emotion_scores)
            
            # 4. 부정어 처리
            emotion_scores = self._handle_negation(cleaned_text, emotion_scores)
            
            # 5. 최종 감정 및 강도 결정
            primary_emotion, secondary_emotion, intensity = self._determine_final_emotions(emotion_scores)
            
            # 6. 감정 키워드 추출
            emotional_keywords = self._extract_emotional_keywords(cleaned_text, primary_emotion)
            
            # 7. 신뢰도 계산
            confidence = self._calculate_confidence(emotion_scores, cleaned_text)
            
            # 8. 상황 분석 (맥락 정보)
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
            logger.error(f"감정 분석 오류: {e}")
            return self._create_neutral_emotion()
    
    def _preprocess_text(self, text: str) -> str:
        """텍스트 전처리"""
        # 소문자 변환 및 공백 정리
        cleaned = text.lower().strip()
        
        # 반복 문자 정리 (예: "아아아악" -> "아악")
        cleaned = re.sub(r'(.)\1{2,}', r'\1\1', cleaned)
        
        # 의미없는 특수문자 제거 (감정 표현은 유지)
        cleaned = re.sub(r'[^\w\s!?.,~ㅠㅜㅋㅎ]', '', cleaned)
        
        return cleaned
    
    def _calculate_emotion_scores(self, text: str) -> Dict[EmotionType, float]:
        """감정별 점수 계산"""
        emotion_scores = {emotion: 0.0 for emotion in EmotionType}
        
        for emotion, keywords in self.emotion_keywords.items():
            for keyword in keywords:
                # 키워드 매칭 횟수
                matches = len(re.findall(keyword, text))
                base_score = matches * 1.0
                
                if base_score > 0:
                    # 강도 수식어 적용
                    intensity_boost = self._calculate_intensity_boost(text, keyword)
                    final_score = base_score * intensity_boost
                    
                    emotion_scores[emotion] += final_score
        
        return emotion_scores
    
    def _calculate_intensity_boost(self, text: str, keyword: str) -> float:
        """강도 수식어에 따른 배율 계산"""
        boost = 1.0
        
        # 키워드 앞뒤 5글자 범위에서 수식어 찾기
        keyword_positions = [m.start() for m in re.finditer(keyword, text)]
        
        for pos in keyword_positions:
            start = max(0, pos - 10)
            end = min(len(text), pos + len(keyword) + 10)
            context = text[start:end]
            
            for modifier, multiplier in self.intensity_modifiers.items():
                if modifier in context:
                    boost *= multiplier
                    break  # 첫 번째 수식어만 적용
        
        return boost
    
    def _apply_context_boost(self, text: str, emotion_scores: Dict[EmotionType, float]) -> Dict[EmotionType, float]:
        """상황별 컨텍스트 부스트 적용"""
        
        for context_name, context_info in self.context_patterns.items():
            context_matched = False
            
            # 패턴 매칭 체크
            for pattern in context_info["patterns"]:
                if re.search(pattern, text):
                    context_matched = True
                    break
            
            if context_matched:
                # 해당 상황에서 강화할 감정들에 배율 적용
                for emotion in context_info["boost_emotions"]:
                    if emotion in emotion_scores:
                        emotion_scores[emotion] *= context_info["multiplier"]
                
                logger.debug(f"컨텍스트 부스트 적용: {context_name}")
        
        return emotion_scores
    
    def _handle_negation(self, text: str, emotion_scores: Dict[EmotionType, float]) -> Dict[EmotionType, float]:
        """부정어 처리"""
        
        # 간단한 부정어 처리 (예: "안 좋아" -> 기쁨 감소)
        negation_count = sum(text.count(neg_word) for neg_word in self.negation_words)
        
        if negation_count > 0:
            # 긍정 감정은 감소, 부정 감정은 유지
            positive_emotions = [EmotionType.JOY, EmotionType.SURPRISE]
            negative_emotions = [
                EmotionType.SADNESS, EmotionType.ANGER, EmotionType.FEAR,
                EmotionType.STRESS, EmotionType.ANXIETY, EmotionType.FRUSTRATION
            ]
            
            negation_factor = 0.7 ** negation_count  # 부정어가 많을수록 강한 감소
            
            for emotion in positive_emotions:
                emotion_scores[emotion] *= negation_factor
        
        return emotion_scores
    
    def _determine_final_emotions(self, emotion_scores: Dict[EmotionType, float]) -> Tuple[EmotionType, Optional[EmotionType], float]:
        """최종 감정 및 강도 결정"""
        
        # 점수가 있는 감정만 필터링
        non_zero_emotions = {k: v for k, v in emotion_scores.items() if v > 0}
        
        if not non_zero_emotions:
            return EmotionType.NEUTRAL, None, 0.5
        
        # 점수 순으로 정렬
        sorted_emotions = sorted(non_zero_emotions.items(), key=lambda x: x[1], reverse=True)
        
        primary_emotion = sorted_emotions[0][0]
        primary_score = sorted_emotions[0][1]
        
        # 보조 감정 (2위가 1위의 50% 이상일 때)
        secondary_emotion = None
        if len(sorted_emotions) > 1:
            secondary_score = sorted_emotions[1][1]
            if secondary_score >= primary_score * 0.5:
                secondary_emotion = sorted_emotions[1][0]
        
        # 강도 계산 (0.0 ~ 1.0)
        max_possible_score = 10.0  # 가정된 최대 점수
        intensity = min(primary_score / max_possible_score, 1.0)
        
        # 강도 보정 (너무 낮지 않도록)
        intensity = max(intensity, 0.3)
        
        return primary_emotion, secondary_emotion, intensity
    
    def _extract_emotional_keywords(self, text: str, primary_emotion: EmotionType) -> List[str]:
        """감정 키워드 추출"""
        keywords = []
        
        if primary_emotion in self.emotion_keywords:
            emotion_keywords = self.emotion_keywords[primary_emotion]
            for keyword in emotion_keywords:
                if keyword in text:
                    keywords.append(keyword)
        
        # 중복 제거 및 길이 제한
        unique_keywords = list(set(keywords))[:10]
        
        return unique_keywords
    
    def _calculate_confidence(self, emotion_scores: Dict[EmotionType, float], text: str) -> float:
        """분석 신뢰도 계산"""
        
        confidence = 0.5  # 기본 신뢰도
        
        # 1. 전체 감정 점수가 높을수록 신뢰도 증가
        total_score = sum(emotion_scores.values())
        if total_score > 5:
            confidence += 0.2
        elif total_score > 2:
            confidence += 0.1
        
        # 2. 텍스트 길이가 적절할 때 신뢰도 증가
        text_length = len(text)
        if 10 <= text_length <= 200:
            confidence += 0.1
        elif 200 < text_length <= 500:
            confidence += 0.05
        
        # 3. 감정 키워드가 다양할 때 신뢰도 증가
        unique_emotions = len([k for k, v in emotion_scores.items() if v > 0])
        if unique_emotions >= 2:
            confidence += 0.1
        elif unique_emotions == 1:
            confidence += 0.05
        
        # 4. 강도 수식어가 있을 때 신뢰도 증가
        has_modifiers = any(modifier in text for modifier in self.intensity_modifiers.keys())
        if has_modifiers:
            confidence += 0.1
        
        # 최대 1.0으로 제한
        return min(confidence, 1.0)
    
    def _analyze_context(self, text: str) -> Dict[str, Any]:
        """상황 분석 (맥락 정보)"""
        
        context = {
            "detected_situations": [],
            "text_characteristics": {},
            "emotional_complexity": "simple"
        }
        
        # 1. 상황 감지
        for situation_name, situation_info in self.context_patterns.items():
            for pattern in situation_info["patterns"]:
                if re.search(pattern, text):
                    context["detected_situations"].append(situation_name)
                    break
        
        # 2. 텍스트 특성 분석
        context["text_characteristics"] = {
            "length": len(text),
            "sentence_count": len(text.split('.')),
            "question_marks": text.count('?'),
            "exclamation_marks": text.count('!'),
            "repetitive_chars": len(re.findall(r'(.)\1{2,}', text))
        }
        
        # 3. 감정 복잡도 결정
        if len(context["detected_situations"]) > 2:
            context["emotional_complexity"] = "complex"
        elif len(context["detected_situations"]) == 2:
            context["emotional_complexity"] = "moderate"
        
        return context
    
    def _create_neutral_emotion(self) -> EmotionAnalysis:
        """중립 감정 생성 (오류 또는 분석 불가 시)"""
        return EmotionAnalysis(
            primary_emotion=EmotionType.NEUTRAL,
            secondary_emotion=None,
            intensity=0.5,
            confidence=0.3,
            emotional_keywords=[],
            context_analysis={"error": "분석 실패 또는 중립적 텍스트"}
        )

# 전역 감정 분석기 인스턴스 (싱글톤)
_emotion_analyzer_instance: Optional[EmotionAnalyzer] = None

def get_emotion_analyzer() -> EmotionAnalyzer:
    """감정 분석기 인스턴스 반환 (싱글톤)"""
    global _emotion_analyzer_instance
    if _emotion_analyzer_instance is None:
        _emotion_analyzer_instance = EmotionAnalyzer()
    return _emotion_analyzer_instance