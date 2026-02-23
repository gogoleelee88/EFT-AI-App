"""
감정 분석기 모듈

문장 내 키워드 빈도와 감정 강도 지표를 기반으로 감정 상태를 판별한다.
텍스트에 포함된 부정어/강조어/상황 패턴을 반영해 최종 감정 점수를 계산한다.
"""

import re
from typing import Any, Dict, List, Optional, Tuple

from backend.models.chat_models import EmotionAnalysis, EmotionType
from utils.logger import get_logger

logger = get_logger(__name__)


class EmotionAnalyzer:
    """감정 분석 클래스"""

    def __init__(self):
        """감정 분석器 초기화"""
        self.emotion_keywords = self._load_emotion_keywords()
        self.intensity_modifiers = self._load_intensity_modifiers()
        self.context_patterns = self._load_context_patterns()
        self.negation_words = self._load_negation_words()

        logger.info("감정 분석 데이터 로드 완료")

    def _load_emotion_keywords(self) -> Dict[EmotionType, List[str]]:
        """감정별 핵심 키워드 사전"""
        return {
            EmotionType.JOY: [
                "기쁘", "행복", "좋", "사랑", "즐겁", "웃", "감사",
                "희망", "신남", "설레", "만족", "평온", "안도",
            ],
            EmotionType.SADNESS: [
                "슬프", "우울", "속상", "절망", "눈물", "허전", "억울",
                "불안", "힘들", "외롭", "우울함", "상심", "지침",
            ],
            EmotionType.ANGER: [
                "화", "분노", "짜증", "억울", "억울함", "열받", "싫", "폭발",
                "분개", "짜증남", "언짢", "성미", "답답", "불쾌", "격앙",
            ],
            EmotionType.FEAR: [
                "무서", "두려", "겁", "긴장", "공포", "불안", "불길", "불심",
                "위험", "위축", "걱정", "전전", "불신", "위협", "경직",
            ],
            EmotionType.SURPRISE: [
                "놀라", "깜짝", "예기치", "갑작", "충격", "뜻밖", "신기",
                "어라", "허탈", "당황", "기대", "기묘", "돌발", "예상밖", "충돌",
            ],
            EmotionType.DISGUST: [
                "싫", "혐오", "역겨", "메스꺼", "불쾌", "거북", "불쾌감",
                "더러", "추함", "혐오감", "구역", "거부", "위생", "냄새",
            ],
            EmotionType.STRESS: [
                "스트레스", "피곤", "지쳐", "압박", "과로", "번아웃", "마감",
                "빡침", "힘듦", "지김", "지치", "숨막", "초조", "압박감", "불면",
            ],
            EmotionType.ANXIETY: [
                "불안", "초조", "긴장", "두근", "떨리", "공황", "불면",
                "과호", "고민", "염려", "걱정", "심장", "잠깐", "안절부절", "우려",
            ],
            EmotionType.LONELINESS: [
                "외롭", "쓸쓸", "고립", "혼자", "고독", "허무", "공허",
                "그리", "누구", "연결", "버려", "위로", "무력", "의지없", "차갑",
            ],
            EmotionType.FRUSTRATION: [
                "답답", "좌절", "막히", "원망", "실망", "힘들", "못참", "체념",
                "번복", "지연", "안돼", "불만", "조급", "낙담", "흘려", "단념",
            ],
        }

    def _load_intensity_modifiers(self) -> Dict[str, float]:
        """강도 보정 용어"""
        return {
            # 강한 강도
            "매우": 1.5,
            "정말": 1.4,
            "완전": 1.4,
            "진짜": 1.3,
            "굉장히": 1.3,
            "심하게": 1.4,
            "대단히": 1.3,
            "엄청": 1.3,
            "정말로": 1.4,
            "너무": 1.4,

            # 중간 강도
            "조금": 1.1,
            "조금씩": 1.1,
            "조금만": 1.0,
            "약간": 1.0,
            "좀": 1.1,
            "약간씩": 1.0,

            # 완화
            "조금은": 0.8,
            "약간의": 0.9,
            "별로": 0.7,
            "거의": 0.8,
            "별로안": 0.6,
            "조금도": 0.7,
            "아주조금": 0.7,
        }

    def _load_context_patterns(self) -> Dict[str, Dict[str, Any]]:
        """상황 패턴"""
        return {
            "work_stress": {
                "patterns": [
                    r"(상사|직장|업무|마감|보고서|회의|프로젝트|성과|일정|야근|퇴근)",
                    r"(성과압박|업무량|책임|실수|실적|평가|고객|회의자료)",
                ],
                "boost_emotions": [EmotionType.STRESS, EmotionType.FRUSTRATION],
                "multiplier": 1.2,
            },
            "relationship_issues": {
                "patterns": [
                    r"(연애|연인|배우자|사람|친구|동료|서로|오해|다툼|싸움)",
                    r"(소통|심술|냉담|거리|상처|비난|무시|속상)",
                ],
                "boost_emotions": [EmotionType.SADNESS, EmotionType.LONELINESS, EmotionType.ANGER],
                "multiplier": 1.3,
            },
            "family_conflicts": {
                "patterns": [
                    r"(부모|형제|가족|아이|부모님|아버지|어머니|형제자매|집안)",
                    r"(갈등|입장차|서운|눈치|의무|돌봄|부담|보살핌)",
                ],
                "boost_emotions": [EmotionType.STRESS, EmotionType.FRUSTRATION, EmotionType.SADNESS],
                "multiplier": 1.4,
            },
            "health_concerns": {
                "patterns": [
                    r"(몸|아프|통증|두통|속|불면|식욕|숨|심장|어지러|피곤)",
                    r"(병원|진료|검사|약|치료|회복|피로|증상|염려|건강)",
                ],
                "boost_emotions": [EmotionType.ANXIETY, EmotionType.SADNESS],
                "multiplier": 1.3,
            },
            "financial_stress": {
                "patterns": [
                    r"(돈|대출|빚|지출|예산|월급|실직|부채|부담|생활비)",
                    r"(경제|재정|절약|물가|비용|채무|수입|지갑)",
                ],
                "boost_emotions": [EmotionType.STRESS, EmotionType.ANXIETY],
                "multiplier": 1.3,
            },
        }

    def _load_negation_words(self) -> List[str]:
        """부정어 목록"""
        return ["안", "아니", "못", "안돼", "없", "안좋", "별로", "아닌", "싫", "말고"]

    async def analyze(self, text: str) -> EmotionAnalysis:
        """입력 텍스트를 분석해 감정 결과 생성"""
        if not text or len(text.strip()) == 0:
            return self._create_neutral_emotion()

        try:
            cleaned_text = self._preprocess_text(text)
            emotion_scores = self._calculate_emotion_scores(cleaned_text)
            emotion_scores = self._apply_context_boost(cleaned_text, emotion_scores)
            emotion_scores = self._handle_negation(cleaned_text, emotion_scores)

            primary_emotion, secondary_emotion, intensity = self._determine_final_emotions(emotion_scores)
            emotional_keywords = self._extract_emotional_keywords(cleaned_text, primary_emotion)
            confidence = self._calculate_confidence(emotion_scores, cleaned_text)
            context_analysis = self._analyze_context(cleaned_text)

            return EmotionAnalysis(
                primary_emotion=primary_emotion,
                secondary_emotion=secondary_emotion,
                intensity=intensity,
                confidence=confidence,
                emotional_keywords=emotional_keywords,
                context_analysis=context_analysis,
            )
        except Exception as e:
            logger.error(f"감정 분석 중 오류: {e}")
            return self._create_neutral_emotion()

    def _preprocess_text(self, text: str) -> str:
        """텍스트 정규화"""
        cleaned = text.lower().strip()
        cleaned = re.sub(r"(.)\1{2,}", r"\1\1", cleaned)
        cleaned = re.sub(r"[^\w\s!?.,~가-힣]", "", cleaned)
        return cleaned

    def _calculate_emotion_scores(self, text: str) -> Dict[EmotionType, float]:
        """감정 점수 집계"""
        emotion_scores = {emotion: 0.0 for emotion in EmotionType}

        for emotion, keywords in self.emotion_keywords.items():
            for keyword in keywords:
                matches = len(re.findall(re.escape(keyword), text))
                if matches <= 0:
                    continue

                base_score = float(matches)
                intensity_boost = self._calculate_intensity_boost(text, keyword)
                emotion_scores[emotion] += base_score * intensity_boost

        return emotion_scores

    def _calculate_intensity_boost(self, text: str, keyword: str) -> float:
        """키워드 주변의 강조어 반영"""
        boost = 1.0
        keyword_positions = [m.start() for m in re.finditer(re.escape(keyword), text)]

        for pos in keyword_positions:
            start = max(0, pos - 10)
            end = min(len(text), pos + len(keyword) + 10)
            context = text[start:end]
            for modifier, multiplier in self.intensity_modifiers.items():
                if modifier in context:
                    boost *= multiplier
                    break

        return boost

    def _apply_context_boost(
        self,
        text: str,
        emotion_scores: Dict[EmotionType, float],
    ) -> Dict[EmotionType, float]:
        """상황 패턴 일치 시 감정 점수 보정"""
        for context_name, context_info in self.context_patterns.items():
            matched = any(re.search(pattern, text) for pattern in context_info["patterns"])
            if not matched:
                continue

            for emotion in context_info["boost_emotions"]:
                if emotion in emotion_scores:
                    emotion_scores[emotion] *= context_info["multiplier"]

            logger.debug(f"상황 패턴 적용: {context_name}")

        return emotion_scores

    def _handle_negation(self, text: str, emotion_scores: Dict[EmotionType, float]) -> Dict[EmotionType, float]:
        """부정어 보정"""
        negation_count = sum(text.count(neg_word) for neg_word in self.negation_words)
        if negation_count <= 0:
            return emotion_scores

        negative_factor = 0.7 ** negation_count
        for emotion in [EmotionType.JOY, EmotionType.SURPRISE]:
            emotion_scores[emotion] *= negative_factor

        return emotion_scores

    def _determine_final_emotions(self, emotion_scores: Dict[EmotionType, float]) -> Tuple[EmotionType, Optional[EmotionType], float]:
        """최종 감정과 강도 결정"""
        non_zero_emotions = {k: v for k, v in emotion_scores.items() if v > 0}
        if not non_zero_emotions:
            return EmotionType.NEUTRAL, None, 0.5

        sorted_emotions = sorted(non_zero_emotions.items(), key=lambda x: x[1], reverse=True)
        primary_emotion, primary_score = sorted_emotions[0]

        secondary_emotion: Optional[EmotionType] = None
        if len(sorted_emotions) > 1 and sorted_emotions[1][1] >= primary_score * 0.5:
            secondary_emotion = sorted_emotions[1][0]

        max_possible_score = 10.0
        intensity = min(primary_score / max_possible_score, 1.0)
        intensity = max(intensity, 0.3)

        return primary_emotion, secondary_emotion, intensity

    def _extract_emotional_keywords(self, text: str, primary_emotion: EmotionType) -> List[str]:
        """감지된 핵심 키워드 추출"""
        keywords = []
        for keyword in self.emotion_keywords.get(primary_emotion, []):
            if keyword in text:
                keywords.append(keyword)

        return list(dict.fromkeys(keywords))[:10]

    def _calculate_confidence(self, emotion_scores: Dict[EmotionType, float], text: str) -> float:
        """신뢰도 계산"""
        confidence = 0.5
        total_score = sum(emotion_scores.values())

        if total_score > 5:
            confidence += 0.2
        elif total_score > 2:
            confidence += 0.1

        text_length = len(text)
        if 10 <= text_length <= 200:
            confidence += 0.1
        elif 200 < text_length <= 500:
            confidence += 0.05

        unique_emotions = len([v for v in emotion_scores.values() if v > 0])
        if unique_emotions >= 2:
            confidence += 0.1
        elif unique_emotions == 1:
            confidence += 0.05

        if any(modifier in text for modifier in self.intensity_modifiers.keys()):
            confidence += 0.1

        return min(confidence, 1.0)

    def _analyze_context(self, text: str) -> Dict[str, Any]:
        """상황 분석"""
        context = {
            "detected_situations": [],
            "text_characteristics": {},
            "emotional_complexity": "simple",
        }

        for situation_name, situation_info in self.context_patterns.items():
            for pattern in situation_info["patterns"]:
                if re.search(pattern, text):
                    context["detected_situations"].append(situation_name)
                    break

        context["text_characteristics"] = {
            "length": len(text),
            "sentence_count": len(text.split(".")),
            "question_marks": text.count("?"),
            "exclamation_marks": text.count("!"),
            "repetitive_chars": len(re.findall(r"(.)\1{2,}", text)),
        }

        if len(context["detected_situations"]) > 2:
            context["emotional_complexity"] = "complex"
        elif len(context["detected_situations"]) == 2:
            context["emotional_complexity"] = "moderate"

        return context

    def _create_neutral_emotion(self) -> EmotionAnalysis:
        """기본(중립) 감정 결과 생성"""
        return EmotionAnalysis(
            primary_emotion=EmotionType.NEUTRAL,
            secondary_emotion=None,
            intensity=0.5,
            confidence=0.3,
            emotional_keywords=[],
            context_analysis={"error": "분석할 수 있는 감정 힌트가 없어 중립으로 처리했습니다."},
        )


_emotion_analyzer_instance: Optional[EmotionAnalyzer] = None


def get_emotion_analyzer() -> EmotionAnalyzer:
    """감정 분석기 싱글톤 반환"""
    global _emotion_analyzer_instance
    if _emotion_analyzer_instance is None:
        _emotion_analyzer_instance = EmotionAnalyzer()
    return _emotion_analyzer_instance

