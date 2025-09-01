@echo off
REM Windows 시스템 레벨 UTF-8 환경 영구 설정
REM 관리자 권한으로 실행 필요

echo ================================================
echo Windows UTF-8 환경 영구 설정 (시스템 레벨)
echo ================================================
echo.

echo 🔧 시스템 환경변수 설정 중...

REM 사용자 환경변수에 영구 등록
setx PYTHONUTF8 "1"
setx PYTHONIOENCODING "utf-8"
setx HF_HUB_DISABLE_SYMLINKS_WARNING "1"

echo.
echo ✅ 설정 완료! 다음 환경변수가 영구 등록되었습니다:
echo    - PYTHONUTF8=1
echo    - PYTHONIOENCODING=utf-8  
echo    - HF_HUB_DISABLE_SYMLINKS_WARNING=1
echo.
echo 💡 이제 모든 Python 프로그램이 UTF-8 환경에서 실행됩니다.
echo 💡 새로운 CMD 창을 열거나 재부팅 후 적용됩니다.
echo.

pause