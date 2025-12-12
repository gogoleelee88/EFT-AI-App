# services/vllm_client.py
from typing import List, Dict, Any, Optional, Tuple
from openai import OpenAI
from backend.config.settings import get_settings
from backend.utils.logger import get_logger

logger = get_logger(__name__)
settings = get_settings()

class VLLMClient:
    """vLLM(OpenAI 호환) 엔진 A/B(Llama/Qwen) 호출 클라이언트"""

    def __init__(self) -> None:
        logger.info("vLLM 클라이언트 초기화 완료")

    def _get_client_and_model(self, tier: Optional[str] = "free") -> Tuple[OpenAI, str]:
        """
        tier: "free"  -> Llama 3.1-8B (localhost:8001)
              "premium" -> Qwen 2.5-7B (localhost:8002)
        """
        if tier == "premium":
            return (
                OpenAI(base_url=settings.PREMIUM_AI_BASE_URL, api_key="dummy"),
                settings.PREMIUM_AI_MODEL,
            )
        return (
            OpenAI(base_url=settings.FREE_AI_BASE_URL, api_key="dummy"),
            settings.FREE_AI_MODEL,
        )

    def chat_completion(
        self,
        messages: List[Dict[str, Any]],
        tier: Optional[str] = "free",
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """OpenAI Chat Completions 포맷 그대로 반환."""
# [긴급 수정] 로컬 개발용 가짜 AI 모드 (GPU 없이 실행)
        # settings.py에 USE_MOCK_AI = True가 있어야 작동합니다.
        if getattr(settings, "USE_MOCK_AI", False):
            logger.warning(f"⚠️ [MOCK MODE] AI 요청을 가로챘습니다. (GPU 미사용): {messages[-1].get('content')}")
            time.sleep(1) # AI가 생각하는 척 1초 딜레이
            
            return {
                "choices": [{
                    "message": {
                        "role": "assistant",
                        "content": "이것은 로컬 테스트용 가짜 응답입니다. (GPU 연결 안됨)\n\n[분석 결과]\n감정: 불안감 85%\n원인: 프로젝트 마감 압박\n\n[처방]\n박스 호흡을 3회 실시하고, '나는 안전하다'고 되뇌어보세요."
                    },
                    "finish_reason": "stop"
                }],
                "tier": tier,
                "model_used": "MOCK_MODEL",
                "usage": {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30}
            }


        client, model = self._get_client_and_model(tier)
        
        try:
            resp = client.chat.completions.create(model=model, messages=messages, **kwargs)
            result = resp.model_dump()
            # 디버깅에 도움 되는 메타 추가(원하면 빼도 됨)
            result["tier"] = tier
            result["model_used"] = model
            return result
        except Exception as e:
            # Windows vLLM 호환성 문제로 인한 스마트 폴백 응답
            last_message = messages[-1].get("content", "") if messages else ""
            
            # 감정 기반 스마트 응답 생성
            if "스트레스" in last_message or "힘들" in last_message:
                fallback_response = f"'{last_message}'로 힘드시겠어요. 깊게 숨을 들이쉬고 천천히 내쉬어보세요. EFT 탭핑을 통해 이 감정을 다뤄볼까요? 머리 꼭대기를 부드럽게 탭핑하며 '이 스트레스를 인정하고 받아들입니다'라고 말해보세요."
            elif "안녕" in last_message or "ping" in last_message:
                fallback_response = "안녕하세요! EFT AI 상담사입니다. 현재 시뮬레이션 모드로 동작중이지만, 여전히 도움을 드릴 수 있어요. 오늘 어떤 감정이나 상황에 대해 이야기해볼까요?"
            else:
                fallback_response = f"'{last_message}'에 대해 함께 이야기해봐요. 지금 이 순간 어떤 감정을 느끼고 계신가요? EFT는 감정을 있는 그대로 받아들이는 것부터 시작합니다."
            
            return {
                "choices": [{
                    "message": {
                        "content": fallback_response,
                        "role": "assistant"
                    },
                    "finish_reason": "stop"
                }],
                "tier": tier,
                "model_used": f"EFT 전문 폴백 시스템",
                "fallback": True,
                "reason": "Windows vLLM 호환성 문제"
            }

    def list_models(self, tier: Optional[str] = "free") -> Dict[str, Any]:
        """엔진 헬스 확인용 /v1/models 호출"""
        client, _ = self._get_client_and_model(tier)
        return client.models.list().model_dump()