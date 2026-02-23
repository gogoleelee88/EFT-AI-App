#!/usr/bin/env python3
"""
EFT AI 시스템 상태 체크
개발 환경 설정 및 의존성 확인
"""

import sys
import os
import subprocess
from pathlib import Path
# from typing import Tuple


# UTF-8 출력 설정
if sys.platform.startswith('win'):
    os.environ['PYTHONUTF8'] = '1'
    os.environ['PYTHONIOENCODING'] = 'utf-8'

def check_python_version():
    """Python 버전 체크"""
    version = sys.version_info
    print(f"Python 버전: {version.major}.{version.minor}.{version.micro}")

    if version.major == 3 and version.minor >= 8:
        print("   [OK] Python 버전 통과")
        return True
    else:
        print("   [ERROR] Python 3.8 이상 필요")
        return False

def check_project_structure():
    """프로젝트 구조 체크"""
    required_files = [
        "backend/__init__.py",
        "backend/main.py",
        "backend/config/settings.py",
        "backend/utils/logger.py",
        "backend/services/vllm_client.py",
        "backend/models/suds.py"
    ]

    print("📁 프로젝트 구조 체크:")
    all_good = True

    for file_path in required_files:
        if Path(file_path).exists():
            print(f"   ✅ {file_path}")
        else:
            print(f"   ❌ {file_path} (없음)")
            all_good = False

    return all_good

def check_dependencies():
    """주요 의존성 패키지 체크"""
    required_packages = [
        "fastapi",
        "uvicorn",
        "pydantic",
        "openai"
    ]

    print("📦 의존성 패키지 체크:")
    all_good = True

    for package in required_packages:
        try:
            __import__(package)
            print(f"   ✅ {package}")
        except ImportError:
            print(f"   ❌ {package} (설치 필요)")
            all_good = False

    return all_good

def check_import_paths():
    """레거시 임포트 체크"""
    print("🔍 레거시 임포트 스캔:")

    try:
        result = subprocess.run([
            "grep", "-REn",
            r"^[[:space:]]*(from|import)[[:space:]]+(services|models|routers|clients|config|utils)\b",
            "backend"
        ], capture_output=True, text=True, timeout=10)

        if result.returncode == 0 and result.stdout.strip():
            print(f"   ❌ 레거시 임포트 발견:")
            for line in result.stdout.strip().split('\n')[:5]:  # 최대 5개만 표시
                print(f"      {line}")
            print("   → backend.* 절대 임포트로 수정 필요")
            return False
        else:
            print("   ✅ 레거시 임포트 없음")
            return True

    except (subprocess.TimeoutExpired, FileNotFoundError):
        print("   ⚠️ grep 명령어 사용 불가 (수동 확인 필요)")
        return True

def check_compilation():
    """Python 컴파일 체크"""
    print("⚙️ Python 컴파일 체크:")

    try:
        result = subprocess.run([
            sys.executable, "-m", "compileall", "-q", "backend"
        ], capture_output=True, text=True, timeout=30)

        if result.returncode == 0:
            print("   ✅ 모든 파일 컴파일 성공")
            return True
        else:
            print(f"   ❌ 컴파일 오류:")
            if result.stderr:
                print(f"      {result.stderr}")
            return False

    except subprocess.TimeoutExpired:
        print("   ⚠️ 컴파일 시간 초과")
        return False

def check_environment():
    """환경변수 체크"""
    print("🌍 환경변수 체크:")

    env_vars = {
        "PYTHONUTF8": "1",
        "PYTHONIOENCODING": "utf-8"
    }

    all_good = True
    for var, expected in env_vars.items():
        current = os.environ.get(var)
        if current == expected:
            print(f"   ✅ {var}={current}")
        else:
            print(f"   ⚠️ {var}={current} (권장: {expected})")
            # 환경변수는 경고만, 실패로 처리하지 않음

    return all_good

def main():
    print("🔍 EFT AI 시스템 상태 체크")
    print("=" * 50)

    checks = [
        ("Python 버전", check_python_version),
        ("프로젝트 구조", check_project_structure),
        ("의존성 패키지", check_dependencies),
        ("레거시 임포트", check_import_paths),
        ("Python 컴파일", check_compilation),
        ("환경변수", check_environment)
    ]

    passed = 0
    total = len(checks)

    for name, check_func in checks:
        print()
        try:
            if check_func():
                passed += 1
        except Exception as e:
            print(f"   💥 체크 중 오류: {e}")

    print()
    print("=" * 50)
    print(f"📊 체크 결과: {passed}/{total} 통과")

    if passed == total:
        print("🎉 모든 체크 통과! 시스템이 정상 상태입니다.")
        print("💡 이제 'python run-dev.ps1' 또는 'run-dev.bat'로 서버를 시작할 수 있습니다.")
        return 0
    else:
        print("⚠️ 일부 항목에 문제가 있습니다. 위의 오류를 확인해주세요.")
        return 1

if __name__ == "__main__":
    try:
        exit_code = main()
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\n\n⏹️ 체크가 중단되었습니다.")
        sys.exit(1)