"""
EFT AI 엔진 - Llama 3 기반 심리상담 특화 AI
transformers 라이브러리를 사용한 로컬/클라우드 LLM 추론
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
    """EFT 전문 AI 엔진"""
    
    def __init__(
        self, 
        model_name: str = None,
        device: str = "auto",
        max_memory: str = None
    ):
        self.model_name = model_name or settings.MODEL_NAME
        self.device = device if device != "auto" else self._detect_best_device()
        self.max_memory = max_memory or settings.MAX_MEMORY
        
        # 모델 및 토크나이저 (초기화 후 로드)
        self.model = None
        self.tokenizer = None
        self.generation_pipeline = None
        
        # 성능 통계
        self.stats = {
            "total_requests": 0,
            "successful_requests": 0,
            "total_processing_time": 0.0,
            "start_time": time.time(),
            "errors": []
        }
        
        logger.info(f"EFT AI Engine 초기화: {self.model_name} on {self.device}")
    
    def _detect_best_device(self) -> str:
        """최적 디바이스 자동 감지"""
        if torch.cuda.is_available():
            gpu_count = torch.cuda.device_count()
            logger.info(f"CUDA 사용 가능, GPU {gpu_count}개 감지")
            return "cuda"
        elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            logger.info("Apple Silicon MPS 사용")
            return "mps"
        else:
            logger.info("CPU 모드 사용")
            return "cpu"
    
    def _setup_quantization_config(self) -> Optional[BitsAndBytesConfig]:
        """양자화 설정 (메모리 절약용) - bitsandbytes 패키지 없이 비활성화"""
        logger.info("양자화 비활성화 (bitsandbytes 패키지 불필요)")
        return None
    
    async def initialize(self) -> None:
        """모델 및 토크나이저 로드"""
        try:
            logger.info(f"🤖 모델 로드 시작: {self.model_name}")
            start_time = time.time()
            
            # 1. 토크나이저 로드
            logger.info("📝 토크나이저 로드 중...")
            self.tokenizer = AutoTokenizer.from_pretrained(
                self.model_name,
                cache_dir=settings.MODEL_CACHE_DIR,
                token=settings.HUGGINGFACE_TOKEN
            )
            
            # 패딩 토큰 설정 (Llama는 기본적으로 없음)
            if self.tokenizer.pad_token is None:
                self.tokenizer.pad_token = self.tokenizer.eos_token
            
            # 2. 양자화 설정
            quantization_config = self._setup_quantization_config()
            
            # 3. 모델 로드
            logger.info("🧠 언어모델 로드 중... (수 분 소요 가능)")
            
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
            
            # CPU 모드에서는 직접 디바이스 이동
            if self.device == "cpu":
                self.model = self.model.to(self.device)
            
            # 4. 생성 파이프라인 초기화
            logger.info("⚡ 생성 파이프라인 초기화 중...")
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
            logger.info(f"✅ 모델 로드 완료! ({load_time:.1f}초 소요)")
            
            # 메모리 사용량 로깅
            self._log_memory_usage()
            
        except Exception as e:
            logger.error(f"❌ 모델 로드 실패: {e}")
            raise e
    
    def _log_memory_usage(self):
        """메모리 사용량 로깅"""
        try:
            # RAM 사용량
            ram = psutil.virtual_memory()
            logger.info(f"💾 RAM 사용량: {ram.used / 1024**3:.1f}GB / {ram.total / 1024**3:.1f}GB")
            
            # GPU 메모리 사용량 (CUDA 사용 시)
            if self.device == "cuda" and torch.cuda.is_available():
                for i in range(torch.cuda.device_count()):
                    memory_allocated = torch.cuda.memory_allocated(i) / 1024**3
                    memory_reserved = torch.cuda.memory_reserved(i) / 1024**3
                    logger.info(f"🎮 GPU {i} 메모리: {memory_allocated:.1f}GB allocated, {memory_reserved:.1f}GB reserved")
            
        except Exception as e:
            logger.warning(f"메모리 로깅 실패: {e}")
    
    async def generate_response(
        self,
        prompt: str,
        max_tokens: int = 400,
        temperature: float = 0.7,
        top_p: float = 0.9,
        top_k: int = 50
    ) -> str:
        """AI 응답 생성 (단일 응답)"""
        
        if not self.model or not self.tokenizer:
            raise RuntimeError("모델이 로드되지 않았습니다. initialize()를 먼저 호출하세요.")
        
        self.stats["total_requests"] += 1
        start_time = time.time()
        
        try:
            # 비동기 처리를 위해 스레드에서 실행
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None, 
                self._generate_sync, 
                prompt, max_tokens, temperature, top_p, top_k
            )
            
            processing_time = time.time() - start_time
            self.stats["total_processing_time"] += processing_time
            self.stats["successful_requests"] += 1
            
            logger.info(f"✅ 응답 생성 완료 ({processing_time:.2f}초)")
            return response
            
        except Exception as e:
            error_msg = f"응답 생성 실패: {str(e)}"
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
        """동기적 텍스트 생성 (내부 메서드)"""
        
        try:
            # 모델별 프롬프트 포맷팅 (DialoGPT vs Llama 구분)
            if "DialoGPT" in self.model_name:
                formatted_prompt = self._format_dialogpt_prompt(prompt)
                # DialoGPT 토큰 길이 제한 (더 보수적으로 설정)
                max_input_length = 200  # 매우 짧게 설정
                safe_max_tokens = min(max_tokens, 100)  # 안전한 출력 길이
            else:
                formatted_prompt = self._format_llama_prompt(prompt)
                max_input_length = 4000  # Llama 모델은 더 여유롭게
                safe_max_tokens = max_tokens
            
            # 입력 토큰 길이 체크 및 제한
            input_tokens = self.tokenizer.encode(formatted_prompt, return_tensors="pt")
            
            if input_tokens.shape[1] > max_input_length:
                logger.warning(f"입력 토큰 길이 초과 ({input_tokens.shape[1]} > {max_input_length}), 자르기 적용")
                # 뒤에서부터 자르기 (최근 대화 유지)
                truncated_tokens = input_tokens[:, -max_input_length:]
                formatted_prompt = self.tokenizer.decode(truncated_tokens[0], skip_special_tokens=True)
                logger.info(f"토큰 길이 조정: {input_tokens.shape[1]} → {max_input_length}")
            
            # 생성 파라미터
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
            
            # DialoGPT 전용 파라미터 추가
            if "DialoGPT" in self.model_name:
                generation_params["max_length"] = 1024  # 전체 길이 제한
            
            # 텍스트 생성
            outputs = self.generation_pipeline(
                formatted_prompt,
                **generation_params
            )
            
            # 응답 추출 및 후처리
            generated_text = outputs[0]["generated_text"]
            logger.info(f"🤖 DialoGPT 원본 출력: {repr(generated_text)}")
            
            cleaned_response = self._clean_response(generated_text, formatted_prompt)
            
            return cleaned_response
            
        except Exception as e:
            logger.error(f"동기 생성 실패: {e}")
            raise e
    
    def _format_llama_prompt(self, user_prompt: str) -> str:
        """Llama 모델용 프롬프트 포맷팅"""
        
        # Llama-2/3 Chat 템플릿 적용
        if "llama-2" in self.model_name.lower():
            formatted = f"<s>[INST] {user_prompt} [/INST]"
        elif "llama-3" in self.model_name.lower():
            formatted = f"<|begin_of_text|><|start_header_id|>user<|end_header_id|>\n\n{user_prompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n"
        else:
            # 기본 포맷
            formatted = f"Human: {user_prompt}\n\nAssistant: "
        
        return formatted
    
    def _format_dialogpt_prompt(self, user_prompt: str) -> str:
        """DialoGPT 모델용 프롬프트 포맷팅 (간단한 대화형)"""
        
        # DialoGPT를 위한 간단하지만 명확한 EFT 상담사 설정
        formatted = f"User: {user_prompt}{self.tokenizer.eos_token}EFT Counselor:"
        
        return formatted
    
    def _clean_response(self, generated_text: str, prompt: str) -> str:
        """응답 후처리 및 정리"""
        
        # 프롬프트 제거
        cleaned = generated_text
        
        # 특수 토큰 제거
        special_tokens = [
            "<|eot_id|>", "<|end_of_text|>", "</s>", 
            "<|start_header_id|>", "<|end_header_id|>",
            "[INST]", "[/INST]", "<s>"
        ]
        
        for token in special_tokens:
            cleaned = cleaned.replace(token, "")
        
        # 공백 정리
        cleaned = cleaned.strip()
        
        # 너무 긴 응답 자르기
        if len(cleaned) > 1500:
            sentences = cleaned.split('. ')
            cleaned = '. '.join(sentences[:5]) + '.'
        
        # 디버깅을 위한 로그 추가
        logger.info(f"🔍 생성된 원본 텍스트: {repr(generated_text)}")
        logger.info(f"🔍 정제된 텍스트: {repr(cleaned)}")
        
        # 빈 응답 처리
        if not cleaned:
            cleaned = "죄송합니다. 응답을 생성하는데 문제가 있었습니다. 다시 말씀해 주시겠어요?"
        
        return cleaned
    
    async def generate_stream(
        self, 
        message: str, 
        emotion_state: EmotionAnalysis
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """스트리밍 응답 생성 (긴 응답용)"""
        
        # TODO: 실제 스트리밍 구현
        # 현재는 청크로 나누어 시뮬레이션
        
        response = await self.generate_response(message)
        chunks = self._split_into_chunks(response, chunk_size=50)
        
        for i, chunk in enumerate(chunks):
            yield {
                "chunk_type": "text",
                "content": chunk,
                "sequence_number": i,
                "is_final": i == len(chunks) - 1
            }
            
            # 스트리밍 시뮬레이션을 위한 지연
            await asyncio.sleep(0.1)
    
    def _split_into_chunks(self, text: str, chunk_size: int = 50) -> List[str]:
        """텍스트를 청크로 분할"""
        words = text.split()
        chunks = []
        
        for i in range(0, len(words), chunk_size):
            chunk = ' '.join(words[i:i + chunk_size])
            chunks.append(chunk)
        
        return chunks
    
    async def get_performance_stats(self) -> ModelStats:
        """모델 성능 통계 반환"""
        
        uptime = time.time() - self.stats["start_time"]
        avg_response_time = (
            self.stats["total_processing_time"] / max(self.stats["successful_requests"], 1)
        )
        
        # 메모리 사용량 계산
        memory_usage = 0.0
        gpu_utilization = None
        
        try:
            if self.device == "cuda" and torch.cuda.is_available():
                memory_usage = torch.cuda.memory_allocated(0) / 1024**3
                
                # GPU 사용률 (옵션)
                try:
                    gpus = GPUtil.getGPUs()
                    if gpus:
                        gpu_utilization = gpus[0].load
                except:
                    pass
            else:
                # CPU 메모리 사용량 추정
                process = psutil.Process()
                memory_usage = process.memory_info().rss / 1024**3
                
        except Exception as e:
            logger.warning(f"메모리 사용량 계산 실패: {e}")
        
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
        """리소스 정리"""
        logger.info("🔄 AI 엔진 리소스 정리 중...")
        
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
            
            # 메모리 정리
            gc.collect()
            
            if self.device == "cuda" and torch.cuda.is_available():
                torch.cuda.empty_cache()
            
            logger.info("✅ 리소스 정리 완료")
            
        except Exception as e:
            logger.error(f"리소스 정리 실패: {e}")

# 전역 AI 엔진 인스턴스 (싱글톤)
_ai_engine_instance: Optional[EFTAIEngine] = None

def get_ai_engine() -> EFTAIEngine:
    """AI 엔진 인스턴스 반환 (싱글톤)"""
    global _ai_engine_instance
    if _ai_engine_instance is None:
        _ai_engine_instance = EFTAIEngine()
    return _ai_engine_instance