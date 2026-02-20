#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EFT AI ?œë²„ ?œì‘ ?¤í¬ë¦½íŠ¸
ê°œë°œ/?´ì˜ ?˜ê²½???°ë¥¸ ?¤ì • ?ë™ ?ìš©
"""

import os
import sys
import argparse
import uvicorn
from pathlib import Path

# Windows ? ë‹ˆì½”ë“œ ì¶œë ¥ ë¬¸ì œ ?´ê²°
if sys.platform.startswith('win'):
    os.environ['PYTHONIOENCODING'] = 'utf-8'

# ?„ì¬ ?”ë ‰? ë¦¬ë¥?Python ê²½ë¡œ??ì¶”ê?
sys.path.append(str(Path(__file__).parent))

from config.settings import get_settings, get_development_settings, get_production_settings, apply_model_preset
from utils.logger import get_logger

def parse_arguments():
    """ëª…ë ¹???¸ìˆ˜ ?Œì‹±"""
    parser = argparse.ArgumentParser(description="EFT AI ?œë²„ ?œì‘")
    
    parser.add_argument(
        "--env", 
        choices=["dev", "prod"], 
        default="dev",
        help="?¤í–‰ ?˜ê²½ (ê¸°ë³¸ê°? dev)"
    )
    
    parser.add_argument(
        "--host", 
        default=None,
        help="?œë²„ ?¸ìŠ¤??(ê¸°ë³¸ê°? ?¤ì • ?Œì¼ ê°?"
    )
    
    parser.add_argument(
        "--port", 
        type=int, 
        default=None,
        help="?œë²„ ?¬íŠ¸ (ê¸°ë³¸ê°? ?¤ì • ?Œì¼ ê°?"
    )
    
    parser.add_argument(
        "--model-preset",
        choices=["llama2-7b-quick", "llama3-8b-optimal", "llama3-70b-premium"],
        help="ëª¨ë¸ ?„ë¦¬??? íƒ"
    )
    
    parser.add_argument(
        "--reload",
        action="store_true",
        help="?ë™ ?¬ë¡œ???œì„±??(ê°œë°œ??"
    )
    
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="ë¡œê·¸ ?ˆë²¨ ?¤ë²„?¼ì´??
    )
    
    return parser.parse_args()

def setup_environment(args):
    """?˜ê²½ ?¤ì •"""
    
    # ?˜ê²½ë³??¤ì • ë¡œë“œ
    if args.env == "prod":
        settings = get_production_settings()
        print(" ?´ì˜ ?˜ê²½?¼ë¡œ ?œì‘?©ë‹ˆ??)
    else:
        settings = get_development_settings()
        print(" ê°œë°œ ?˜ê²½?¼ë¡œ ?œì‘?©ë‹ˆ??)
    
    # ëª¨ë¸ ?„ë¦¬???ìš©
    if args.model_preset:
        settings = apply_model_preset(args.model_preset)
        print(f" ëª¨ë¸ ?„ë¦¬???ìš©: {args.model_preset}")
    
    # ëª…ë ¹???¸ìˆ˜ ?¤ë²„?¼ì´??    if args.host:
        settings.HOST = args.host
    
    if args.port:
        settings.PORT = args.port
    
    if args.log_level:
        settings.LOG_LEVEL = args.log_level
    
    return settings

def check_prerequisites():
    """?¬ì „ ?”êµ¬?¬í•­ ì²´í¬"""
    
    print(" ?¬ì „ ?”êµ¬?¬í•­ ì²´í¬ ì¤?..")
    
    # Python ë²„ì „ ì²´í¬
    if sys.version_info < (3, 8):
        print("ERROR: Python 3.8 ?´ìƒ???„ìš”?©ë‹ˆ??)
        sys.exit(1)
    
    # ?„ìš” ?”ë ‰? ë¦¬ ?ì„±
    dirs_to_create = ["./logs", "./models", "./data"]
    for dir_path in dirs_to_create:
        Path(dir_path).mkdir(parents=True, exist_ok=True)
    
    # .env ?Œì¼ ì²´í¬
    if not Path(".env").exists():
        print(" .env ?Œì¼???†ìŠµ?ˆë‹¤. .env.example??ì°¸ê³ ?˜ì—¬ ?ì„±?˜ì„¸??)
        print("   ê¸°ë³¸ ?¤ì •?¼ë¡œ ê³„ì† ì§„í–‰?©ë‹ˆ??..")
    
    print("OK: ?¬ì „ ?”êµ¬?¬í•­ ì²´í¬ ?„ë£Œ")

def print_startup_info(settings):
    """?œì‘ ?•ë³´ ì¶œë ¥"""
    
    print("\n" + "="*60)
    print("EFT AI ?œë²„ ?œì‘ ?•ë³´")
    print("="*60)
    print(f" ?˜ê²½: {'?´ì˜' if not settings.DEBUG else 'ê°œë°œ'}")
    print(f" ì£¼ì†Œ: http://{settings.HOST}:{settings.PORT}")
    print(f" ëª¨ë¸: {settings.MODEL_NAME}")
    print(f" ?”ë°”?´ìŠ¤: {settings.DEVICE}")
    print(f" ë¡œê·¸: {settings.LOG_LEVEL} -> {settings.LOG_FILE}")
    
    if settings.DEBUG:
        print(f" API ë¬¸ì„œ: http://{settings.HOST}:{settings.PORT}/docs")
        print(f" ReDoc: http://{settings.HOST}:{settings.PORT}/redoc")
    
    print("="*60)
    print()

def main():
    """ë©”ì¸ ?¨ìˆ˜"""
    
    # ëª…ë ¹???¸ìˆ˜ ?Œì‹±
    args = parse_arguments()
    
    # ?¬ì „ ?”êµ¬?¬í•­ ì²´í¬
    check_prerequisites()
    
    # ?˜ê²½ ?¤ì •
    settings = setup_environment(args)
    
    # ?œì‘ ?•ë³´ ì¶œë ¥
    print_startup_info(settings)
    
    # ?œë²„ ?¤í–‰ ?¤ì •
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
        print(" ?œë²„ë¥??œì‘?©ë‹ˆ??..")
        print("   ì¤‘ì??˜ë ¤ë©?Ctrl+Cë¥??„ë¥´?¸ìš”\n")
        
        # Uvicorn ?œë²„ ?œì‘
        uvicorn.run(**uvicorn_config)
        
    except KeyboardInterrupt:
        print("\n\n ?œë²„ê°€ ?¬ìš©?ì— ?˜í•´ ì¤‘ì??˜ì—ˆ?µë‹ˆ??)
    except Exception as e:
        print(f"\nERROR: ?œë²„ ?œì‘ ?¤íŒ¨: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
