"""
로깅 유틸리티
EFT AI 서버용 구조화된 로깅 시스템
"""

import logging
import sys
from pathlib import Path
from typing import Optional
from datetime import datetime
import json

# Windows 유니코드 출력 문제 해결
if sys.platform.startswith('win'):
    import os
    os.environ['PYTHONIOENCODING'] = 'utf-8'

from config.settings import get_settings

settings = get_settings()

class ColoredFormatter(logging.Formatter):
    """컬러 로그 포매터"""
    
    # ANSI 색상 코드
    COLORS = {
        'DEBUG': '\033[36m',    # 청록
        'INFO': '\033[32m',     # 초록
        'WARNING': '\033[33m',  # 노랑
        'ERROR': '\033[31m',    # 빨강
        'CRITICAL': '\033[35m', # 자주
        'RESET': '\033[0m'      # 리셋
    }
    
    def format(self, record):
        # 기본 포맷팅
        formatted = super().format(record)
        
        # 색상 적용
        color = self.COLORS.get(record.levelname, self.COLORS['RESET'])
        reset = self.COLORS['RESET']
        
        return f"{color}{formatted}{reset}"

class StructuredFormatter(logging.Formatter):
    """구조화된 JSON 로그 포매터"""
    
    def format(self, record):
        log_data = {
            'timestamp': datetime.fromtimestamp(record.created).isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'module': record.module,
            'function': record.funcName,
            'line': record.lineno
        }
        
        # 예외 정보 추가
        if record.exc_info:
            log_data['exception'] = self.formatException(record.exc_info)
        
        # 추가 컨텍스트 정보 (있는 경우)
        if hasattr(record, 'user_id'):
            log_data['user_id'] = record.user_id
        
        if hasattr(record, 'session_id'):
            log_data['session_id'] = record.session_id
        
        if hasattr(record, 'request_id'):
            log_data['request_id'] = record.request_id
        
        return json.dumps(log_data, ensure_ascii=False)

def setup_logging():
    """로깅 시스템 설정"""
    
    # 로그 디렉토리 생성
    log_dir = Path(settings.LOG_FILE).parent
    log_dir.mkdir(parents=True, exist_ok=True)
    
    # 루트 로거 설정
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, settings.LOG_LEVEL.upper()))
    
    # 기존 핸들러 제거 (중복 방지)
    root_logger.handlers.clear()
    
    # 1. 콘솔 핸들러 (컬러 출력)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    
    console_format = ColoredFormatter(
        fmt='%(asctime)s | %(levelname)-8s | %(name)-20s | %(message)s',
        datefmt='%H:%M:%S'
    )
    console_handler.setFormatter(console_format)
    root_logger.addHandler(console_handler)
    
    # 2. 파일 핸들러 (일반 텍스트)
    file_handler = logging.FileHandler(
        settings.LOG_FILE, 
        mode='a', 
        encoding='utf-8'
    )
    file_handler.setLevel(getattr(logging, settings.LOG_LEVEL.upper()))
    
    file_format = logging.Formatter(
        fmt='%(asctime)s | %(levelname)-8s | %(name)-30s | %(funcName)-15s:%(lineno)-4d | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    file_handler.setFormatter(file_format)
    root_logger.addHandler(file_handler)
    
    # 3. JSON 로그 파일 (구조화된 로그)
    json_log_file = settings.LOG_FILE.replace('.log', '_structured.jsonl')
    json_handler = logging.FileHandler(
        json_log_file,
        mode='a',
        encoding='utf-8'
    )
    json_handler.setLevel(logging.INFO)
    json_handler.setFormatter(StructuredFormatter())
    root_logger.addHandler(json_handler)
    
    # 외부 라이브러리 로그 레벨 조정
    logging.getLogger('transformers').setLevel(logging.WARNING)
    logging.getLogger('torch').setLevel(logging.WARNING)
    logging.getLogger('accelerate').setLevel(logging.WARNING)
    logging.getLogger('urllib3').setLevel(logging.WARNING)
    logging.getLogger('httpx').setLevel(logging.WARNING)
    
    # 시작 로그 (Windows 호환)
    logger = logging.getLogger(__name__)
    logger.info("EFT AI 서버 로깅 시스템 초기화 완료")
    logger.info(f"로그 파일: {settings.LOG_FILE}")
    logger.info(f"로그 레벨: {settings.LOG_LEVEL}")

def get_logger(name: str, context: Optional[dict] = None) -> logging.Logger:
    """
    컨텍스트 정보를 포함한 로거 반환
    
    Args:
        name: 로거 이름 (일반적으로 __name__)
        context: 추가 컨텍스트 정보
    
    Returns:
        설정된 로거 인스턴스
    """
    
    logger = logging.getLogger(name)
    
    # 컨텍스트 정보 추가 (있는 경우)
    if context:
        # 로거에 컨텍스트 정보 저장
        for key, value in context.items():
            setattr(logger, key, value)
    
    return logger

class LogContext:
    """로그 컨텍스트 관리자"""
    
    def __init__(self, logger: logging.Logger, **context):
        self.logger = logger
        self.context = context
        self.original_context = {}
    
    def __enter__(self):
        # 기존 컨텍스트 백업
        for key in self.context:
            if hasattr(self.logger, key):
                self.original_context[key] = getattr(self.logger, key)
        
        # 새로운 컨텍스트 적용
        for key, value in self.context.items():
            setattr(self.logger, key, value)
        
        return self.logger
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        # 원래 컨텍스트 복원
        for key in self.context:
            if key in self.original_context:
                setattr(self.logger, key, self.original_context[key])
            else:
                delattr(self.logger, key)

# 로깅 시스템 초기화
setup_logging()

# 편의 함수들
def log_api_request(logger: logging.Logger, method: str, endpoint: str, user_id: str = None):
    """API 요청 로깅"""
    with LogContext(logger, user_id=user_id):
        logger.info(f"📨 API 요청: {method} {endpoint}")

def log_ai_generation(logger: logging.Logger, input_tokens: int, output_tokens: int, duration: float):
    """AI 생성 로깅"""
    logger.info(f"🤖 AI 생성 완료: 입력 {input_tokens} 토큰, 출력 {output_tokens} 토큰, 소요 {duration:.2f}초")

def log_error_with_context(logger: logging.Logger, error: Exception, context: dict = None):
    """컨텍스트와 함께 에러 로깅"""
    error_msg = f"❌ 오류 발생: {str(error)}"
    
    if context:
        context_str = ", ".join(f"{k}={v}" for k, v in context.items())
        error_msg += f" | 컨텍스트: {context_str}"
    
    logger.error(error_msg, exc_info=True)

def log_performance_metric(logger: logging.Logger, metric_name: str, value: float, unit: str = ""):
    """성능 메트릭 로깅"""
    logger.info(f"📊 성능 메트릭: {metric_name} = {value:.3f} {unit}")

# 로거 테스트 함수
def test_logging():
    """로깅 시스템 테스트"""
    logger = get_logger(__name__)
    
    logger.debug("🔍 디버그 메시지")
    logger.info("ℹ️ 정보 메시지")
    logger.warning("⚠️ 경고 메시지")
    logger.error("❌ 에러 메시지")
    
    # 컨텍스트와 함께 로깅
    with LogContext(logger, user_id="test_user", session_id="test_session"):
        logger.info("📝 컨텍스트가 포함된 로그 메시지")
    
    logger.info("✅ 로깅 시스템 테스트 완료")

if __name__ == "__main__":
    test_logging()