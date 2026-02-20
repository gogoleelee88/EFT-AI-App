"""
EFT ?�문 ?�롬?�트 관�??�스???�리?�담 �?EFT 기법???�화???�롬?�트 ?�성 �?관�?"""

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
    """?�롬?�트 ?��????�??""
    EMPATHETIC = "empathetic"  # 공감??    DIRECT = "direct"          # 직접?? 
    GENTLE = "gentle"          # 부?�러??    PROFESSIONAL = "professional"  # ?�문??    CASUAL = "casual"          # 친근??
class EFTPromptManager:
    """EFT ?�문 ?�롬?�트 관리자"""
    #==========?�거 ?�석?��??�정?�요 ?�시조치???�후 공개 API ?�정??+ ?�출부 마이그레?�션�?교체 ?�요========
    def get_system_prompt(self, *args, **kwargs):
        """
        Backward-compat shim for legacy callers.
        기존 ?�출부??get_system_prompt(...)�???구조�??�결?�다.
        - tier ?�자가 ?�어?�면 ?�용, ?�으�?self.default_tier ?�는 'free'
        - ?��? 구현??_get_tier_system_prompt(tier)�??�임
        """
        tier = kwargs.get("tier", None)
        if tier is None:
            tier = getattr(self, "default_tier", "free")

        if hasattr(self, "_get_tier_system_prompt") and callable(self._get_tier_system_prompt):
            try:
                return self._get_tier_system_prompt(tier)
            except TypeError:
                return self._get_tier_system_prompt()

        # 최후???�전?�치
        return "You are MoodTalk EFT assistant. Keep responses concise and safe."
    #==========?�거 ?�석?��??�정?�요 ?�시조치??=======
    
    def __init__(self):
        """EFT ?�롬?�트 매니?� 초기??""
        self.base_system_prompt = self._load_base_system_prompt()
        self.emotion_response_templates = self._load_emotion_templates()
        self.eft_technique_database = self._load_eft_techniques()
        self.korean_culture_context = self._load_korean_context()
        self.safety_guidelines = self._load_safety_guidelines()
        
        logger.info("??EFT ?�롬?�트 매니?� 초기???�료")
    
    def _load_base_system_prompt(self) -> str:
        """기본 ?�스???�롬?�트 로드 - 5?�계 Intake + Record + Action ?�스??""
        return """
?�신?� EFT(감정?�유기법) �??�흡 명상 ?�문 ?�담?�입?�다. ?�음 ?�칙??반드???�라주세??

?�� **?�심 ??��**:
- ?�뜻?�고 공감?�인 ?�리??지지 ?�공
- ?�용?�의 감정???�확???�악?�고 검�?- EFT/?�흡 명상 기법???�용???�질?�인 ?��? ?�공
- ?�국 문화?� ?�서??맞는 ?�담 진행

?�� **?�담 ?��???*:
- 비판?�적?�고 ?�용?�인 ?�세
- ?�용?�의 감정??무효?�하지 ?�음
- 구체?�이�??�행 가?�한 조언 ?�공
- ?�문?�이면서??친근???�투 ?�용

?�� **?�전 규칙**:
- ?�해/?�살 ?�험 ?�호 감�? ??즉시 ?�문기�? ?�내
- ?�학??진단?�나 처방?� ?��? ?��? ?�음
- 과호???��???보고 ??"1�??�정???�흡 권유"�?(?�행 X)
- ?�용?�의 ?�생?�과 비�? 보장

?�� **5?�계 Intake + Record + Action ?�스??*

?�신?� 5?�계 구조?�된 ?�담 ?�로?�스�??�릅?�다:

**S1 (공감·?�포)**: 감정 ?�현 ?�용, ?�뜻???��?
**S2 (Intake)**: 8가지 ?�보 ?�집 (감각/?�호/?�간?�유/금기)
**S3 (SUDS)**: 0~10 불편�??�인
**S4 (분기 결정)**: EFT ?�는 ?�흡 ?�택 + 근거 ?�시
**S5 (?�반 ?�??**: ?�션 ?�행?� ?�론?��? ?�당, AI???�?�로 복�?

---

?�� **출력 규칙 (CRITICAL)**:

1. **S2 ?�료 ?�점**: Intake JSON??**??1?�만** 출력
2. **S4 분기 ?�점**: ?�음 **??개의 JSON**??반드??출력:
   - ??**NOTION_RECORD_JSON**: ?�션 기록??(?�체 ?�션 ?�보)
   - ??**UI_ACTION_JSON**: ?�론?�엔???�우?�용 (간단)
3. **???�락 금�?**: 모르�?"미상" ?�력
4. **SUDS_before**: 0~10 ?�수 (UI Action??`suds`?� ?�일 �?

---

?�� **Intake JSON (S2 직후 1??**:
```json
{
  "emotion_primary": "�?감정",
  "trigger": "촉발 ?�황/?�건",
  "thought_pattern": "반복???�고",
  "body_signals": "?�체 ?�호",
  "behavior_response": "?�동 ?�턴",
  "context_detail": "?�세 맥락",
  "SUDS_before": 0,
  "preferred_modality": "EFT|BREATH|미상",
  "contraindications": "과호??경향/?��???미상"
}
```

?�� **NOTION_RECORD_JSON (S4 ?�점)**:
```json
{
  "emotion_primary": "...",
  "trigger": "...",
  "thought_pattern": "...",
  "body_signals": "...",
  "behavior_response": "...",
  "context_detail": "...",
  "SUDS_before": 0,
  "preferred_modality": "EFT|BREATH|미상",
  "plan_modality": "EFT|BREATH",
  "rationale": "분기 결정 근거",
  "session_notes": "?�션 ?�행?� ?�론?�에??진행",
  "cbt_action_steps": ["?�계1", "?�계2", "?�계3"],
  "user_feedback": "?�션 ???�낌/메모",
  "timestamp_start": "미상",
  "timestamp_end": "미상",
  "duration": 0
}
```

?�� **UI_ACTION_JSON (S4 ?�점)**:
```json
// EFT 분기
{
  "action": "start_eftar",
  "route": "/eftar",
  "suds": 0,
  "rationale": "?�정 ?�념/?�건??감정 고정"
}

// ?�흡 분기
{
  "action": "start_breath_page",
  "route": "/tri-modal",
  "suds": 0,
  "rationale": "?�간 ?�약 5�??�내 ?�는 ?�체 각성/막연 불안"
}
```

---

?�� **분기 ?�책**:

**EFT ?�택** (`start_eftar`):
- ?�정 ?�면/?�람/?�고/?�념???�렷??- ?�구조화 ?��?가 ?�음
- ?�간 ?�유 10�??�상

**?�흡 ?�택** (`start_breath_page`):
- 막연??불안·?�체 긴장
- 빠른 진정 ?�요
- **?�간 ?�약: "5�??�내", "지�?급함", "빨리" ?�급 ??무조�??�흡**
- ?�호가 명확?�면 ?�호 ?�선

**?�간 기�? (CRITICAL)**:
- "?�간 ?�다/5분만 ?�다/급함" ??**무조�??�흡 분기**
- `rationale`???�간 근거 명시 (?? "5�??�내 진정 ?�요")

---

?�� **질문 가?�드 (S2 Intake)**:
- "�?감정??커진 계기가 ?�나 ?�다�?뭐�??�까??"
- "몸에?�는 ?�떤 ?�호가 ?�껴?�요?"
- "지금�? 빠르�?진정?�고 ?�으?�요, ?�니�?�??�각???�뤄보고 ?�으?�요?"
- "지�?불편감�? 0~10 �?�??�일까요?"
- "?�간?� ?�느 ?�도 가?�하?�요? 5�??�도 괜찮?�까??"

---

??**?�바�?출력 ?�시**:

**?�시 1 - S1 (공감·?�포)**:
```
?�사가 ?��? 무시?�서 ?��? ?�신?�니, ?�말 ?�드?�겠?�요.
직장?�서 그런 감정???�끼??�??�무 ?�울?�고 ?�답???�이?�요.
```

**?�시 2 - S2 (Intake ?�료 ??JSON 1??출력)**:
```
�??�황?�서 ?�떤 ?�각??반복?�셨?�요? 몸에?�는 ?�떤 ?�호가 ?�껴지?�어??
?�간?� ?�느 ?�도 가?�하?�요?

[S2 ?�료 ???�동 출력]
{
  "emotion_primary": "분노",
  "trigger": "?�사??무시",
  "thought_pattern": "?�는 ?�정받�? 못한??,
  "body_signals": "가???�답?? 주먹 쥐어�?,
  "behavior_response": "?�피, �?줄임",
  "context_detail": "?�의 �??�견 무시??,
  "SUDS_before": 8,
  "preferred_modality": "미상",
  "contraindications": "미상"
}
```

**?�시 3 - S3 (SUDS ?�인)**:
```
지�?�?불편감이 0~10 �?�????�도?�까??
0?� ?��? 불편?��? ?�음, 10?� 매우 ?�함?�니??
```

**?�시 4A - S4 (EFT 분기 - ??�?JSON 출력)**:
```
8?�이?�군?? ?�사?�??관계에??"?�는 ?�정받�? 못한?????�념???�리?�고 ?�네??
?�럴 ?�는 EFT ??��?�로 �??�념???�루??�??�과?�일 �?같아??

[NOTION_RECORD_JSON]
{
  "emotion_primary": "분노",
  "trigger": "?�사??무시",
  "thought_pattern": "?�는 ?�정받�? 못한??,
  "body_signals": "가???�답??,
  "behavior_response": "?�피",
  "context_detail": "?�의 �??�견 무시",
  "SUDS_before": 8,
  "preferred_modality": "미상",
  "plan_modality": "EFT",
  "rationale": "?�정 ?�념 고정 - ?�사 관�??�구조화 ?�요",
  "session_notes": "?�션 ?�행?� ?�론?�에??진행",
  "cbt_action_steps": ["??�� ?�인???�인", "?�업 구문 반복", "SUDS ?�측??],
  "user_feedback": "미상",
  "timestamp_start": "미상",
  "timestamp_end": "미상",
  "duration": 0
}

[UI_ACTION_JSON]
{
  "action": "start_eftar",
  "route": "/eftar",
  "suds": 8,
  "rationale": "?�정 ?�념 고정 - ?�사 관�??�구조화 ?�요"
}
```

**?�시 4B - S4 (?�흡 분기 - ?�간 ?�약)**:
```
7?�이?�군?? 5�??�에 진정?�야 ?�신?�니, 빠른 ?�흡 명상???��?????거예??
지�?바로 ?�작?�볼게요.

[NOTION_RECORD_JSON]
{
  "emotion_primary": "불안",
  "trigger": "미상",
  "thought_pattern": "미상",
  "body_signals": "가???�근거림",
  "behavior_response": "미상",
  "context_detail": "급한 ?�황",
  "SUDS_before": 7,
  "preferred_modality": "미상",
  "plan_modality": "BREATH",
  "rationale": "?�간 ?�약 5�??�내 + 즉각 진정 ?�요",
  "session_notes": "?�션 ?�행?� ?�론?�에??진행",
  "cbt_action_steps": ["3�??�숨", "3�?멈춤", "6�??�숨"],
  "user_feedback": "미상",
  "timestamp_start": "미상",
  "timestamp_end": "미상",
  "duration": 0
}

[UI_ACTION_JSON]
{
  "action": "start_breath_page",
  "route": "/tri-modal",
  "suds": 7,
  "rationale": "?�간 ?�약 5�??�내 + 즉각 진정 ?�요"
}
```

**?�시 5 - S5 (?�반 ?�??복�?)**:
```
?�션???�료?�셨군요! ?�떠?�나??
불편감이 조금 줄어?�었?�면 ?�행?�에??
```

---

??**금�? ?�항**:

- S2 ?�점??Intake JSON???�러 �?출력
- S4 ?�점??JSON ??�?�??�나�?출력 (반드??NOTION + UI 모두)
- JSON ???�락 (모르�?"미상" ?�력)
- JSON ?�뒤 마크?�운 코드블록 (```)
- ?�용?��? ?��? action type
- SUDS_before?� UI Action??suds �?불일�?
**중요**:
- S2 ?�료 ??Intake JSON **1?�만**
- S4 분기 ??NOTION_RECORD_JSON + UI_ACTION_JSON **??�?모두**
- ?�간 ?�약 ?�급 ??**무조�??�흡 분기**
"""

    def _load_emotion_templates(self) -> Dict[EmotionType, Dict[str, str]]:
        """감정�??�답 ?�플�?로드"""
        return {
            EmotionType.STRESS: {
                "validation": "?�말 많�? ?�트?�스�?받고 계시?�군?? ?�자 감당?�기 ?�려?�셨겠어??",
                "exploration": "?�떤 ?�황???�히 ?�트?�스�?주고 ?�나?? 구체?�으�?말�???주시�??�께 ?�결 방법??찾아보아??",
                "transition": "?�트?�스�?줄이?????��????�는 EFT 기법???�께 ?�보?�는 �??�떨까요?"
            },
            EmotionType.ANXIETY: {
                "validation": "불안??마음???�말 ?�드?�겠?�요. 그런 감정???�는 것이 ?�연?�요.",
                "exploration": "무엇??가??걱정?�시?�요? 불안???�인???�께 찾아보면??마음???�래보아??",
                "transition": "불안감을 진정?�키????�� 기법???��?????�?같아??"
            },
            EmotionType.SADNESS: {
                "validation": "마음??많이 ?�프?�군?? ?�픈 마음???�끼??것도 ?�중??감정?�에??",
                "exploration": "?�런 ?�픔???�제부???�작?�었?�요? ?�자 간직?��? 마시�??�께 ?�누??보아??",
                "transition": "마음???�픔??치유?�는 EFT 방법???�내???�릴게요."
            },
            EmotionType.ANGER: {
                "validation": "?��? ?�시??것이 충분???�해?�요. 분노???�연?�러??감정?�니??",
                "exploration": "?�떤 ?�로 ?�해 ?�렇�??��? ?�셨?�요? ?�울??마음???�어볼게??",
                "transition": "분노�?건강?�게 ?�소?????�는 ??�� 방법???�어??"
            },
            EmotionType.LONELINESS: {
                "validation": "?�로??마음??많이 ?�드?�겠?�요. ?�자?�는 ?�낌???�마??괴로?��? ?�해?�요.",
                "exploration": "?�제부???�런 ?�로?�???�끼?�나?? 지�????�간, ?�?� ?�께 ?�다??것을 ?�껴보세??",
                "transition": "?�로?�???�래주는 ?�뜻???�기 치유법을 ?�께 ?�보?�요."
            },
            EmotionType.FRUSTRATION: {
                "validation": "?�답?�고 막막??마음???�말 ?�드?�겠?�요. 그런 감정???�는 것이 ?�연?�러?�요.",
                "exploration": "무엇??가???�답?�게 ?�껴지?�나?? 구체?�인 ?�황???�께 ?�펴보아??",
                "transition": "막힌 감정???�?�주??EFT 기법???��?????거예??"
            }
        }
    
    def _load_eft_techniques(self) -> Dict[EmotionType, List[Dict[str, Any]]]:
        """감정�?EFT 기법 ?�이?�베?�스"""
        return {
            EmotionType.STRESS: [
                {
                    "name": "?�트?�스 ?�소 기본 ?�퀀??,
                    "points": [EFTPoint.CROWN, EFTPoint.EYEBROW, EFTPoint.COLLARBONE],
                    "setup_phrase": "?�런 ?�트?�스가 ?��?�? ?�는 ???�신??깊이 ?�랑?�고 받아?�입?�다",
                    "reminder": "???�트?�스�??�아보내??,
                    "duration": 5,
                    "effectiveness": 0.85
                },
                {
                    "name": "직장 ?�트?�스 ?�용 기법",
                    "points": [EFTPoint.SIDE_OF_EYE, EFTPoint.UNDER_NOSE, EFTPoint.CHIN],
                    "setup_phrase": "직장?�서???�박감이 ?��?�? ?�는 ?�온???�택?�니??,
                    "reminder": "직장 ?�트?�스�??�소?�요",
                    "duration": 7,
                    "effectiveness": 0.82
                }
            ],
            EmotionType.ANXIETY: [
                {
                    "name": "불안 진정 ?�퀀??,
                    "points": [EFTPoint.EYEBROW, EFTPoint.UNDER_EYE, EFTPoint.UNDER_NOSE],
                    "setup_phrase": "불안??마음???��?�? ?�는 지�????�간 ?�전?�니??,
                    "reminder": "불안???�려?�아??,
                    "duration": 6,
                    "effectiveness": 0.88
                }
            ],
            EmotionType.ANGER: [
                {
                    "name": "분노 조절 기법",
                    "points": [EFTPoint.SIDE_OF_EYE, EFTPoint.COLLARBONE, EFTPoint.UNDER_ARM],
                    "setup_phrase": "?�런 ?��? ?��?�? ?�는 ?�화�??�택?�니??,
                    "reminder": "분노�?건강?�게 ?�소?�요",
                    "duration": 8,
                    "effectiveness": 0.83
                }
            ]
        }
    
    def _load_korean_context(self) -> Dict[str, Any]:
        """?�국 문화 맥락 ?�보"""
        return {
            "family_dynamics": {
                "description": "?�국?� 가�?중심 ?�회�?가�?관계�? 개인 ?�체?�에 ???�향",
                "considerations": ["?�도 ?�무�?, "가�?기�? 부??, "?��? 갈등", "?�제 ?�열"]
            },
            "work_culture": {
                "description": "집단주의??직장 문화?� ?�계 관�?,
                "considerations": ["?�하 관�?, "?�근 문화", "?�료 관�?, "?�과 ?�박"]
            },
            "emotional_expression": {
                "description": "감정 ?�현???�??문화???�약",
                "considerations": ["체면 중시", "?�내??미덕??, "집단 조화", "감정 ?�제"]
            },
            "social_pressure": {
                "description": "?�회??기�??� 비교 문화",
                "considerations": ["?�력 중시", "결혼 ?�박", "경제???�취", "?�모 관??]
            }
        }
    
    def _load_safety_guidelines(self) -> Dict[str, List[str]]:
        """?�전 가?�드?�인"""
        return {
            "emergency_keywords": [
                "죽고??, "?�살", "?�해", "?�상???�나�?, "모든 것을 ?�내�?,
                "?�치고싶", "죽이고싶", "복수", "?�인"
            ],
            "professional_referral_keywords": [
                "?�청", "?�각", "조현�?, "?�극??, "?�울�?, "공황?�애",
                "강박", "?�상", "?�라?�마", "중독", "거식�?, "??���?
            ],
            "crisis_resources": [
                "?�명?�전?? 1588-9191",
                "�?��???�담?�화: 1388", 
                "?�신건강 ?�기?�담: 1577-0199",
                "경찰�??�고?�터: 112"
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
        """EFT ?�문 ?�롬?�트 ?�성"""
        
        # 1. ?�스???�롬?�트 (?�어�?차별??
        system_section = self._get_tier_system_prompt(tier)
        
        # 2. ?�용???�로??맥락 추�?
        profile_context = self._build_profile_context(user_profile)
        
        # 3. 감정 분석 맥락 추�?
        emotion_context = self._build_emotion_context(emotion_state)
        
        # 4. ?�???�스?�리 맥락
        history_context = self._build_history_context(conversation_history)
        
        # 5. ?�전??체크
        safety_context = self._build_safety_context(user_message)
        
        # 6. EFT 기법 컨텍?�트
        eft_context = self._build_eft_context(emotion_state)
        
        # 7. ?�국 문화 컨텍?�트
        culture_context = self._build_culture_context(user_message)
        
        # 8. ?�답 ?��???가?�드
        style_guide = self._build_style_guide(style, emotion_state)
        
        # 9. ?�어�??�답 가?�드
        tier_guide = self._build_tier_guide(tier)
        
        # 최종 ?�롬?�트 조합
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

?�� **?�용??메시지**: "{user_message}"

?�� **5?�계 ?�로?�스 ?�답 지�?*:

**?�재 ?�계 ?�인**:
- S1: 감정 ?�현 ?�음, Intake 미완�???공감·?�포
- S2: ?�보 ?�집 �???Intake 질문 + JSON 1??출력
- S3: Intake ?�료, SUDS 미확????SUDS 질문
- S4: SUDS ?�인 ?�료 ??분기 결정 + ??JSON 출력
- S5: ?�션 ?�작?????�반 ?�??
**S2 ?�료 ??(??1??**:
- Intake JSON 출력 (모든 ???�함, 모르�?"미상")
- ?�연?�러???�??+ JSON ?�식 준??
**S4 분기 ??(반드????�?**:
- ??NOTION_RECORD_JSON (?�체 ?�보)
- ??UI_ACTION_JSON (?�우?�용)
- ?�간 ?�약 ?�급 ??**무조�??�흡 분기**

**?�답 ?��???*:
- ?�용?�의 마�?�?발화�?기반?�로 ?�연?�럽�?공감
- 기법 즉시 강요 금�?, ?�진???�안
- ?�??맥락 반영: ?? "?�이 ???�?? ??"?�이 ???�???�드?�군??
- 반복 문구 ?�거: "?�께 ?�야기해봐요" 매번 ?�용 금�?
- ?�스??지�?분석/?�그 출력 ?��? 금�?
- ?�국 문화 맥락: 체면/?�치??관�?중심 ?�휘
- {self._get_tier_response_length(tier)} ?? ?�연?�러??문단

?�️ **CRITICAL 출력 규칙**:
1. S2: Intake JSON **1?�만**
2. S4: NOTION_RECORD_JSON + UI_ACTION_JSON **??�?모두**
3. ???�락 금�? (모르�?"미상")
4. SUDS_before = UI Action??suds (?�일 �?
5. ?�간 ?�약 ("5�?, "급함") ??무조�?`action: "start_breath_page"`

**S4 분기 ?�시**:
```
[?�연?�러???�답]

[NOTION_RECORD_JSON]
{{모든 ???�함}}

[UI_ACTION_JSON]
{{"action":"start_eftar"|"start_breath_page","route":"/eftar"|"/tri-modal","suds":0-10,"rationale":"..."}}
```
"""
        
        return full_prompt.strip()
    
    def _build_profile_context(self, profile: UserProfile) -> str:
        """?�용???�로??컨텍?�트 ?�성"""
        if not profile:
            return ""
        
        context = f"""
?�� **?�용???�로??*:
- EFT 경험 ?��?: {profile.eft_experience_level}
- ?�통 ?��??? {profile.communication_style}
- 감정 민감?? {profile.emotional_sensitivity:.1f}/1.0
- ?�전 ?�션: {profile.previous_sessions}??"""
        return context
    
    def _build_emotion_context(self, emotion: EmotionAnalysis) -> str:
        """감정 분석 컨텍?�트 ?�성"""
        context = f"""
?�� **감정 분석 결과**:
- 주요 감정: {emotion.primary_emotion.value} (강도: {emotion.intensity:.2f})
- 보조 감정: {emotion.secondary_emotion.value if emotion.secondary_emotion else "?�음"}
- 분석 ?�뢰?? {emotion.confidence:.2f}
- 감정 ?�워?? {', '.join(emotion.emotional_keywords)}
"""
        return context
    
    def _build_history_context(self, history: List[ConversationMessage]) -> str:
        """?�???�스?�리 컨텍?�트 ?�성"""
        if not history or len(history) == 0:
            return "?�� **?�???�스?�리**: �??�?�입?�다."
        
        recent_messages = history[-3:]  # 최근 3�?메시지�?        history_text = "?�� **최근 ?�??맥락**:\n"
        
        for msg in recent_messages:
            role_emoji = "?��" if msg.role == "user" else "?��"
            history_text += f"- {role_emoji} {msg.content[:100]}{'...' if len(msg.content) > 100 else ''}\n"
        
        return history_text
    
    def _build_safety_context(self, message: str) -> str:
        """?�전??체크 컨텍?�트"""
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
?�� **?�급?�황 감�?**: ?�해/?�살 ?�험 ?�호가 감�??�었?�니??
- 즉시 ?�문기�? ?�내 ?�수
- ?�뜻??지지?� ?�께 구체?�인 ?��?�??�공
- EFT 기법보다???�전 ?�보 ?�선
"""
        elif professional_needed:
            return """
?�️ **?�문가 ?�담 권장**: ?�문??치료가 ?�요??증상???�급?�었?�니??
- ?�문가 ?�담 권유
- EFT??보조???�구로만 ?�용
- ?�학??진단/처방 ?��? 금�?
"""
        else:
            return "??**?�전??체크**: ?�반?�인 ?�담 진행 가??
    
    def _build_eft_context(self, emotion: EmotionAnalysis) -> str:
        """EFT 기법 컨텍?�트 ?�성"""
        techniques = self.eft_technique_database.get(emotion.primary_emotion, [])
        
        if not techniques:
            return "??**EFT 추천**: 기본 감정 조절 기법 ?�용"
        
        best_technique = max(techniques, key=lambda x: x["effectiveness"])
        
        context = f"""
??**추천 EFT 기법**: {best_technique["name"]}
- ??�� ?�인?? {', '.join([point.value for point in best_technique["points"]])}
- ?�업 구문: "{best_technique["setup_phrase"]}"
- 리마?�더: "{best_technique["reminder"]}"
- ?�상 ?�요?�간: {best_technique["duration"]}�?- ?�과?? {best_technique["effectiveness"]:.0%}
"""
        return context
    
    def _build_culture_context(self, message: str) -> str:
        """?�국 문화 컨텍?�트 ?�성"""
        cultural_themes = []
        
        # 가�?관??        family_keywords = ["부�?, "?�마", "?�빠", "가�?, "?�제", "?�매", "?�댁", "처�?"]
        if any(keyword in message for keyword in family_keywords):
            cultural_themes.append("family_dynamics")
        
        # 직장 관??        work_keywords = ["?�사", "직장", "?�사", "?�료", "?�무", "?�근", "?�진", "면접"]
        if any(keyword in message for keyword in work_keywords):
            cultural_themes.append("work_culture")
        
        # ?�회???�박
        social_keywords = ["결혼", "?�애", "?�벌", "?�펙", "취업", "비교", "?�들"]
        if any(keyword in message for keyword in social_keywords):
            cultural_themes.append("social_pressure")
        
        if not cultural_themes:
            return ""
        
        context = "?��?�� **?�국 문화 고려?�항**:\n"
        for theme in cultural_themes:
            theme_info = self.korean_culture_context[theme]
            context += f"- {theme_info['description']}\n"
        
        return context
    
    def _build_style_guide(self, style: PromptStyle, emotion: EmotionAnalysis) -> str:
        """?�답 ?��???가?�드 ?�성"""
        
        templates = self.emotion_response_templates.get(emotion.primary_emotion, {})
        
        base_guide = f"""
?�� **?�답 ?��???가?�드**: {style.value}
"""
        
        if templates:
            validation = templates.get("validation", "")
            exploration = templates.get("exploration", "")
            transition = templates.get("transition", "")
            
            base_guide += f"""
1. **감정 검�?*: {validation}
2. **?�색 질문**: {exploration}  
3. **EFT ?�결**: {transition}
"""
        
        return base_guide
    
    def recommend_eft_techniques(self, emotion_state: EmotionAnalysis) -> List[EFTRecommendation]:
        """감정 ?�태 기반 EFT 기법 추천"""
        
        techniques = self.eft_technique_database.get(emotion_state.primary_emotion, [])
        recommendations = []
        
        for tech in techniques:
            recommendation = EFTRecommendation(
                technique_name=tech["name"],
                tapping_points=tech["points"],
                setup_phrase=tech["setup_phrase"],
                reminder_phrase=tech["reminder"],
                duration_minutes=tech["duration"],
                difficulty_level="beginner",  # 기본�?                effectiveness_score=tech["effectiveness"],
                additional_notes=f"{emotion_state.primary_emotion.value} 감정???�화??기법?�니??"
            )
            recommendations.append(recommendation)
        
        # ?�과???�으�??�렬
        recommendations.sort(key=lambda x: x.effectiveness_score, reverse=True)
        
        return recommendations[:3]  # ?�위 3개만 반환
    
    def _get_tier_system_prompt(self, tier: str) -> str:
        """?�어�??�스???�롬?�트 ?�성"""
        base_prompt = self.base_system_prompt
        
        if tier == "premium":
            premium_addition = """
?�� **?�리미엄 ?�담 모드**:
- ??깊이 ?�는 감정 분석�?개인?�된 ?�근
- 고급 EFT 기법 �?복합???�근�??�용  
- ?�기??관?�에?�의 ?�리???�장 지??- 개인�??�턴 분석???�한 맞춤???�략 ?�공
- 보다 ?�문?�이�??�세???�담 ?�공
"""
            return base_prompt + premium_addition
        elif tier == "enterprise":
            enterprise_addition = """
?�� **?�터?�라?�즈 ?�담 모드**:
- 최고�??�리 분석 �?치료???�근
- ?�차?�적 감정 분석 �??�합??치유 방법
- 조직 �??�체�??�한 ?�화???�담 기법
- 무제??깊이???�??�?지?�적 추적 관�?- ?�문 ?�리?�담???��???고도?�된 ?�비??"""
            return base_prompt + enterprise_addition
        
        return base_prompt  # 무료 ?�어??기본 ?�롬?�트
    
    def _build_tier_guide(self, tier: str) -> str:
        """?�어�??�답 가?�드 ?�성"""
        if tier == "premium":
            return """
?�� **?�리미엄 ?�비???�징**:
- 보다 ?�세?�고 구체?�인 분석 ?�공
- 개인?�된 EFT 기법 조합 추천
- ?�층?�인 감정 ?�구 �??�턴 분석
- ?�계??치유 계획 ?�립
"""
        elif tier == "enterprise":
            return """
?�� **?�터?�라?�즈 ?�비???�징**:
- 최고 ?��????�문??분석
- ?�각??치료 ?�근�??�합
- ?�기???�리 건강 관�?방안
- 조직/?�체 맞춤 ?�루???�공
"""
        
        return """
?�� **무료 ?�비???�징**:
- 기본?�인 감정 지지 �?공감
- ?��? EFT 기법 ?�내
- 간단?�고 ?�용?�인 조언
"""
    
    def _get_tier_response_length(self, tier: str) -> str:
        """?�어�??�답 길이 가?�드"""
        if tier == "premium":
            return "400-800??
        elif tier == "enterprise":
            return "800-1200??
        else:
            return "200-400??  # 무료 ?�어
    
    def post_process_response(
        self, 
        ai_response: str, 
        emotion_analysis: EmotionAnalysis,
        tier: str = "free"
    ) -> Dict[str, Any]:
        """AI ?�답 ?�처�?""
        
        # 1. ?�답 ?�제
        cleaned_response = self._clean_ai_response(ai_response)
        
        # 2. EFT 추천 ?�성
        eft_recommendations = self.recommend_eft_techniques(emotion_analysis)
        
        # 3. ?�안 ?�션 ?�성
        suggested_actions = self._generate_suggested_actions(emotion_analysis)
        
        # 4. ?�뢰??계산
        confidence = self._calculate_response_confidence(cleaned_response, emotion_analysis)
        
        return {
            "text": cleaned_response,
            "eft_recommendations": eft_recommendations,
            "suggested_actions": suggested_actions,
            "confidence": confidence
        }
    
    def _clean_ai_response(self, response: str) -> str:
        """AI ?�답 ?�제"""
        
        # 불필?�한 prefix ?�거
        prefixes_to_remove = [
            "EFT ?�문 ?�담?�로??말�??�리�?",
            "?�담??",
            "Assistant:",
            "AI:"
        ]
        
        cleaned = response
        for prefix in prefixes_to_remove:
            cleaned = cleaned.replace(prefix, "").strip()
        
        # 길이 ?�한 (?�무 �??�답 방�?)
        if len(cleaned) > 800:
            sentences = cleaned.split('. ')
            cleaned = '. '.join(sentences[:4]) + '.'
        
        return cleaned
    
    def _generate_suggested_actions(self, emotion: EmotionAnalysis) -> List[SuggestedAction]:
        """?�안 ?�션 ?�성"""
        
        actions = []
        
        # 감정�?맞춤 ?�션
        if emotion.primary_emotion in [EmotionType.STRESS, EmotionType.ANXIETY]:
            actions.append(SuggestedAction(
                action_type="breathing",
                title="?�호???�습?�기",
                description="5분간 깊�? ?�흡?�로 마음??진정?�켜보세??,
                priority="high",
                estimated_time_minutes=5
            ))
        
        # EFT ?�션 ?�안
        actions.append(SuggestedAction(
            action_type="eft_session",
            title="EFT ??�� ?�션 ?�작",
            description=f"{emotion.primary_emotion.value} 감정???�한 맞춤 EFT 기법",
            priority="medium",
            estimated_time_minutes=10
        ))
        
        # ?��? 강도?????�문가 ?�담 권유
        if emotion.intensity > 0.8:
            actions.append(SuggestedAction(
                action_type="professional_help", 
                title="?�문가 ?�담 고려?�기",
                description="감정 강도가 ?�아 ?�문가???��????�요?????�습?�다",
                priority="high",
                estimated_time_minutes=60
            ))
        
        return actions
    
    def _calculate_response_confidence(
        self, 
        response: str, 
        emotion: EmotionAnalysis
    ) -> float:
        """?�답 ?�뢰??계산"""
        
        confidence_score = 0.7  # 기본 ?�수
        
        # ?�답 길이 체크
        if 50 <= len(response) <= 400:
            confidence_score += 0.1
        
        # 감정 분석 ?�뢰??반영
        confidence_score += emotion.confidence * 0.2
        
        # 최�? 1.0?�로 ?�한
        return min(confidence_score, 1.0)
