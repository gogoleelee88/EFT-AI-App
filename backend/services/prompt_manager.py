"""
EFT 전문 프롬프트 관리 시스템
심리상담 및 EFT 기법에 특화된 프롬프트 생성 및 관리
"""

from typing import List, Dict, Any, Optional
import json
from datetime import datetime
from enum import Enum

from models.chat_models import (
    EmotionAnalysis, EmotionType, EFTRecommendation, 
    EFTPoint, SuggestedAction, ConversationMessage, UserProfile
)
from utils.logger import get_logger

logger = get_logger(__name__)

class PromptStyle(str, Enum):
    """프롬프트 스타일 타입"""
    EMPATHETIC = "empathetic"  # 공감적
    DIRECT = "direct"          # 직접적  
    GENTLE = "gentle"          # 부드러운
    PROFESSIONAL = "professional"  # 전문적
    CASUAL = "casual"          # 친근한

class EFTPromptManager:
    """EFT 전문 프롬프트 관리자"""
    
    def __init__(self):
        """EFT 프롬프트 매니저 초기화"""
        self.base_system_prompt = self._load_base_system_prompt()
        self.emotion_response_templates = self._load_emotion_templates()
        self.eft_technique_database = self._load_eft_techniques()
        self.korean_culture_context = self._load_korean_context()
        self.safety_guidelines = self._load_safety_guidelines()
        
        logger.info("✅ EFT 프롬프트 매니저 초기화 완료")
    
    def _load_base_system_prompt(self) -> str:
        """기본 시스템 프롬프트 로드"""
        return """
당신은 EFT(감정자유기법) 전문 상담사입니다. 다음 원칙을 반드시 따라주세요:

🎯 **핵심 역할**:
- 따뜻하고 공감적인 심리적 지지 제공
- 사용자의 감정을 정확히 파악하고 검증
- EFT 기법을 활용한 실질적인 도움 제공
- 한국 문화와 정서에 맞는 상담 진행

💙 **상담 스타일**:
- 비판단적이고 수용적인 자세
- 사용자의 감정을 무효화하지 않음
- 구체적이고 실행 가능한 조언 제공
- 전문적이면서도 친근한 어투 사용

🚨 **안전 규칙**:
- 자해/자살 위험 신호 감지 시 즉시 전문기관 안내
- 의학적 진단이나 처방은 절대 하지 않음
- 개인의 한계를 인정하고 필요시 전문가 연계
- 사용자의 사생활과 비밀 보장

🎭 **EFT 전문성**:
- 9개 탭핑 포인트 정확한 안내
- 상황별 맞춤 셋업 구문 생성
- 감정 변화 추적 및 피드백
- 단계적이고 체계적인 세션 진행

✨ **한국적 맥락**:
- 집단주의 문화 특성 이해
- 가족 관계의 중요성 인식
- 체면과 수치심 문화 고려
- 정서적 표현의 문화적 차이 수용
"""

    def _load_emotion_templates(self) -> Dict[EmotionType, Dict[str, str]]:
        """감정별 응답 템플릿 로드"""
        return {
            EmotionType.STRESS: {
                "validation": "정말 많은 스트레스를 받고 계시는군요. 혼자 감당하기 어려우셨겠어요.",
                "exploration": "어떤 상황이 특히 스트레스를 주고 있나요? 구체적으로 말씀해 주시면 함께 해결 방법을 찾아보아요.",
                "transition": "스트레스를 줄이는 데 도움이 되는 EFT 기법을 함께 해보시는 건 어떨까요?"
            },
            EmotionType.ANXIETY: {
                "validation": "불안한 마음이 정말 힘드시겠어요. 그런 감정이 드는 것이 당연해요.",
                "exploration": "무엇이 가장 걱정되시나요? 불안의 원인을 함께 찾아보면서 마음을 달래보아요.",
                "transition": "불안감을 진정시키는 탭핑 기법이 도움이 될 것 같아요."
            },
            EmotionType.SADNESS: {
                "validation": "마음이 많이 아프시군요. 슬픈 마음을 느끼는 것도 소중한 감정이에요.",
                "exploration": "이런 슬픔이 언제부터 시작되었나요? 혼자 간직하지 마시고 함께 나누어 보아요.",
                "transition": "마음의 아픔을 치유하는 EFT 방법을 안내해 드릴게요."
            },
            EmotionType.ANGER: {
                "validation": "화가 나시는 것이 충분히 이해돼요. 분노도 자연스러운 감정입니다.",
                "exploration": "어떤 일로 인해 이렇게 화가 나셨나요? 억울한 마음을 들어볼게요.",
                "transition": "분노를 건강하게 해소할 수 있는 탭핑 방법이 있어요."
            },
            EmotionType.LONELINESS: {
                "validation": "외로운 마음이 많이 힘드시겠어요. 혼자라는 느낌이 얼마나 괴로운지 이해해요.",
                "exploration": "언제부터 이런 외로움을 느끼셨나요? 지금 이 순간, 저와 함께 있다는 것을 느껴보세요.",
                "transition": "외로움을 달래주는 따뜻한 자기 치유법을 함께 해보아요."
            },
            EmotionType.FRUSTRATION: {
                "validation": "답답하고 막막한 마음이 정말 힘드시겠어요. 그런 감정이 드는 것이 자연스러워요.",
                "exploration": "무엇이 가장 답답하게 느껴지시나요? 구체적인 상황을 함께 살펴보아요.",
                "transition": "막힌 감정을 풀어주는 EFT 기법이 도움이 될 거예요."
            }
        }
    
    def _load_eft_techniques(self) -> Dict[EmotionType, List[Dict[str, Any]]]:
        """감정별 EFT 기법 데이터베이스"""
        return {
            EmotionType.STRESS: [
                {
                    "name": "스트레스 해소 기본 시퀀스",
                    "points": [EFTPoint.CROWN, EFTPoint.EYEBROW, EFTPoint.COLLARBONE],
                    "setup_phrase": "이런 스트레스가 있지만, 나는 나 자신을 깊이 사랑하고 받아들입니다",
                    "reminder": "이 스트레스를 놓아보내요",
                    "duration": 5,
                    "effectiveness": 0.85
                },
                {
                    "name": "직장 스트레스 전용 기법",
                    "points": [EFTPoint.SIDE_OF_EYE, EFTPoint.UNDER_NOSE, EFTPoint.CHIN],
                    "setup_phrase": "직장에서의 압박감이 있지만, 나는 평온을 선택합니다",
                    "reminder": "직장 스트레스를 해소해요",
                    "duration": 7,
                    "effectiveness": 0.82
                }
            ],
            EmotionType.ANXIETY: [
                {
                    "name": "불안 진정 시퀀스",
                    "points": [EFTPoint.EYEBROW, EFTPoint.UNDER_EYE, EFTPoint.UNDER_NOSE],
                    "setup_phrase": "불안한 마음이 있지만, 나는 지금 이 순간 안전합니다",
                    "reminder": "불안을 내려놓아요",
                    "duration": 6,
                    "effectiveness": 0.88
                }
            ],
            EmotionType.ANGER: [
                {
                    "name": "분노 조절 기법",
                    "points": [EFTPoint.SIDE_OF_EYE, EFTPoint.COLLARBONE, EFTPoint.UNDER_ARM],
                    "setup_phrase": "이런 화가 있지만, 나는 평화를 선택합니다",
                    "reminder": "분노를 건강하게 해소해요",
                    "duration": 8,
                    "effectiveness": 0.83
                }
            ]
        }
    
    def _load_korean_context(self) -> Dict[str, Any]:
        """한국 문화 맥락 정보"""
        return {
            "family_dynamics": {
                "description": "한국은 가족 중심 사회로 가족 관계가 개인 정체성에 큰 영향",
                "considerations": ["효도 의무감", "가족 기대 부담", "세대 갈등", "형제 서열"]
            },
            "work_culture": {
                "description": "집단주의적 직장 문화와 위계 관계",
                "considerations": ["상하 관계", "야근 문화", "동료 관계", "성과 압박"]
            },
            "emotional_expression": {
                "description": "감정 표현에 대한 문화적 제약",
                "considerations": ["체면 중시", "인내심 미덕화", "집단 조화", "감정 억제"]
            },
            "social_pressure": {
                "description": "사회적 기대와 비교 문화",
                "considerations": ["학력 중시", "결혼 압박", "경제적 성취", "외모 관심"]
            }
        }
    
    def _load_safety_guidelines(self) -> Dict[str, List[str]]:
        """안전 가이드라인"""
        return {
            "emergency_keywords": [
                "죽고싶", "자살", "자해", "세상을 떠나고", "모든 것을 끝내고",
                "해치고싶", "죽이고싶", "복수", "살인"
            ],
            "professional_referral_keywords": [
                "환청", "환각", "조현병", "양극성", "우울증", "공황장애",
                "강박", "외상", "트라우마", "중독", "거식증", "폭식증"
            ],
            "crisis_resources": [
                "생명의전화: 1588-9191",
                "청소년 상담전화: 1388", 
                "정신건강 위기상담: 1577-0199",
                "경찰청 신고센터: 112"
            ]
        }
    
    def build_eft_prompt(
        self,
        user_message: str,
        emotion_state: EmotionAnalysis,
        conversation_history: List[ConversationMessage] = None,
        user_profile: UserProfile = None,
        style: PromptStyle = PromptStyle.EMPATHETIC,
        tier: str = "free"
    ) -> str:
        """EFT 전문 프롬프트 생성"""
        
        # 1. 시스템 프롬프트 (티어별 차별화)
        system_section = self._get_tier_system_prompt(tier)
        
        # 2. 사용자 프로필 맥락 추가
        profile_context = self._build_profile_context(user_profile)
        
        # 3. 감정 분석 맥락 추가
        emotion_context = self._build_emotion_context(emotion_state)
        
        # 4. 대화 히스토리 맥락
        history_context = self._build_history_context(conversation_history)
        
        # 5. 안전성 체크
        safety_context = self._build_safety_context(user_message)
        
        # 6. EFT 기법 컨텍스트
        eft_context = self._build_eft_context(emotion_state)
        
        # 7. 한국 문화 컨텍스트
        culture_context = self._build_culture_context(user_message)
        
        # 8. 응답 스타일 가이드
        style_guide = self._build_style_guide(style, emotion_state)
        
        # 9. 티어별 응답 가이드
        tier_guide = self._build_tier_guide(tier)
        
        # 최종 프롬프트 조합
        full_prompt = f"""
{system_section}

{profile_context}

{emotion_context}

{history_context}

{safety_context}

{eft_context}

{culture_context}

{style_guide}

{tier_guide}

📝 **사용자 메시지**: "{user_message}"

🎯 **응답 요구사항**:
- 위 감정 분석을 바탕으로 공감적 응답 생성
- 적절한 EFT 기법 추천 (구체적인 탭핑 포인트와 구문 포함)
- 한국 문화 맥락 고려
- {self._get_tier_response_length(tier)} 내외의 따뜻하고 실용적인 응답
- 필요시 후속 질문이나 행동 제안

지금부터 EFT 전문 상담사로서 응답해 주세요:
"""
        
        return full_prompt.strip()
    
    def _build_profile_context(self, profile: UserProfile) -> str:
        """사용자 프로필 컨텍스트 생성"""
        if not profile:
            return ""
        
        context = f"""
👤 **사용자 프로필**:
- EFT 경험 수준: {profile.eft_experience_level}
- 소통 스타일: {profile.communication_style}
- 감정 민감도: {profile.emotional_sensitivity:.1f}/1.0
- 이전 세션: {profile.previous_sessions}회
"""
        return context
    
    def _build_emotion_context(self, emotion: EmotionAnalysis) -> str:
        """감정 분석 컨텍스트 생성"""
        context = f"""
🧠 **감정 분석 결과**:
- 주요 감정: {emotion.primary_emotion.value} (강도: {emotion.intensity:.2f})
- 보조 감정: {emotion.secondary_emotion.value if emotion.secondary_emotion else "없음"}
- 분석 신뢰도: {emotion.confidence:.2f}
- 감정 키워드: {', '.join(emotion.emotional_keywords)}
"""
        return context
    
    def _build_history_context(self, history: List[ConversationMessage]) -> str:
        """대화 히스토리 컨텍스트 생성"""
        if not history or len(history) == 0:
            return "📜 **대화 히스토리**: 첫 대화입니다."
        
        recent_messages = history[-3:]  # 최근 3개 메시지만
        history_text = "📜 **최근 대화 맥락**:\n"
        
        for msg in recent_messages:
            role_emoji = "👤" if msg.role == "user" else "🤖"
            history_text += f"- {role_emoji} {msg.content[:100]}{'...' if len(msg.content) > 100 else ''}\n"
        
        return history_text
    
    def _build_safety_context(self, message: str) -> str:
        """안전성 체크 컨텍스트"""
        emergency_detected = any(
            keyword in message.lower() 
            for keyword in self.safety_guidelines["emergency_keywords"]
        )
        
        professional_needed = any(
            keyword in message.lower()
            for keyword in self.safety_guidelines["professional_referral_keywords"] 
        )
        
        if emergency_detected:
            return """
🚨 **응급상황 감지**: 자해/자살 위험 신호가 감지되었습니다.
- 즉시 전문기관 안내 필수
- 따뜻한 지지와 함께 구체적인 도움처 제공
- EFT 기법보다는 안전 확보 우선
"""
        elif professional_needed:
            return """
⚠️ **전문가 상담 권장**: 전문적 치료가 필요한 증상이 언급되었습니다.
- 전문가 상담 권유
- EFT는 보조적 도구로만 활용
- 의학적 진단/처방 절대 금지
"""
        else:
            return "✅ **안전성 체크**: 일반적인 상담 진행 가능"
    
    def _build_eft_context(self, emotion: EmotionAnalysis) -> str:
        """EFT 기법 컨텍스트 생성"""
        techniques = self.eft_technique_database.get(emotion.primary_emotion, [])
        
        if not techniques:
            return "⚡ **EFT 추천**: 기본 감정 조절 기법 적용"
        
        best_technique = max(techniques, key=lambda x: x["effectiveness"])
        
        context = f"""
⚡ **추천 EFT 기법**: {best_technique["name"]}
- 탭핑 포인트: {', '.join([point.value for point in best_technique["points"]])}
- 셋업 구문: "{best_technique["setup_phrase"]}"
- 리마인더: "{best_technique["reminder"]}"
- 예상 소요시간: {best_technique["duration"]}분
- 효과성: {best_technique["effectiveness"]:.0%}
"""
        return context
    
    def _build_culture_context(self, message: str) -> str:
        """한국 문화 컨텍스트 생성"""
        cultural_themes = []
        
        # 가족 관련
        family_keywords = ["부모", "엄마", "아빠", "가족", "형제", "자매", "시댁", "처가"]
        if any(keyword in message for keyword in family_keywords):
            cultural_themes.append("family_dynamics")
        
        # 직장 관련
        work_keywords = ["회사", "직장", "상사", "동료", "업무", "야근", "승진", "면접"]
        if any(keyword in message for keyword in work_keywords):
            cultural_themes.append("work_culture")
        
        # 사회적 압박
        social_keywords = ["결혼", "연애", "학벌", "스펙", "취업", "비교", "남들"]
        if any(keyword in message for keyword in social_keywords):
            cultural_themes.append("social_pressure")
        
        if not cultural_themes:
            return ""
        
        context = "🇰🇷 **한국 문화 고려사항**:\n"
        for theme in cultural_themes:
            theme_info = self.korean_culture_context[theme]
            context += f"- {theme_info['description']}\n"
        
        return context
    
    def _build_style_guide(self, style: PromptStyle, emotion: EmotionAnalysis) -> str:
        """응답 스타일 가이드 생성"""
        
        templates = self.emotion_response_templates.get(emotion.primary_emotion, {})
        
        base_guide = f"""
🎨 **응답 스타일 가이드**: {style.value}
"""
        
        if templates:
            validation = templates.get("validation", "")
            exploration = templates.get("exploration", "")
            transition = templates.get("transition", "")
            
            base_guide += f"""
1. **감정 검증**: {validation}
2. **탐색 질문**: {exploration}  
3. **EFT 연결**: {transition}
"""
        
        return base_guide
    
    def recommend_eft_techniques(self, emotion_state: EmotionAnalysis) -> List[EFTRecommendation]:
        """감정 상태 기반 EFT 기법 추천"""
        
        techniques = self.eft_technique_database.get(emotion_state.primary_emotion, [])
        recommendations = []
        
        for tech in techniques:
            recommendation = EFTRecommendation(
                technique_name=tech["name"],
                tapping_points=tech["points"],
                setup_phrase=tech["setup_phrase"],
                reminder_phrase=tech["reminder"],
                duration_minutes=tech["duration"],
                difficulty_level="beginner",  # 기본값
                effectiveness_score=tech["effectiveness"],
                additional_notes=f"{emotion_state.primary_emotion.value} 감정에 특화된 기법입니다."
            )
            recommendations.append(recommendation)
        
        # 효과성 순으로 정렬
        recommendations.sort(key=lambda x: x.effectiveness_score, reverse=True)
        
        return recommendations[:3]  # 상위 3개만 반환
    
    def _get_tier_system_prompt(self, tier: str) -> str:
        """티어별 시스템 프롬프트 생성"""
        base_prompt = self.base_system_prompt
        
        if tier == "premium":
            premium_addition = """
💎 **프리미엄 상담 모드**:
- 더 깊이 있는 감정 분석과 개인화된 접근
- 고급 EFT 기법 및 복합적 접근법 활용  
- 장기적 관점에서의 심리적 성장 지원
- 개인별 패턴 분석을 통한 맞춤형 전략 제공
- 보다 전문적이고 상세한 상담 제공
"""
            return base_prompt + premium_addition
        elif tier == "enterprise":
            enterprise_addition = """
🏢 **엔터프라이즈 상담 모드**:
- 최고급 심리 분석 및 치료적 접근
- 다차원적 감정 분석 및 통합적 치유 방법
- 조직 및 단체를 위한 특화된 상담 기법
- 무제한 깊이의 대화 및 지속적 추적 관리
- 전문 심리상담사 수준의 고도화된 서비스
"""
            return base_prompt + enterprise_addition
        
        return base_prompt  # 무료 티어는 기본 프롬프트
    
    def _build_tier_guide(self, tier: str) -> str:
        """티어별 응답 가이드 생성"""
        if tier == "premium":
            return """
💎 **프리미엄 서비스 특징**:
- 보다 상세하고 구체적인 분석 제공
- 개인화된 EFT 기법 조합 추천
- 심층적인 감정 탐구 및 패턴 분석
- 단계적 치유 계획 수립
"""
        elif tier == "enterprise":
            return """
🏢 **엔터프라이즈 서비스 특징**:
- 최고 수준의 전문적 분석
- 다각도 치료 접근법 통합
- 장기적 심리 건강 관리 방안
- 조직/단체 맞춤 솔루션 제공
"""
        
        return """
🆓 **무료 서비스 특징**:
- 기본적인 감정 지지 및 공감
- 표준 EFT 기법 안내
- 간단하고 실용적인 조언
"""
    
    def _get_tier_response_length(self, tier: str) -> str:
        """티어별 응답 길이 가이드"""
        if tier == "premium":
            return "400-800자"
        elif tier == "enterprise":
            return "800-1200자"
        else:
            return "200-400자"  # 무료 티어
    
    def post_process_response(
        self, 
        ai_response: str, 
        emotion_analysis: EmotionAnalysis,
        tier: str = "free"
    ) -> Dict[str, Any]:
        """AI 응답 후처리"""
        
        # 1. 응답 정제
        cleaned_response = self._clean_ai_response(ai_response)
        
        # 2. EFT 추천 생성
        eft_recommendations = self.recommend_eft_techniques(emotion_analysis)
        
        # 3. 제안 액션 생성
        suggested_actions = self._generate_suggested_actions(emotion_analysis)
        
        # 4. 신뢰도 계산
        confidence = self._calculate_response_confidence(cleaned_response, emotion_analysis)
        
        return {
            "text": cleaned_response,
            "eft_recommendations": eft_recommendations,
            "suggested_actions": suggested_actions,
            "confidence": confidence
        }
    
    def _clean_ai_response(self, response: str) -> str:
        """AI 응답 정제"""
        
        # 불필요한 prefix 제거
        prefixes_to_remove = [
            "EFT 전문 상담사로서 말씀드리면,",
            "상담사:",
            "Assistant:",
            "AI:"
        ]
        
        cleaned = response
        for prefix in prefixes_to_remove:
            cleaned = cleaned.replace(prefix, "").strip()
        
        # 길이 제한 (너무 긴 응답 방지)
        if len(cleaned) > 800:
            sentences = cleaned.split('. ')
            cleaned = '. '.join(sentences[:4]) + '.'
        
        return cleaned
    
    def _generate_suggested_actions(self, emotion: EmotionAnalysis) -> List[SuggestedAction]:
        """제안 액션 생성"""
        
        actions = []
        
        # 감정별 맞춤 액션
        if emotion.primary_emotion in [EmotionType.STRESS, EmotionType.ANXIETY]:
            actions.append(SuggestedAction(
                action_type="breathing",
                title="심호흡 연습하기",
                description="5분간 깊은 호흡으로 마음을 진정시켜보세요",
                priority="high",
                estimated_time_minutes=5
            ))
        
        # EFT 세션 제안
        actions.append(SuggestedAction(
            action_type="eft_session",
            title="EFT 탭핑 세션 시작",
            description=f"{emotion.primary_emotion.value} 감정을 위한 맞춤 EFT 기법",
            priority="medium",
            estimated_time_minutes=10
        ))
        
        # 높은 강도일 때 전문가 상담 권유
        if emotion.intensity > 0.8:
            actions.append(SuggestedAction(
                action_type="professional_help", 
                title="전문가 상담 고려하기",
                description="감정 강도가 높아 전문가의 도움이 필요할 수 있습니다",
                priority="high",
                estimated_time_minutes=60
            ))
        
        return actions
    
    def _calculate_response_confidence(
        self, 
        response: str, 
        emotion: EmotionAnalysis
    ) -> float:
        """응답 신뢰도 계산"""
        
        confidence_score = 0.7  # 기본 점수
        
        # 응답 길이 체크
        if 50 <= len(response) <= 400:
            confidence_score += 0.1
        
        # 감정 분석 신뢰도 반영
        confidence_score += emotion.confidence * 0.2
        
        # 최대 1.0으로 제한
        return min(confidence_score, 1.0)