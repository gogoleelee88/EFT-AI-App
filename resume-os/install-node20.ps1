# Node LTS(v20)로 전환 후 npm install 실행
# 사용법: PowerShell에서 nvm 또는 fnm이 PATH에 있는 터미널에서 실행
#   cd resume-os
#   .\install-node20.ps1

$ErrorActionPreference = "Stop"

# .nvmrc 에서 버전 읽기 (20)
$expectedVersion = "20"
if (Test-Path ".nvmrc") {
  $expectedVersion = (Get-Content ".nvmrc" -Raw).Trim()
}

Write-Host "[install-node20] Node $expectedVersion 사용 후 npm install 실행합니다."

# nvm-windows
if (Get-Command nvm -ErrorAction SilentlyContinue) {
  Write-Host "[install-node20] nvm use $expectedVersion"
  nvm use $expectedVersion
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[install-node20] nvm use 실패. 'nvm install $expectedVersion' 후 다시 시도하세요."
    exit 1
  }
}
# fnm
elseif (Get-Command fnm -ErrorAction SilentlyContinue) {
  Write-Host "[install-node20] fnm use $expectedVersion"
  & fnm env --use-on-cd | Out-String | Invoke-Expression
  fnm use $expectedVersion
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[install-node20] fnm use 실패. 'fnm install $expectedVersion' 후 다시 시도하세요."
    exit 1
  }
}
else {
  Write-Host "[install-node20] nvm 또는 fnm이 없습니다. Node $expectedVersion 이 설치된 터미널에서 수동으로 npm install 하세요."
  $v = node -v 2>$null
  Write-Host "[install-node20] 현재 node: $v"
}

Write-Host "[install-node20] npm install 실행 중..."
npm install
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "[install-node20] 완료. 실행: npm start 또는 .\run-with-tflite.ps1"
