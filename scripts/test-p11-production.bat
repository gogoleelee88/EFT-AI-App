@echo off
REM P11 Production Smoke Test Runner
REM 운영 환경 배포 후 검증용

echo.
echo ==========================================
echo P11 Production Smoke Test
echo ==========================================
echo.

REM Python 환경 확인
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python이 설치되어 있지 않습니다.
    exit /b 1
)

REM API_BASE_URL 환경변수 설정 (운영 서버)
set API_BASE_URL=https://api.moodtalk.app

echo [INFO] API URL: %API_BASE_URL%
echo [WARNING] This will test PRODUCTION environment!
echo.
pause

REM 테스트 실행
python "%~dp0smoke-test-p11.py"

REM 결과 코드 반환
exit /b %errorlevel%
