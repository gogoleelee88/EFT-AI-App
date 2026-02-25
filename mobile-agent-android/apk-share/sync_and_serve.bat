@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "HOST_IP="
for /f "delims=" %%I in ('powershell -NoProfile -Command "& { $cfg = Get-NetIPConfiguration | Where-Object { $_.IPv4Address -ne $null -and $_.NetProfile.Name -notmatch 'Loopback' -and $_.IPv4DefaultGateway -ne $null } | Select-Object -First 1; if ($cfg -and $cfg.IPv4Address) { $cfg.IPv4Address.IPAddress } else { $fallback = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.AddressState -eq 'Preferred' -and $_.IPAddress -and $_.IPAddress -notmatch '^127\\.' -and $_.IPAddress -notmatch '^169\\.' } | Sort-Object -Property InterfaceIndex | Select-Object -First 1 -ExpandProperty IPAddress; if ($fallback) { $fallback } } }"') do set "HOST_IP=%%I"

if "%HOST_IP%"=="" (
  echo [ERROR] No usable IPv4 address found. Check network adapter.
  pause
  exit /b 1
)

set "PORT=8787"
set "APK_SRC=%~dp0..\\app\\build\\outputs\\apk\\debug\\app-debug.apk"
set "APK_DST=latest.apk"

if not exist "%APK_SRC%" (
  echo [ERROR] APK not found: %APK_SRC%
  echo Build app first: cd .. && .\\gradlew assembleDebug
  pause
  exit /b 1
)

copy /Y "%APK_SRC%" "%APK_DST%" >nul
if errorlevel 1 (
  echo [ERROR] copy failed.
  pause
  exit /b 1
)

echo.
echo copied: %APK_SRC%
echo to     : %~dp0%APK_DST%
echo.
echo Serving APK at: http://%HOST_IP%:%PORT%/latest.apk

echo Press Ctrl+C to stop server.
python -m http.server %PORT% --bind 0.0.0.0
