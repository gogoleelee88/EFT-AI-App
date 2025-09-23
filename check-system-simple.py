#!/usr/bin/env python3
"""
EFT AI 시스템 상태 체크 (간단 버전)
개발 환경 설정 및 의존성 확인
"""

import sys
import os
import subprocess
from pathlib import Path

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
    ]

    print("프로젝트 구조 체크:")
    all_good = True

    for file_path in required_files:
        if Path(file_path).exists():
            print(f"   [OK] {file_path}")
        else:
            print(f"   [ERROR] {file_path} (없음)")
            all_good = False

    return all_good

def check_compilation():
    """Python 컴파일 체크"""
    print("Python 컴파일 체크:")

    try:
        result = subprocess.run([
            sys.executable, "-m", "compileall", "-q", "backend"
        ], capture_output=True, text=True, timeout=30)

        if result.returncode == 0:
            print("   [OK] 모든 파일 컴파일 성공")
            return True
        else:
            print(f"   [ERROR] 컴파일 오류:")
            if result.stderr:
                print(f"      {result.stderr}")
            return False

    except subprocess.TimeoutExpired:
        print("   [WARNING] 컴파일 시간 초과")
        return False

def main():
    print("EFT AI 시스템 상태 체크")
    print("=" * 50)

    checks = [
        ("Python 버전", check_python_version),
        ("프로젝트 구조", check_project_structure),
        ("Python 컴파일", check_compilation),
    ]

    passed = 0
    total = len(checks)

    for name, check_func in checks:
        print()
        try:
            if check_func():
                passed += 1
        except Exception as e:
            print(f"   [ERROR] 체크 중 오류: {e}")

    print()
    print("=" * 50)
    print(f"체크 결과: {passed}/{total} 통과")

    if passed == total:
        print("모든 체크 통과! 시스템이 정상 상태입니다.")
        print("이제 run-dev.ps1 또는 run-dev.bat로 서버를 시작할 수 있습니다.")
        return 0
    else:
        print("일부 항목에 문제가 있습니다. 위의 오류를 확인해주세요.")
        return 1

if __name__ == "__main__":
    try:
        exit_code = main()
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\n체크가 중단되었습니다.")
        sys.exit(1)