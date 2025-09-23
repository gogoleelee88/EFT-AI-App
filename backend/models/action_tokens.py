"""
AI 액션 토큰 시스템
AI가 대화 중 특정 액션을 실행할 수 있도록 하는 토큰 기반 시스템
"""

from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List, Union, Literal
from enum import Enum
import re
import json

class ActionTokenType(str, Enum):
    """지원되는 액션 토큰 타입"""
    ASK_SUDS = "ask_suds"
    RECOMMEND_EFT = "recommend_eft"
    SCHEDULE_FOLLOWUP = "schedule_followup"
    REQUEST_MOOD_CHECK = "request_mood_check"
    SUGGEST_BREATHING = "suggest_breathing"
    OFFER_RESOURCE = "offer_resource"

class SUDSMeasurementType(str, Enum):
    """SUDS 측정 타입"""
    PRE = "pre"     # EFT 세션 전
    POST = "post"   # EFT 세션 후
    CHECK = "check" # 일반 체크 (기본값)

class ActionToken(BaseModel):
    """기본 액션 토큰 모델"""
    type: ActionTokenType = Field(..., description="액션 타입")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="액션 파라미터")
    trigger_context: Optional[str] = Field(None, description="토큰 트리거 컨텍스트")
    priority: int = Field(1, ge=1, le=5, description="우선순위 (1=낮음, 5=높음)")

class AskSUDSToken(ActionToken):
    """SUDS 측정 요청 토큰"""
    type: Literal[ActionTokenType.ASK_SUDS] = ActionTokenType.ASK_SUDS
    measurement_type: SUDSMeasurementType = Field(..., description="측정 타입")
    prompt_message: str = Field(..., description="사용자에게 보여줄 프롬프트")
    context: Optional[str] = Field(None, description="측정 컨텍스트")

    class Config:
        json_schema_extra = {
            "example": {
                "type": "ask_suds",
                "measurement_type": "pre",
                "prompt_message": "EFT 세션을 시작하기 전에 현재 스트레스 수준을 측정해보겠습니다.",
                "context": "eft_session_start",
                "priority": 4
            }
        }

class RecommendEFTToken(ActionToken):
    """EFT 기법 추천 토큰"""
    type: Literal[ActionTokenType.RECOMMEND_EFT] = ActionTokenType.RECOMMEND_EFT
    technique: str = Field(..., description="추천 EFT 기법")
    reason: str = Field(..., description="추천 이유")
    difficulty: Literal["beginner", "intermediate", "advanced"] = Field("beginner", description="난이도")
    estimated_duration: int = Field(5, ge=1, le=60, description="예상 소요 시간 (분)")

    class Config:
        json_schema_extra = {
            "example": {
                "type": "recommend_eft",
                "technique": "basic_tapping",
                "reason": "스트레스 완화에 효과적입니다",
                "difficulty": "beginner",
                "estimated_duration": 10,
                "priority": 3
            }
        }

class TokenParser:
    """토큰 파싱 및 처리 클래스"""

    # 토큰 패턴 정의 (Non-greedy + 안정성 강화)
    TOKEN_PATTERNS = {
        ActionTokenType.ASK_SUDS: r'\[ask_suds\s*:\s*(\{.*?\})\]',
        ActionTokenType.RECOMMEND_EFT: r'\[recommend_eft\s*:\s*(\{.*?\})\]',
        ActionTokenType.SCHEDULE_FOLLOWUP: r'\[schedule_followup\s*:\s*(\{.*?\})\]',
        ActionTokenType.REQUEST_MOOD_CHECK: r'\[request_mood_check\s*:\s*(\{.*?\})\]',
        ActionTokenType.SUGGEST_BREATHING: r'\[suggest_breathing\s*:\s*(\{.*?\})\]',
        ActionTokenType.OFFER_RESOURCE: r'\[offer_resource\s*:\s*(\{.*?\})\]'
    }

    @classmethod
    def extract_tokens(cls, text: str) -> List[ActionToken]:
        """텍스트에서 액션 토큰들을 추출"""
        tokens = []
        FLAGS = re.IGNORECASE | re.DOTALL

        for token_type, pattern in cls.TOKEN_PATTERNS.items():
            matches = re.finditer(pattern, text, FLAGS)

            for match in matches:
                try:
                    params_json = match.group(1)
                    params = json.loads(params_json)

                    # 토큰 타입별 전용 모델 생성
                    if token_type == ActionTokenType.ASK_SUDS:
                        token = AskSUDSToken(
                            measurement_type=params.get('measurement_type', 'check'),
                            prompt_message=params.get('prompt_message', '현재 스트레스 수준을 측정해주세요.'),
                            context=params.get('context'),
                            priority=params.get('priority', 3)
                        )
                    elif token_type == ActionTokenType.RECOMMEND_EFT:
                        token = RecommendEFTToken(
                            technique=params.get('technique', 'basic_tapping'),
                            reason=params.get('reason', 'EFT 기법을 추천합니다.'),
                            difficulty=params.get('difficulty', 'beginner'),
                            estimated_duration=params.get('estimated_duration', 5),
                            priority=params.get('priority', 3)
                        )
                    else:
                        # 기본 토큰
                        token = ActionToken(
                            type=token_type,
                            parameters=params,
                            priority=params.get('priority', 2)
                        )

                    tokens.append(token)

                except (json.JSONDecodeError, KeyError, ValueError) as e:
                    # 파싱 오류 시 로깅하고 계속 진행 (운영에서는 logger 사용)
                    error_token = match.group(0)[:100]  # 길이 제한
                    print(f"토큰 파싱 오류: {error_token}... - {e}")
                    continue

        # 우선순위 순으로 정렬
        return sorted(tokens, key=lambda t: t.priority, reverse=True)

    @classmethod
    def remove_tokens(cls, text: str) -> str:
        """텍스트에서 모든 토큰을 제거하여 사용자에게 보여줄 깔끔한 텍스트 반환"""
        cleaned_text = text
        FLAGS = re.IGNORECASE | re.DOTALL

        # 1단계: 토큰만 제거 (문단 구조 유지)
        for pattern in cls.TOKEN_PATTERNS.values():
            cleaned_text = re.sub(pattern, '', cleaned_text, flags=FLAGS)

        # 2단계: 다중 공백만 정리 (개행은 보존)
        cleaned_text = re.sub(r'[ \t]{2,}', ' ', cleaned_text)  # 연속 공백/탭만
        cleaned_text = re.sub(r'\n[ \t]+\n', '\n\n', cleaned_text)  # 빈 줄 정리
        cleaned_text = re.sub(r'\n{3,}', '\n\n', cleaned_text)  # 과도한 개행 제한

        return cleaned_text.strip()

    @classmethod
    def has_tokens(cls, text: str) -> bool:
        """텍스트에 토큰이 포함되어 있는지 확인"""
        FLAGS = re.IGNORECASE | re.DOTALL
        for pattern in cls.TOKEN_PATTERNS.values():
            if re.search(pattern, text, FLAGS):
                return True
        return False

class TokenProcessor:
    """토큰 처리 및 액션 실행 클래스"""

    def __init__(self):
        self.action_handlers = {
            ActionTokenType.ASK_SUDS: self._handle_ask_suds,
            ActionTokenType.RECOMMEND_EFT: self._handle_recommend_eft,
            ActionTokenType.SCHEDULE_FOLLOWUP: self._handle_schedule_followup,
            ActionTokenType.REQUEST_MOOD_CHECK: self._handle_mood_check,
            ActionTokenType.SUGGEST_BREATHING: self._handle_suggest_breathing,
            ActionTokenType.OFFER_RESOURCE: self._handle_offer_resource
        }

    async def process_tokens(self, tokens: List[ActionToken], context: Dict[str, Any] = None) -> Dict[str, Any]:
        """토큰들을 처리하고 액션을 실행"""
        context = context or {}
        results = {
            "executed_actions": [],
            "errors": [],
            "next_actions": []
        }

        for token in tokens:
            try:
                handler = self.action_handlers.get(token.type)
                if handler:
                    action_result = await handler(token, context)
                    results["executed_actions"].append({
                        "token_type": token.type,
                        "result": action_result,
                        "priority": token.priority
                    })
                else:
                    results["errors"].append(f"지원되지 않는 토큰 타입: {token.type}")

            except Exception as e:
                results["errors"].append(f"토큰 처리 오류 ({token.type}): {str(e)}")

        return results

    async def _handle_ask_suds(self, token: AskSUDSToken, context: Dict[str, Any]) -> Dict[str, Any]:
        """SUDS 측정 요청 처리"""
        return {
            "type": "SUDS_MEASURE",  # 🔥 프론트엔드 스키마 매칭
            "action": "show_suds_inline",
            "payload": {
                "measurementType": token.measurement_type,
                "prompt": token.prompt_message,
                "context": token.context,
                "turnId": context.get("turn_id"),
                "sessionId": context.get("session_id")
            },
            "ui_component": "SUDSInlineCard",
            "auto_trigger": True
        }

    async def _handle_recommend_eft(self, token: RecommendEFTToken, context: Dict[str, Any]) -> Dict[str, Any]:
        """EFT 기법 추천 처리"""
        return {
            "action": "show_eft_recommendation",
            "technique": token.technique,
            "reason": token.reason,
            "difficulty": token.difficulty,
            "estimated_duration": token.estimated_duration,
            "ui_component": "EFTRecommendationCard",
            "navigation_target": f"/eft/{token.technique}"
        }

    async def _handle_schedule_followup(self, token: ActionToken, context: Dict[str, Any]) -> Dict[str, Any]:
        """후속 일정 예약 처리"""
        return {
            "action": "schedule_followup",
            "parameters": token.parameters,
            "ui_component": "FollowupScheduler"
        }

    async def _handle_mood_check(self, token: ActionToken, context: Dict[str, Any]) -> Dict[str, Any]:
        """기분 체크 요청 처리"""
        return {
            "action": "request_mood_check",
            "parameters": token.parameters,
            "ui_component": "MoodCheckCard"
        }

    async def _handle_suggest_breathing(self, token: ActionToken, context: Dict[str, Any]) -> Dict[str, Any]:
        """호흡 운동 제안 처리"""
        return {
            "action": "suggest_breathing",
            "parameters": token.parameters,
            "ui_component": "BreathingExerciseCard"
        }

    async def _handle_offer_resource(self, token: ActionToken, context: Dict[str, Any]) -> Dict[str, Any]:
        """리소스 제공 처리"""
        return {
            "action": "offer_resource",
            "parameters": token.parameters,
            "ui_component": "ResourceCard"
        }

# 사용 예시 및 테스트 케이스
if __name__ == "__main__":
    # 테스트 텍스트 (AI 응답 시뮬레이션)
    test_response = """
    스트레스가 많으시군요. 먼저 현재 상태를 정확히 파악해보겠습니다.

    [ask_suds: {"measurement_type": "pre", "prompt_message": "EFT 세션 전 스트레스 수준을 측정해주세요.", "context": "stress_assessment", "priority": 4}]

    측정 후에는 기본 탭핑 기법을 통해 스트레스를 완화해보시는 것을 추천드립니다.

    [recommend_eft: {"technique": "basic_tapping", "reason": "스트레스와 불안 완화에 효과적입니다", "difficulty": "beginner", "estimated_duration": 10, "priority": 3}]

    언제든지 도움이 필요하시면 말씀해주세요.
    """

    # 토큰 추출
    tokens = TokenParser.extract_tokens(test_response)
    print(f"추출된 토큰 수: {len(tokens)}")

    for token in tokens:
        print(f"- {token.type}: {token}")

    # 깔끔한 텍스트 생성
    clean_text = TokenParser.remove_tokens(test_response)
    print(f"\n깔끔한 텍스트:\n{clean_text}")