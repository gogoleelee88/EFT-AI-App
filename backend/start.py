#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EFT AI 서버 시작 스크립트
개발/운영 환경에 따른 설정 자동 적용
"""

import os
import sys
import argparse
import uvicorn
from pathlib import Path

# Windows 유니코드 출력 문제 해결
if sys.platform.startswith('win'):
    os.environ['PYTHONIOENCODING'] = 'utf-8'

# 현재 디렉토리를 Python 경로에 추가
sys.path.append(str(Path(__file__).parent))

from config.settings import get_settings, get_development_settings, get_production_settings, apply_model_preset
from utils.logger import get_logger

def parse_arguments():
    """명령행 인수 파싱"""
    parser = argparse.ArgumentParser(description="EFT AI 서버 시작")
    
    parser.add_argument(
        "--env", 
        choices=["dev", "prod"], 
        default="dev",
        help="실행 환경 (기본값: dev)"
    )
    
    parser.add_argument(
        "--host", 
        default=None,
        help="서버 호스트 (기본값: 설정 파일 값)"
    )
    
    parser.add_argument(
        "--port", 
        type=int, 
        default=None,
        help="서버 포트 (기본값: 설정 파일 값)"
    )
    
    parser.add_argument(
        "--model-preset",
        choices=["llama2-7b-quick", "llama3-8b-optimal", "llama3-70b-premium"],
        help="모델 프리셋 선택"
    )
    
    parser.add_argument(
        "--reload",
        action="store_true",
        help="자동 재로드 활성화 (개발용)"
    )
    
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="로그 레벨 오버라이드"
    )
    
    return parser.parse_args()

def setup_environment(args):
    """환경 설정"""
    
    # 환경별 설정 로드
    if args.env == "prod":
        settings = get_production_settings()
        print(" 운영 환경으로 시작합니다")
    else:
        settings = get_development_settings()
        print(" 개발 환경으로 시작합니다")
    
    # 모델 프리셋 적용
    if args.model_preset:
        settings = apply_model_preset(args.model_preset)
        print(f" 모델 프리셋 적용: {args.model_preset}")
    
    # 명령행 인수 오버라이드
    if args.host:
        settings.HOST = args.host
    
    if args.port:
        settings.PORT = args.port
    
    if args.log_level:
        settings.LOG_LEVEL = args.log_level
    
    return settings

def check_prerequisites():
    """사전 요구사항 체크"""
    
    print(" 사전 요구사항 체크 중...")
    
    # Python 버전 체크
    if sys.version_info < (3, 8):
        print("ERROR: Python 3.8 이상이 필요합니다")
        sys.exit(1)
    
    # 필요 디렉토리 생성
    dirs_to_create = ["./logs", "./models", "./data"]
    for dir_path in dirs_to_create:
        Path(dir_path).mkdir(parents=True, exist_ok=True)
    
    # .env 파일 체크
    if not Path(".env").exists():
        print(" .env 파일이 없습니다. .env.example을 참고하여 생성하세요")
        print("   기본 설정으로 계속 진행합니다...")
    
    print("OK: 사전 요구사항 체크 완료")

def print_startup_info(settings):
    """시작 정보 출력"""
    
    print("\n" + "="*60)
    print("EFT AI 서버 시작 정보")
    print("="*60)
    print(f" 환경: {'운영' if not settings.DEBUG else '개발'}")
    print(f" 주소: http://{settings.HOST}:{settings.PORT}")
    print(f" 모델: {settings.MODEL_NAME}")
    print(f" 디바이스: {settings.DEVICE}")
    print(f" 로그: {settings.LOG_LEVEL} -> {settings.LOG_FILE}")
    
    if settings.DEBUG:
        print(f" API 문서: http://{settings.HOST}:{settings.PORT}/docs")
        print(f" ReDoc: http://{settings.HOST}:{settings.PORT}/redoc")
    
    print("="*60)
    print()

def main():
    """메인 함수"""
    
    # 명령행 인수 파싱
    args = parse_arguments()
    
    # 사전 요구사항 체크
    check_prerequisites()
    
    # 환경 설정
    settings = setup_environment(args)
    
    # 시작 정보 출력
    print_startup_info(settings)
    
    # 서버 실행 설정
    uvicorn_config = {
        "app": "main:app",
        "host": settings.HOST,
        "port": settings.PORT,
        "log_level": settings.LOG_LEVEL.lower(),
        "access_log": settings.DEBUG,
        "reload": args.reload or settings.DEBUG,
        "reload_dirs": ["./"] if args.reload else None
    }
    
    try:
        print(" 서버를 시작합니다...")
        print("   중지하려면 Ctrl+C를 누르세요\n")
        
        # Uvicorn 서버 시작
        uvicorn.run(**uvicorn_config)
        
    except KeyboardInterrupt:
        print("\n\n 서버가 사용자에 의해 중지되었습니다")
    except Exception as e:
        print(f"\nERROR: 서버 시작 실패: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()