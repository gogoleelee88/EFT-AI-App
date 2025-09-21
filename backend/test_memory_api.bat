@echo off
chcp 65001 >nul
REM 메모리 통계 API 빠른 테스트 (Windows용)
REM 사용법: test_memory_api.bat [session_id]

set SESSION_ID=%1
if "%SESSION_ID%"=="" set SESSION_ID=TEST_SESSION

REM BASE_URL을 환경변수로 설정 가능 (스테이징/프로덕션 전환 편함)
if "%MEMORY_API_BASE_URL%"=="" (
  set BASE_URL=http://localhost:8000
) else (
  set BASE_URL=%MEMORY_API_BASE_URL%
)

echo 🔍 메모리 통계 API 테스트
echo Session ID: %SESSION_ID%
echo Base URL: %BASE_URL%
echo.

echo 1️⃣ 헬스체크...
curl -s "%BASE_URL%/health"
echo.
echo.

echo 2️⃣ 메모리 통계 조회...
REM PowerShell이 있으면 예쁘게, 없으면 그냥 출력
where powershell >nul 2>nul
if not errorlevel 1 (
  curl -s "%BASE_URL%/api/memory/%SESSION_ID%/stats" ^
  | powershell -NoProfile -Command "Get-Content -Raw | ConvertFrom-Json | ConvertTo-Json -Depth 8"
) else (
  curl -s "%BASE_URL%/api/memory/%SESSION_ID%/stats"
)
echo.
echo.

echo 🎯 테스트 완료!
echo.
echo 💡 jq가 있다면:  curl -s "%BASE_URL%/api/memory/%SESSION_ID%/stats" ^| jq .
echo 💡 환경변수 설정: set MEMORY_API_BASE_URL=https://your-api.com
echo.

:end
pause