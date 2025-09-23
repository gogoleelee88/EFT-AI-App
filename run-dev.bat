:: run-dev.bat
:: EFT AI 개발 서버 원클릭 실행 스크립트 (UTF-8 환경 + 리로드)

@echo off
chcp 65001 >NUL
echo 🚀 EFT AI 개발 서버 시작 중...

:: UTF-8 환경 설정
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

:: 프로젝트 루트로 이동
cd /d C:\Users\lco20\Desktop\EFT-AI-App

echo 📍 현재 위치: %CD%
echo 🔧 UTF-8 환경 설정 완료
echo 🌐 서버 주소: http://127.0.0.1:8000
echo 📚 API 문서: http://127.0.0.1:8000/docs
echo ❤️ 헬스체크: http://127.0.0.1:8000/health
echo.
echo ⚡ 서버 실행 중... (Ctrl+C로 종료)

:: uvicorn 서버 실행
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000