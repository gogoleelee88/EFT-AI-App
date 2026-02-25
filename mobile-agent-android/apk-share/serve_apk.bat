@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "HOST_IP="
for /f "delims=" %%I in ('powershell -NoProfile -Command "& { $cfg = Get-NetIPConfiguration | Where-Object { $_.IPv4Address -ne $null -and $_.NetProfile.Name -notmatch 'Loopback' -and $_.IPv4DefaultGateway -ne $null } | Select-Object -First 1; if ($cfg -and $cfg.IPv4Address) { $cfg.IPv4Address.IPAddress } else { $fallback = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.AddressState -eq 'Preferred' -and $_.IPAddress -and $_.IPAddress -notmatch '^127\\.' -and $_.IPAddress -notmatch '^169\\.' } | Sort-Object -Property InterfaceIndex | Select-Object -First 1 -ExpandProperty IPAddress; if ($fallback) { $fallback } } }"') do set "HOST_IP=%%I"

if "%HOST_IP%"=="" (
  echo [ERROR] No usable IPv4 address found. Check network adapter.
  pause
  exit /b 1
)

echo APK 배포 루트: %CD%
echo 배포 주소: http://%HOST_IP%:8787
python -m http.server 8787 --bind 0.0.0.0
pause
