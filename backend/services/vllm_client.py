# services/vllm_client.py
from typing import List, Dict, Any, Optional, Tuple
from openai import OpenAI
from config.settings import get_settings
from utils.logger import get_logger

logger = get_logger(__name__)
settings = get_settings()

class VLLMClient:
    """vLLM(OpenAI ?¸í™˜) ?”ì§„ A/B(Llama/Qwen) ?¸ì¶œ ?´ë¼?´ì–¸??""

    def __init__(self) -> None:
        logger.info("vLLM ?´ë¼?´ì–¸??ì´ˆê¸°???„ë£Œ")

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
        """OpenAI Chat Completions ?¬ë§· ê·¸ë?ë¡?ë°˜í™˜."""
# [ê¸´ê¸‰ ?˜ì •] ë¡œì»¬ ê°œë°œ??ê°€ì§?AI ëª¨ë“œ (GPU ?†ì´ ?¤í–‰)
        # settings.py??USE_MOCK_AI = Trueê°€ ?ˆì–´???‘ë™?©ë‹ˆ??
        if getattr(settings, "USE_MOCK_AI", False):
            logger.warning(f"? ï¸ [MOCK MODE] AI ?”ì²­??ê°€ë¡œì±˜?µë‹ˆ?? (GPU ë¯¸ì‚¬??: {messages[-1].get('content')}")
            time.sleep(1) # AIê°€ ?ê°?˜ëŠ” ì²?1ì´??œë ˆ??            
            return {
                "choices": [{
                    "message": {
                        "role": "assistant",
                        "content": "?´ê²ƒ?€ ë¡œì»¬ ?ŒìŠ¤?¸ìš© ê°€ì§??‘ë‹µ?…ë‹ˆ?? (GPU ?°ê²° ?ˆë¨)\n\n[ë¶„ì„ ê²°ê³¼]\nê°ì •: ë¶ˆì•ˆê°?85%\n?ì¸: ?„ë¡œ?íŠ¸ ë§ˆê° ?•ë°•\n\n[ì²˜ë°©]\në°•ìŠ¤ ?¸í¡??3???¤ì‹œ?˜ê³ , '?˜ëŠ” ?ˆì „?˜ë‹¤'ê³??˜ë‡Œ?´ë³´?¸ìš”."
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
            # ?”ë²„ê¹…ì— ?„ì? ?˜ëŠ” ë©”í? ì¶”ê?(?í•˜ë©?ë¹¼ë„ ??
            result["tier"] = tier
            result["model_used"] = model
            return result
        except Exception as e:
            # Windows vLLM ?¸í™˜??ë¬¸ì œë¡??¸í•œ ?¤ë§ˆ???´ë°± ?‘ë‹µ
            last_message = messages[-1].get("content", "") if messages else ""
            
            # ê°ì • ê¸°ë°˜ ?¤ë§ˆ???‘ë‹µ ?ì„±
            if "?¤íŠ¸?ˆìŠ¤" in last_message or "?˜ë“¤" in last_message:
                fallback_response = f"'{last_message}'ë¡??˜ë“œ?œê² ?´ìš”. ê¹Šê²Œ ?¨ì„ ?¤ì´?¬ê³  ì²œì²œ???´ì‰¬?´ë³´?¸ìš”. EFT ??•‘???µí•´ ??ê°ì •???¤ë¤„ë³¼ê¹Œ?? ë¨¸ë¦¬ ê¼??ê¸°ë? ë¶€?œëŸ½ê²???•‘?˜ë©° '???¤íŠ¸?ˆìŠ¤ë¥??¸ì •?˜ê³  ë°›ì•„?¤ì…?ˆë‹¤'?¼ê³  ë§í•´ë³´ì„¸??"
            elif "?ˆë…•" in last_message or "ping" in last_message:
                fallback_response = "?ˆë…•?˜ì„¸?? EFT AI ?ë‹´?¬ì…?ˆë‹¤. ?„ì¬ ?œë??ˆì´??ëª¨ë“œë¡??™ì‘ì¤‘ì´ì§€ë§? ?¬ì „???„ì????œë¦´ ???ˆì–´?? ?¤ëŠ˜ ?´ë–¤ ê°ì •?´ë‚˜ ?í™©???€???´ì•¼ê¸°í•´ë³¼ê¹Œ??"
            else:
                fallback_response = f"'{last_message}'???€???¨ê»˜ ?´ì•¼ê¸°í•´ë´ìš”. ì§€ê¸????œê°„ ?´ë–¤ ê°ì •???ë¼ê³?ê³„ì‹ ê°€?? EFT??ê°ì •???ˆëŠ” ê·¸ë?ë¡?ë°›ì•„?¤ì´??ê²ƒë????œì‘?©ë‹ˆ??"
            
            return {
                "choices": [{
                    "message": {
                        "content": fallback_response,
                        "role": "assistant"
                    },
                    "finish_reason": "stop"
                }],
                "tier": tier,
                "model_used": f"EFT ?„ë¬¸ ?´ë°± ?œìŠ¤??,
                "fallback": True,
                "reason": "Windows vLLM ?¸í™˜??ë¬¸ì œ"
            }

    def list_models(self, tier: Optional[str] = "free") -> Dict[str, Any]:
        """?”ì§„ ?¬ìŠ¤ ?•ì¸??/v1/models ?¸ì¶œ"""
        client, _ = self._get_client_and_model(tier)
        return client.models.list().model_dump()
