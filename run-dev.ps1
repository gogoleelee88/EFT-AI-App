# run-dev.ps1
# EFT AI 개발 서버 원클릭 실행 스크립트 (UTF-8 환경 + 리로드)

Write-Host "🚀 EFT AI 개발 서버 시작 중..." -ForegroundColor Green

# UTF-8 환경 설정
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::UTF8
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

# 프로젝트 루트로 이동
Set-Location "C:\Users\lco20\Desktop\EFT-AI-App"

Write-Host "📍 현재 위치: $(Get-Location)" -ForegroundColor Yellow
Write-Host "🔧 UTF-8 환경 설정 완료" -ForegroundColor Green
Write-Host "🌐 서버 주소: http://127.0.0.1:8000" -ForegroundColor Cyan
Write-Host "📚 API 문서: http://127.0.0.1:8000/docs" -ForegroundColor Cyan
Write-Host "❤️ 헬스체크: http://127.0.0.1:8000/health" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚡ 서버 실행 중... (Ctrl+C로 종료)" -ForegroundColor Yellow

# uvicorn 서버 실행
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000