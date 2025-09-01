@echo off
REM EFT AI 서버 UTF-8 환경 실행 스크립트
REM 근본적 인코딩 해결을 위한 배치파일

echo ================================================
echo EFT AI 서버 UTF-8 환경 실행
echo ================================================
echo.

REM Python 전역 UTF-8 환경 설정 (근본 해결!)
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
set LC_ALL=en_US.UTF-8

REM HuggingFace 캐시 심볼링크 경고 비활성화
set HF_HUB_DISABLE_SYMLINKS_WARNING=1

echo ✅ Python UTF-8 환경 설정 완료
echo    - PYTHONUTF8=1 (Python 인터프리터 전체 UTF-8)
echo    - PYTHONIOENCODING=utf-8 (I/O 스트림 UTF-8)
echo    - LC_ALL=en_US.UTF-8 (로케일 UTF-8)
echo.

echo 🚀 EFT AI 서버 실행 중...
python start.py

echo.
echo 서버가 종료되었습니다.
pause