"""
EFT AI 채팅 관련 Pydantic 모델들
요청/응답 스키마 정의
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime
from enum import Enum

class EmotionType(str, Enum):
    """감정 타입 열거형"""
    JOY = "기쁨"
    SADNESS = "슬픔" 
    ANGER = "분노"
    FEAR = "두려움"
    SURPRISE = "놀람"
    DISGUST = "혐오"
    STRESS = "스트레스"
    ANXIETY = "불안"
    LOVE = "사랑"
    LONELINESS = "외로움"
    FRUSTRATION = "좌절"
    NEUTRAL = "중립"

class EFTPoint(str, Enum):
    """EFT 탭핑 포인트"""
    CROWN = "정수리"
    EYEBROW = "눈썹"
    SIDE_OF_EYE = "눈 옆"
    UNDER_EYE = "눈 아래"
    UNDER_NOSE = "코 아래"
    CHIN = "턱"
    COLLARBONE = "쇄골"
    UNDER_ARM = "겨드랑이"
    WRIST = "손목"

class ConversationMessage(BaseModel):
    """대화 메시지"""
    role: Literal["user", "assistant", "system"] = Field(..., description="메시지 역할")
    content: str = Field(..., description="메시지 내용")
    timestamp: Optional[datetime] = Field(default=None, description="메시지 시간")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="추가 메타데이터")

class UserProfile(BaseModel):
    """사용자 프로필 정보"""
    user_id: Optional[str] = Field(default=None, description="사용자 ID")
    age_group: Optional[str] = Field(default=None, description="연령대")
    communication_style: Optional[str] = Field(default="balanced", description="소통 스타일")
    preferred_language: str = Field(default="ko", description="선호 언어")
    eft_experience_level: str = Field(default="beginner", description="EFT 경험 수준")
    emotional_sensitivity: float = Field(default=0.5, ge=0.0, le=1.0, description="감정 민감도")
    previous_sessions: int = Field(default=0, description="이전 세션 수")

class EmotionAnalysis(BaseModel):
    """감정 분석 결과"""
    primary_emotion: EmotionType = Field(..., description="주요 감정")
    secondary_emotion: Optional[EmotionType] = Field(default=None, description="보조 감정")
    intensity: float = Field(..., ge=0.0, le=1.0, description="감정 강도 (0-1)")
    confidence: float = Field(..., ge=0.0, le=1.0, description="분석 신뢰도")
    emotional_keywords: List[str] = Field(default=[], description="감정 키워드들")
    context_analysis: Optional[Dict[str, Any]] = Field(default=None, description="상황 분석")

class EFTRecommendation(BaseModel):
    """EFT 기법 추천"""
    technique_name: str = Field(..., description="기법 이름")
    tapping_points: List[EFTPoint] = Field(..., description="탭핑 포인트들")
    setup_phrase: str = Field(..., description="셋업 구문")
    reminder_phrase: str = Field(..., description="리마인더 구문") 
    duration_minutes: int = Field(..., description="권장 진행 시간(분)")
    difficulty_level: Literal["beginner", "intermediate", "advanced"] = Field(..., description="난이도")
    effectiveness_score: float = Field(..., ge=0.0, le=1.0, description="예상 효과성")
    additional_notes: Optional[str] = Field(default=None, description="추가 안내사항")

class SuggestedAction(BaseModel):
    """제안 액션"""
    action_type: Literal["eft_session", "breathing", "reflection", "professional_help"] = Field(..., description="액션 타입")
    title: str = Field(..., description="액션 제목")
    description: str = Field(..., description="액션 설명")
    priority: Literal["low", "medium", "high", "urgent"] = Field(..., description="우선순위")
    estimated_time_minutes: int = Field(..., description="예상 소요 시간")

# === 요청 모델들 ===

class ChatRequest(BaseModel):
    """채팅 요청"""
    message: str = Field(..., min_length=1, max_length=2000, description="사용자 메시지")
    conversation_history: List[ConversationMessage] = Field(default=[], max_items=20, description="대화 이력")
    user_profile: Optional[UserProfile] = Field(default=None, description="사용자 프로필")
    
    # 생성 파라미터
    max_tokens: Optional[int] = Field(default=400, ge=50, le=1000, description="최대 토큰 수")
    temperature: Optional[float] = Field(default=0.7, ge=0.1, le=1.0, description="창의성 수준")
    top_p: Optional[float] = Field(default=0.9, ge=0.1, le=1.0, description="토큰 선택 확률")
    
    # EFT 관련 설정
    include_eft_recommendations: bool = Field(default=True, description="EFT 추천 포함 여부")
    emergency_check: bool = Field(default=True, description="응급상황 체크 여부")
    
    # 요청 메타데이터
    session_id: Optional[str] = Field(default=None, description="세션 ID")
    request_id: Optional[str] = Field(default=None, description="요청 ID")
    client_timestamp: Optional[datetime] = Field(default=None, description="클라이언트 타임스탬프")

class EmotionAnalysisRequest(BaseModel):
    """감정 분석 요청"""
    text: str = Field(..., min_length=1, max_length=5000, description="분석할 텍스트")
    context: Optional[str] = Field(default=None, description="맥락 정보")
    detailed_analysis: bool = Field(default=True, description="상세 분석 여부")

class EFTRecommendationRequest(BaseModel):
    """EFT 추천 요청"""
    emotion_analysis: EmotionAnalysis = Field(..., description="감정 분석 결과")
    user_profile: Optional[UserProfile] = Field(default=None, description="사용자 프로필")
    session_context: Optional[str] = Field(default=None, description="세션 맥락")

# === 응답 모델들 ===

class ChatResponse(BaseModel):
    """채팅 응답"""
    response: str = Field(..., description="AI 응답 메시지")
    emotion_analysis: EmotionAnalysis = Field(..., description="감정 분석 결과")
    eft_recommendations: List[EFTRecommendation] = Field(default=[], description="EFT 기법 추천들")
    suggested_actions: List[SuggestedAction] = Field(default=[], description="제안 액션들")
    
    # 메타데이터
    confidence_score: float = Field(..., ge=0.0, le=1.0, description="응답 신뢰도")
    processing_time: float = Field(..., description="처리 시간(초)")
    model_version: str = Field(default="1.0", description="모델 버전")
    timestamp: str = Field(..., description="응답 생성 시간")
    tier: Optional[str] = Field(default="free", description="사용된 AI 티어 (free/premium/enterprise)")
    
    # 플래그들
    requires_followup: bool = Field(default=False, description="후속 조치 필요 여부")
    emergency_detected: bool = Field(default=False, description="응급상황 감지 여부")
    professional_referral: bool = Field(default=False, description="전문가 상담 권유 여부")
    
    # 세션 관리
    session_id: Optional[str] = Field(default=None, description="세션 ID")
    response_id: str = Field(..., description="응답 고유 ID")

class StreamResponse(BaseModel):
    """스트리밍 응답 청크"""
    chunk_type: Literal["text", "emotion", "eft", "action", "metadata", "error", "end"] = Field(..., description="청크 타입")
    content: str = Field(..., description="청크 내용")
    sequence_number: int = Field(..., description="시퀀스 번호")
    is_final: bool = Field(default=False, description="최종 청크 여부")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="청크 메타데이터")

class ErrorResponse(BaseModel):
    """에러 응답"""
    error_code: str = Field(..., description="에러 코드")
    error_message: str = Field(..., description="에러 메시지")
    error_type: Literal["validation", "model", "system", "timeout", "rate_limit"] = Field(..., description="에러 타입")
    timestamp: str = Field(..., description="에러 발생 시간")
    request_id: Optional[str] = Field(default=None, description="요청 ID")
    suggestions: List[str] = Field(default=[], description="해결 방법 제안")

# === 통계 및 모니터링 모델들 ===

class ModelStats(BaseModel):
    """모델 성능 통계"""
    model_name: str = Field(..., description="모델 이름")
    total_requests: int = Field(default=0, description="총 요청 수")
    successful_requests: int = Field(default=0, description="성공한 요청 수")
    average_response_time: float = Field(default=0.0, description="평균 응답 시간")
    memory_usage_gb: float = Field(default=0.0, description="메모리 사용량(GB)")
    gpu_utilization: Optional[float] = Field(default=None, description="GPU 사용률")
    uptime_hours: float = Field(default=0.0, description="가동 시간")
    last_updated: str = Field(..., description="마지막 업데이트 시간")

class HealthCheckResponse(BaseModel):
    """헬스 체크 응답"""
    status: Literal["healthy", "degraded", "unhealthy"] = Field(..., description="서버 상태")
    components: Dict[str, str] = Field(..., description="컴포넌트별 상태")
    timestamp: str = Field(..., description="체크 시간")
    version: str = Field(..., description="서버 버전")
    uptime_seconds: float = Field(..., description="가동 시간(초)")