#Requires -Version 7
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

$base = "http://localhost:8000"
$endpoint = "$base/api/chat/completion"
$headersFree = @{ "x-user-tier" = "free" }      # 무료 티어 강제
$headersA    = @{ "x-user-tier" = "free"; "x-free-engine" = "engine_a" }
$headersB    = @{ "x-user-tier" = "free"; "x-free-engine" = "engine_b" }

function Bar([string]$label){
  $bar = ("=" * 60)
  Write-Host ""
  Write-Host $bar
  Write-Host ("[ " + $label + " ]")
  Write-Host $bar
}

Bar "Health"
try {
    Invoke-RestMethod -Uri "$base/health" -Method GET | ConvertTo-Json -Depth 5
} catch {
    Write-Host "Health check failed: $($_.Exception.Message)" -ForegroundColor Red
    return
}

Bar "Round Robin x 4 (free tier)"
1..4 | ForEach-Object {
  try {
    $body = @{ message = "간단한 인사 $_" } | ConvertTo-Json -Depth 5
    $res = Invoke-RestMethod -Uri $endpoint -Method POST -Headers $headersFree -Body $body -ContentType "application/json"
    "{0}. engine={1} model={2} reply={3}" -f $_, $res.engine, $res.model, $res.reply.Substring(0, [Math]::Min(60,$res.reply.Length))
  } catch {
    Write-Host "$_. FAILED: $($_.Exception.Message)" -ForegroundColor Red
  }
}

Bar "Force engine_a"
try {
    $body = @{ message = "엔진 A만 사용" } | ConvertTo-Json -Depth 5
    Invoke-RestMethod -Uri $endpoint -Method POST -Headers $headersA -Body $body -ContentType "application/json" | ConvertTo-Json -Depth 5
} catch {
    Write-Host "Engine A test failed: $($_.Exception.Message)" -ForegroundColor Red
}

Bar "Force engine_b"
try {
    $body = @{ message = "엔진 B만 사용" } | ConvertTo-Json -Depth 5
    Invoke-RestMethod -Uri $endpoint -Method POST -Headers $headersB -Body $body -ContentType "application/json" | ConvertTo-Json -Depth 5
} catch {
    Write-Host "Engine B test failed: $($_.Exception.Message)" -ForegroundColor Red
}