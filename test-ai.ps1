# EFT AI 연결 테스트 스크립트 (UTF-8)
# PowerShell에서 직접 실행: powershell -ExecutionPolicy Bypass -File .\test-ai.ps1

# ── 이모지 헬퍼 함수 ────────────────────────────────────────────────────────
function EH($emoji, $text) {
    return "`n$emoji $text"
}

# ── 공통 설정 ────────────────────────────────────────────────────────────────────────────────
$BaseUrl = "http://localhost:8000"
$JsonHeaders = @{ 'Content-Type' = 'application/json; charset=utf-8' }

Write-Host (EH "🤖" "EFT AI 연결 테스트 시작...") -ForegroundColor Green

# 1) 서버 헬스 체크
Write-Host (EH "📋" "서버 상태 확인 중...") -ForegroundColor Yellow
try {
    $healthResponse = Invoke-RestMethod -Uri "$BaseUrl/health" -Method GET -TimeoutSec 10
    Write-Host "✅ 서버 상태 확인 성공!" -ForegroundColor Green
    Write-Host "상태: $($healthResponse.status)" -ForegroundColor White
    Write-Host "무료 모델: $($healthResponse.free_ai_engine)" -ForegroundColor White
    Write-Host "프리미엄 모델: $($healthResponse.premium_ai_engine)" -ForegroundColor White
    if ($healthResponse.available_tiers) {
        Write-Host "사용 가능한 티어: $($healthResponse.available_tiers -join ', ')" -ForegroundColor White
    }
} catch {
    Write-Host "❌ 서버 헬스 체크 실패: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "서버가 실행 중인지 확인해주세요." -ForegroundColor Yellow
    return
}

# 2) 무료 모델 테스트
Write-Host (EH "🆓" "무료 모델 테스트 중...") -ForegroundColor Yellow
try {
    $freeBody = @{
        message     = "안녕하세요, 무료 모델 연결 테스트입니다"
        max_tokens  = 150
        temperature = 0.7
    } | ConvertTo-Json -Depth 5

    $freeResponse = Invoke-RestMethod -Uri "$BaseUrl/api/chat/free" -Method POST -Body $freeBody -Headers $JsonHeaders -TimeoutSec 30
    Write-Host "✅ 무료 모델 응답 성공!" -ForegroundColor Green
    Write-Host "응답: $($freeResponse.response)" -ForegroundColor White
    if ($freeResponse.processing_time) { Write-Host "처리 시간: $($freeResponse.processing_time)초" -ForegroundColor Gray }
    if ($freeResponse.tier)            { Write-Host "티어: $($freeResponse.tier)" -ForegroundColor Gray }
} catch {
    Write-Host "❌ 무료 모델 테스트 실패: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "HTTP 상태 코드: $statusCode" -ForegroundColor Red
    }
}

# 3) 프리미엄 모델 테스트
Write-Host (EH "💎" "프리미엄 모델 테스트 중...") -ForegroundColor Yellow
try {
    $premiumBody = @{
        message     = "안녕하세요, 프리미엄 Llama 3.1 모델 연결 테스트입니다"
        max_tokens  = 200
        temperature = 0.7
    } | ConvertTo-Json -Depth 5

    $premiumResponse = Invoke-RestMethod -Uri "$BaseUrl/api/chat/premium" -Method POST -Body $premiumBody -Headers $JsonHeaders -TimeoutSec 60
    Write-Host "✅ 프리미엄 모델 응답 성공!" -ForegroundColor Green
    Write-Host "응답: $($premiumResponse.response)" -ForegroundColor White
    if ($premiumResponse.processing_time) { Write-Host "처리 시간: $($premiumResponse.processing_time)초" -ForegroundColor Gray }
    if ($premiumResponse.tier)            { Write-Host "티어: $($premiumResponse.tier)" -ForegroundColor Gray }
} catch {
    Write-Host "❌ 프리미엄 모델 테스트 실패: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "HTTP 상태 코드: $statusCode" -ForegroundColor Red
    }
}

# 4) 기본 엔드포인트 테스트
Write-Host (EH "🔄" "기본 엔드포인트 테스트 중...") -ForegroundColor Yellow
try {
    $basicBody = @{
        message     = "기본 엔드포인트 연결 확인"
        max_tokens  = 100
        temperature = 0.7
    } | ConvertTo-Json -Depth 5

    $basicResponse = Invoke-RestMethod -Uri "$BaseUrl/api/chat" -Method POST -Body $basicBody -Headers $JsonHeaders -TimeoutSec 30
    Write-Host "✅ 기본 엔드포인트 응답 성공!" -ForegroundColor Green
    Write-Host "응답: $($basicResponse.response)" -ForegroundColor White
    if ($basicResponse.processing_time) { Write-Host "처리 시간: $($basicResponse.processing_time)초" -ForegroundColor Gray }
} catch {
    Write-Host "❌ 기본 엔드포인트 테스트 실패: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "HTTP 상태 코드: $statusCode" -ForegroundColor Red
    }
}

Write-Host (EH "🎉" "테스트 완료!") -ForegroundColor Green
Write-Host "결과를 확인해보세요." -ForegroundColor Cyan