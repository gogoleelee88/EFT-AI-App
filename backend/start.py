#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EFT AI ?ë² ?ì ?¤í¬ë¦½í¸
ê°ë°/?´ì ?ê²½???°ë¥¸ ?¤ì ?ë ?ì©
"""

import os
import sys
import argparse
import uvicorn
from pathlib import Path

# Windows ?ëì½ë ì¶ë¥ ë¬¸ì ?´ê²°
if sys.platform.startswith('win'):
    os.environ['PYTHONIOENCODING'] = 'utf-8'

# ?ì¬ ?ë?ë¦¬ë¥?Python ê²½ë¡??ì¶ê?
sys.path.append(str(Path(__file__).parent))

from config.settings import get_settings, get_development_settings, get_production_settings, apply_model_preset
from backend.utils.logger import get_logger

def parse_arguments():
    """ëªë¹???¸ì ?ì±"""
    parser = argparse.ArgumentParser(description="EFT AI ?ë² ?ì")
    
    parser.add_argument(
        "--env", 
        choices=["dev", "prod"], 
        default="dev",
        help="?¤í ?ê²½ (ê¸°ë³¸ê°? dev)"
    )
    
    parser.add_argument(
        "--host", 
        default=None,
        help="?ë² ?¸ì¤??(ê¸°ë³¸ê°? ?¤ì ?ì¼ ê°?"
    )
    
    parser.add_argument(
        "--port", 
        type=int, 
        default=None,
        help="?ë² ?¬í¸ (ê¸°ë³¸ê°? ?¤ì ?ì¼ ê°?"
    )
    
    parser.add_argument(
        "--model-preset",
        choices=["llama2-7b-quick", "llama3-8b-optimal", "llama3-70b-premium"],
        help="ëª¨ë¸ ?ë¦¬???í"
    )
    
    parser.add_argument(
        "--reload",
        action="store_true",
        help="?ë ?¬ë¡???ì±??(ê°ë°??"
    )
    
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="ë¡ê·¸ ?ë²¨ ?¤ë²?¼ì´??
    )
    
    return parser.parse_args()

def setup_environment(args):
    """?ê²½ ?¤ì"""
    
    # ?ê²½ë³??¤ì ë¡ë
    if args.env == "prod":
        settings = get_production_settings()
        print(" ?´ì ?ê²½?¼ë¡ ?ì?©ë??)
    else:
        settings = get_development_settings()
        print(" ê°ë° ?ê²½?¼ë¡ ?ì?©ë??)
    
    # ëª¨ë¸ ?ë¦¬???ì©
    if args.model_preset:
        settings = apply_model_preset(args.model_preset)
        print(f" ëª¨ë¸ ?ë¦¬???ì©: {args.model_preset}")
    
    # ëªë¹???¸ì ?¤ë²?¼ì´??    if args.host:
        settings.HOST = args.host
    
    if args.port:
        settings.PORT = args.port
    
    if args.log_level:
        settings.LOG_LEVEL = args.log_level
    
    return settings

def check_prerequisites():
    """?¬ì ?êµ¬?¬í ì²´í¬"""
    
    print(" ?¬ì ?êµ¬?¬í ì²´í¬ ì¤?..")
    
    # Python ë²ì ì²´í¬
    if sys.version_info < (3, 8):
        print("ERROR: Python 3.8 ?´ì???ì?©ë??)
        sys.exit(1)
    
    # ?ì ?ë?ë¦¬ ?ì±
    dirs_to_create = ["./logs", "./models", "./data"]
    for dir_path in dirs_to_create:
        Path(dir_path).mkdir(parents=True, exist_ok=True)
    
    # .env ?ì¼ ì²´í¬
    if not Path(".env").exists():
        print(" .env ?ì¼???ìµ?ë¤. .env.example??ì°¸ê³?ì¬ ?ì±?ì¸??)
        print("   ê¸°ë³¸ ?¤ì?¼ë¡ ê³ì ì§í?©ë??..")
    
    print("OK: ?¬ì ?êµ¬?¬í ì²´í¬ ?ë£")

def print_startup_info(settings):
    """?ì ?ë³´ ì¶ë¥"""
    
    print("\n" + "="*60)
    print("EFT AI ?ë² ?ì ?ë³´")
    print("="*60)
    print(f" ?ê²½: {'?´ì' if not settings.DEBUG else 'ê°ë°'}")
    print(f" ì£¼ì: http://{settings.HOST}:{settings.PORT}")
    print(f" ëª¨ë¸: {settings.MODEL_NAME}")
    print(f" ?ë°?´ì¤: {settings.DEVICE}")
    print(f" ë¡ê·¸: {settings.LOG_LEVEL} -> {settings.LOG_FILE}")
    
    if settings.DEBUG:
        print(f" API ë¬¸ì: http://{settings.HOST}:{settings.PORT}/docs")
        print(f" ReDoc: http://{settings.HOST}:{settings.PORT}/redoc")
    
    print("="*60)
    print()

def main():
    """ë©ì¸ ?¨ì"""
    
    # ëªë¹???¸ì ?ì±
    args = parse_arguments()
    
    # ?¬ì ?êµ¬?¬í ì²´í¬
    check_prerequisites()
    
    # ?ê²½ ?¤ì
    settings = setup_environment(args)
    
    # ?ì ?ë³´ ì¶ë¥
    print_startup_info(settings)
    
    # ?ë² ?¤í ?¤ì
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
        print(" ?ë²ë¥??ì?©ë??..")
        print("   ì¤ì??ë¤ë©?Ctrl+Cë¥??ë¥´?¸ì\n")
        
        # Uvicorn ?ë² ?ì
        uvicorn.run(**uvicorn_config)
        
    except KeyboardInterrupt:
        print("\n\n ?ë²ê° ?¬ì©?ì ?í´ ì¤ì??ì?µë??)
    except Exception as e:
        print(f"\nERROR: ?ë² ?ì ?¤í¨: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()

