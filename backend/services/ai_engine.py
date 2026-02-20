"""
EFT AI ?”ì§„ - Llama 3 ê¸°ë°˜ ?¬ë¦¬?ë‹´ ?¹í™” AI
transformers ?¼ì´ë¸ŒëŸ¬ë¦¬ë? ?¬ìš©??ë¡œì»¬/?´ë¼?°ë“œ LLM ì¶”ë¡ 
"""

import torch
from transformers import (
    AutoModelForCausalLM, 
    AutoTokenizer, 
    BitsAndBytesConfig,
    pipeline
)
from typing import Optional, Dict, Any, List, AsyncGenerator
import asyncio
import time
from datetime import datetime
import json
import gc
import psutil
import GPUtil

from config.settings import get_settings
from utils.logger import get_logger
from models.chat_models import EmotionAnalysis, ModelStats

logger = get_logger(__name__)
settings = get_settings()

class EFTAIEngine:
    """EFT ?„ë¬¸ AI ?”ì§„"""
    
    def __init__(
        self, 
        model_name: str = None,
        device: str = "auto",
        max_memory: str = None
    ):
        self.model_name = model_name or settings.MODEL_NAME
        self.device = device if device != "auto" else self._detect_best_device()
        self.max_memory = max_memory or settings.MAX_MEMORY
        
        # ëª¨ë¸ ë°?? í¬?˜ì´?€ (ì´ˆê¸°????ë¡œë“œ)
        self.model = None
        self.tokenizer = None
        self.generation_pipeline = None
        
        # ?±ëŠ¥ ?µê³„
        self.stats = {
            "total_requests": 0,
            "successful_requests": 0,
            "total_processing_time": 0.0,
            "start_time": time.time(),
            "errors": []
        }
        
        logger.info(f"EFT AI Engine ì´ˆê¸°?? {self.model_name} on {self.device}")
    
    def _detect_best_device(self) -> str:
        """ìµœì  ?”ë°”?´ìŠ¤ ?ë™ ê°ì?"""
        if torch.cuda.is_available():
            gpu_count = torch.cuda.device_count()
            logger.info(f"CUDA ?¬ìš© ê°€?? GPU {gpu_count}ê°?ê°ì?")
            return "cuda"
        elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            logger.info("Apple Silicon MPS ?¬ìš©")
            return "mps"
        else:
            logger.info("CPU ëª¨ë“œ ?¬ìš©")
            return "cpu"
    
    def _setup_quantization_config(self) -> Optional[BitsAndBytesConfig]:
        """?‘ì???¤ì • (ë©”ëª¨ë¦??ˆì•½?? - bitsandbytes ?¨í‚¤ì§€ ?†ì´ ë¹„í™œ?±í™”"""
        logger.info("?‘ì??ë¹„í™œ?±í™” (bitsandbytes ?¨í‚¤ì§€ ë¶ˆí•„??")
        return None
    
    async def initialize(self) -> None:
        """ëª¨ë¸ ë°?? í¬?˜ì´?€ ë¡œë“œ"""
        try:
            logger.info(f"?¤– ëª¨ë¸ ë¡œë“œ ?œì‘: {self.model_name}")
            start_time = time.time()
            
            # 1. ? í¬?˜ì´?€ ë¡œë“œ
            logger.info("?“ ? í¬?˜ì´?€ ë¡œë“œ ì¤?..")
            self.tokenizer = AutoTokenizer.from_pretrained(
                self.model_name,
                cache_dir=settings.MODEL_CACHE_DIR,
                token=settings.HUGGINGFACE_TOKEN
            )
            
            # ?¨ë”© ? í° ?¤ì • (Llama??ê¸°ë³¸?ìœ¼ë¡??†ìŒ)
            if self.tokenizer.pad_token is None:
                self.tokenizer.pad_token = self.tokenizer.eos_token
            
            # 2. ?‘ì???¤ì •
            quantization_config = self._setup_quantization_config()
            
            # 3. ëª¨ë¸ ë¡œë“œ
            logger.info("?§  ?¸ì–´ëª¨ë¸ ë¡œë“œ ì¤?.. (??ë¶??Œìš” ê°€??")
            
            model_kwargs = {
                "cache_dir": settings.MODEL_CACHE_DIR,
                "torch_dtype": torch.float16 if self.device == "cuda" else torch.float32,
                "device_map": "auto" if self.device == "cuda" else None,
                "token": settings.HUGGINGFACE_TOKEN
            }
            
            if quantization_config:
                model_kwargs["quantization_config"] = quantization_config
            
            if self.max_memory:
                model_kwargs["max_memory"] = {0: self.max_memory}
            
            self.model = AutoModelForCausalLM.from_pretrained(
                self.model_name,
                **model_kwargs
            )
            
            # CPU ëª¨ë“œ?ì„œ??ì§ì ‘ ?”ë°”?´ìŠ¤ ?´ë™
            if self.device == "cpu":
                self.model = self.model.to(self.device)
            
            # 4. ?ì„± ?Œì´?„ë¼??ì´ˆê¸°??            logger.info("???ì„± ?Œì´?„ë¼??ì´ˆê¸°??ì¤?..")
            self.generation_pipeline = pipeline(
                "text-generation",
                model=self.model,
                tokenizer=self.tokenizer,
                device=0 if self.device == "cuda" else -1,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
                do_sample=True,
                return_full_text=False
            )
            
            load_time = time.time() - start_time
            logger.info(f"??ëª¨ë¸ ë¡œë“œ ?„ë£Œ! ({load_time:.1f}ì´??Œìš”)")
            
            # ë©”ëª¨ë¦??¬ìš©??ë¡œê¹…
            self._log_memory_usage()
            
        except Exception as e:
            logger.error(f"??ëª¨ë¸ ë¡œë“œ ?¤íŒ¨: {e}")
            raise e
    
    def _log_memory_usage(self):
        """ë©”ëª¨ë¦??¬ìš©??ë¡œê¹…"""
        try:
            # RAM ?¬ìš©??            ram = psutil.virtual_memory()
            logger.info(f"?’¾ RAM ?¬ìš©?? {ram.used / 1024**3:.1f}GB / {ram.total / 1024**3:.1f}GB")
            
            # GPU ë©”ëª¨ë¦??¬ìš©??(CUDA ?¬ìš© ??
            if self.device == "cuda" and torch.cuda.is_available():
                for i in range(torch.cuda.device_count()):
                    memory_allocated = torch.cuda.memory_allocated(i) / 1024**3
                    memory_reserved = torch.cuda.memory_reserved(i) / 1024**3
                    logger.info(f"?® GPU {i} ë©”ëª¨ë¦? {memory_allocated:.1f}GB allocated, {memory_reserved:.1f}GB reserved")
            
        except Exception as e:
            logger.warning(f"ë©”ëª¨ë¦?ë¡œê¹… ?¤íŒ¨: {e}")
    
    async def generate_response(
        self,
        prompt: str,
        max_tokens: int = 400,
        temperature: float = 0.7,
        top_p: float = 0.9,
        top_k: int = 50
    ) -> str:
        """AI ?‘ë‹µ ?ì„± (?¨ì¼ ?‘ë‹µ)"""
        
        if not self.model or not self.tokenizer:
            raise RuntimeError("ëª¨ë¸??ë¡œë“œ?˜ì? ?Šì•˜?µë‹ˆ?? initialize()ë¥?ë¨¼ì? ?¸ì¶œ?˜ì„¸??")
        
        self.stats["total_requests"] += 1
        start_time = time.time()
        
        try:
            # ë¹„ë™ê¸?ì²˜ë¦¬ë¥??„í•´ ?¤ë ˆ?œì—???¤í–‰
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None, 
                self._generate_sync, 
                prompt, max_tokens, temperature, top_p, top_k
            )
            
            processing_time = time.time() - start_time
            self.stats["total_processing_time"] += processing_time
            self.stats["successful_requests"] += 1
            
            logger.info(f"???‘ë‹µ ?ì„± ?„ë£Œ ({processing_time:.2f}ì´?")
            return response
            
        except Exception as e:
            error_msg = f"?‘ë‹µ ?ì„± ?¤íŒ¨: {str(e)}"
            logger.error(error_msg)
            self.stats["errors"].append({
                "timestamp": datetime.now().isoformat(),
                "error": error_msg
            })
            raise e
    
    def _generate_sync(
        self, 
        prompt: str, 
        max_tokens: int, 
        temperature: float, 
        top_p: float, 
        top_k: int
    ) -> str:
        """?™ê¸°???ìŠ¤???ì„± (?´ë? ë©”ì„œ??"""
        
        try:
            # ëª¨ë¸ë³??„ë¡¬?„íŠ¸ ?¬ë§·??(DialoGPT vs Llama êµ¬ë¶„)
            if "DialoGPT" in self.model_name:
                formatted_prompt = self._format_dialogpt_prompt(prompt)
                # DialoGPT ? í° ê¸¸ì´ ?œí•œ (??ë³´ìˆ˜?ìœ¼ë¡??¤ì •)
                max_input_length = 200  # ë§¤ìš° ì§§ê²Œ ?¤ì •
                safe_max_tokens = min(max_tokens, 100)  # ?ˆì „??ì¶œë ¥ ê¸¸ì´
            else:
                formatted_prompt = self._format_llama_prompt(prompt)
                max_input_length = 4000  # Llama ëª¨ë¸?€ ???¬ìœ ë¡?²Œ
                safe_max_tokens = max_tokens
            
            # ?…ë ¥ ? í° ê¸¸ì´ ì²´í¬ ë°??œí•œ
            input_tokens = self.tokenizer.encode(formatted_prompt, return_tensors="pt")
            
            if input_tokens.shape[1] > max_input_length:
                logger.warning(f"?…ë ¥ ? í° ê¸¸ì´ ì´ˆê³¼ ({input_tokens.shape[1]} > {max_input_length}), ?ë¥´ê¸??ìš©")
                # ?¤ì—?œë????ë¥´ê¸?(ìµœê·¼ ?€??? ì?)
                truncated_tokens = input_tokens[:, -max_input_length:]
                formatted_prompt = self.tokenizer.decode(truncated_tokens[0], skip_special_tokens=True)
                logger.info(f"? í° ê¸¸ì´ ì¡°ì •: {input_tokens.shape[1]} ??{max_input_length}")
            
            # ?ì„± ?Œë¼ë¯¸í„°
            generation_params = {
                "max_new_tokens": safe_max_tokens,
                "temperature": temperature,
                "top_p": top_p,
                "top_k": top_k,
                "do_sample": True,
                "pad_token_id": self.tokenizer.eos_token_id,
                "eos_token_id": self.tokenizer.eos_token_id,
                "truncation": True
            }
            
            # DialoGPT ?„ìš© ?Œë¼ë¯¸í„° ì¶”ê?
            if "DialoGPT" in self.model_name:
                generation_params["max_length"] = 1024  # ?„ì²´ ê¸¸ì´ ?œí•œ
            
            # ?ìŠ¤???ì„±
            outputs = self.generation_pipeline(
                formatted_prompt,
                **generation_params
            )
            
            # ?‘ë‹µ ì¶”ì¶œ ë°??„ì²˜ë¦?            generated_text = outputs[0]["generated_text"]
            logger.info(f"?¤– DialoGPT ?ë³¸ ì¶œë ¥: {repr(generated_text)}")
            
            cleaned_response = self._clean_response(generated_text, formatted_prompt)
            
            return cleaned_response
            
        except Exception as e:
            logger.error(f"?™ê¸° ?ì„± ?¤íŒ¨: {e}")
            raise e
    
    def _format_llama_prompt(self, user_prompt: str) -> str:
        """Llama ëª¨ë¸???„ë¡¬?„íŠ¸ ?¬ë§·??""
        
        # Llama-2/3 Chat ?œí”Œë¦??ìš©
        if "llama-2" in self.model_name.lower():
            formatted = f"<s>[INST] {user_prompt} [/INST]"
        elif "llama-3" in self.model_name.lower():
            formatted = f"<|begin_of_text|><|start_header_id|>user<|end_header_id|>\n\n{user_prompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n"
        else:
            # ê¸°ë³¸ ?¬ë§·
            formatted = f"Human: {user_prompt}\n\nAssistant: "
        
        return formatted
    
    def _format_dialogpt_prompt(self, user_prompt: str) -> str:
        """DialoGPT ëª¨ë¸???„ë¡¬?„íŠ¸ ?¬ë§·??(ê°„ë‹¨???€?”í˜•)"""
        
        # DialoGPTë¥??„í•œ ê°„ë‹¨?˜ì?ë§?ëª…í™•??EFT ?ë‹´???¤ì •
        formatted = f"User: {user_prompt}{self.tokenizer.eos_token}EFT Counselor:"
        
        return formatted
    
    def _clean_response(self, generated_text: str, prompt: str) -> str:
        """?‘ë‹µ ?„ì²˜ë¦?ë°??•ë¦¬"""
        
        # ?„ë¡¬?„íŠ¸ ?œê±°
        cleaned = generated_text
        
        # ?¹ìˆ˜ ? í° ?œê±°
        special_tokens = [
            "<|eot_id|>", "<|end_of_text|>", "</s>", 
            "<|start_header_id|>", "<|end_header_id|>",
            "[INST]", "[/INST]", "<s>"
        ]
        
        for token in special_tokens:
            cleaned = cleaned.replace(token, "")
        
        # ê³µë°± ?•ë¦¬
        cleaned = cleaned.strip()
        
        # ?ˆë¬´ ê¸??‘ë‹µ ?ë¥´ê¸?        if len(cleaned) > 1500:
            sentences = cleaned.split('. ')
            cleaned = '. '.join(sentences[:5]) + '.'
        
        # ?”ë²„ê¹…ì„ ?„í•œ ë¡œê·¸ ì¶”ê?
        logger.info(f"?” ?ì„±???ë³¸ ?ìŠ¤?? {repr(generated_text)}")
        logger.info(f"?” ?•ì œ???ìŠ¤?? {repr(cleaned)}")
        
        # ë¹??‘ë‹µ ì²˜ë¦¬
        if not cleaned:
            cleaned = "ì£„ì†¡?©ë‹ˆ?? ?‘ë‹µ???ì„±?˜ëŠ”??ë¬¸ì œê°€ ?ˆì—ˆ?µë‹ˆ?? ?¤ì‹œ ë§ì???ì£¼ì‹œê² ì–´??"
        
        return cleaned
    
    async def generate_stream(
        self, 
        message: str, 
        emotion_state: EmotionAnalysis
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """?¤íŠ¸ë¦¬ë° ?‘ë‹µ ?ì„± (ê¸??‘ë‹µ??"""
        
        # TODO: ?¤ì œ ?¤íŠ¸ë¦¬ë° êµ¬í˜„
        # ?„ì¬??ì²?¬ë¡??˜ëˆ„???œë??ˆì´??        
        response = await self.generate_response(message)
        chunks = self._split_into_chunks(response, chunk_size=50)
        
        for i, chunk in enumerate(chunks):
            yield {
                "chunk_type": "text",
                "content": chunk,
                "sequence_number": i,
                "is_final": i == len(chunks) - 1
            }
            
            # ?¤íŠ¸ë¦¬ë° ?œë??ˆì´?˜ì„ ?„í•œ ì§€??            await asyncio.sleep(0.1)
    
    def _split_into_chunks(self, text: str, chunk_size: int = 50) -> List[str]:
        """?ìŠ¤?¸ë? ì²?¬ë¡?ë¶„í• """
        words = text.split()
        chunks = []
        
        for i in range(0, len(words), chunk_size):
            chunk = ' '.join(words[i:i + chunk_size])
            chunks.append(chunk)
        
        return chunks
    
    async def get_performance_stats(self) -> ModelStats:
        """ëª¨ë¸ ?±ëŠ¥ ?µê³„ ë°˜í™˜"""
        
        uptime = time.time() - self.stats["start_time"]
        avg_response_time = (
            self.stats["total_processing_time"] / max(self.stats["successful_requests"], 1)
        )
        
        # ë©”ëª¨ë¦??¬ìš©??ê³„ì‚°
        memory_usage = 0.0
        gpu_utilization = None
        
        try:
            if self.device == "cuda" and torch.cuda.is_available():
                memory_usage = torch.cuda.memory_allocated(0) / 1024**3
                
                # GPU ?¬ìš©ë¥?(?µì…˜)
                try:
                    gpus = GPUtil.getGPUs()
                    if gpus:
                        gpu_utilization = gpus[0].load
                except:
                    pass
            else:
                # CPU ë©”ëª¨ë¦??¬ìš©??ì¶”ì •
                process = psutil.Process()
                memory_usage = process.memory_info().rss / 1024**3
                
        except Exception as e:
            logger.warning(f"ë©”ëª¨ë¦??¬ìš©??ê³„ì‚° ?¤íŒ¨: {e}")
        
        return ModelStats(
            model_name=self.model_name,
            total_requests=self.stats["total_requests"],
            successful_requests=self.stats["successful_requests"],
            average_response_time=avg_response_time,
            memory_usage_gb=memory_usage,
            gpu_utilization=gpu_utilization,
            uptime_hours=uptime / 3600,
            last_updated=datetime.now().isoformat()
        )
    
    async def cleanup(self) -> None:
        """ë¦¬ì†Œ???•ë¦¬"""
        logger.info("?”„ AI ?”ì§„ ë¦¬ì†Œ???•ë¦¬ ì¤?..")
        
        try:
            if self.model:
                del self.model
                self.model = None
            
            if self.tokenizer:
                del self.tokenizer
                self.tokenizer = None
                
            if self.generation_pipeline:
                del self.generation_pipeline
                self.generation_pipeline = None
            
            # ë©”ëª¨ë¦??•ë¦¬
            gc.collect()
            
            if self.device == "cuda" and torch.cuda.is_available():
                torch.cuda.empty_cache()
            
            logger.info("??ë¦¬ì†Œ???•ë¦¬ ?„ë£Œ")
            
        except Exception as e:
            logger.error(f"ë¦¬ì†Œ???•ë¦¬ ?¤íŒ¨: {e}")

# ?„ì—­ AI ?”ì§„ ?¸ìŠ¤?´ìŠ¤ (?±ê???
_ai_engine_instance: Optional[EFTAIEngine] = None

def get_ai_engine() -> EFTAIEngine:
    """AI ?”ì§„ ?¸ìŠ¤?´ìŠ¤ ë°˜í™˜ (?±ê???"""
    global _ai_engine_instance
    if _ai_engine_instance is None:
        _ai_engine_instance = EFTAIEngine()
    return _ai_engine_instance
