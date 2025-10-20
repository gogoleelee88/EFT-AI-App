@echo off
REM P11 Local Smoke Test Runner
REM 로컬 환경에서 P11 기능을 빠르게 테스트

echo.
echo ==========================================
echo P11 Local Smoke Test
echo ==========================================
echo.

REM Python 환경 확인
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python이 설치되어 있지 않습니다.
    exit /b 1
)

REM API_BASE_URL 환경변수 설정
set API_BASE_URL=http://localhost:8000

echo [INFO] API URL: %API_BASE_URL%
echo.

REM 테스트 실행
python "%~dp0smoke-test-p11.py"

REM 결과 코드 반환
exit /b %errorlevel%
