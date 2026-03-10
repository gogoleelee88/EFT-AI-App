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
set "AAPT2="

if not exist "%APK_SRC%" (
  echo [ERROR] APK not found: %APK_SRC%
  echo Build app first: cd .. && .\\gradlew assembleDebug
  pause
  exit /b 1
)

for /f "delims=" %%I in ('where /r "%LOCALAPPDATA%\\Android\\Sdk\\build-tools" aapt2.exe 2^>nul') do (
  set "AAPT2=%%I"
)

if "%AAPT2%"=="" (
  echo [ERROR] aapt2.exe not found under %LOCALAPPDATA%\Android\Sdk\build-tools
  echo Install Android Build-Tools or set SDK path properly.
  pause
  exit /b 1
)

echo.
echo [VERIFY] APK layout roots via aapt2
call :verify_layout_root "res/layout/fragment_home_tab.xml"
if errorlevel 1 goto :verify_failed
call :verify_layout_root "res/layout/fragment_add_alarm_tab.xml"
if errorlevel 1 goto :verify_failed
call :verify_layout_root "res/layout/fragment_my_page_tab.xml"
if errorlevel 1 goto :verify_failed

goto :verify_ok

:verify_failed
echo [ERROR] APK verification failed. Publish canceled.
pause
exit /b 1

:verify_ok
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

exit /b 0

:verify_layout_root
set "LAYOUT_FILE=%~1"
"%AAPT2%" dump xmltree --file "%LAYOUT_FILE%" "%APK_SRC%" | findstr /C:"E: FrameLayout" >nul
if errorlevel 1 (
  echo [FAIL] %LAYOUT_FILE% root is not FrameLayout
  exit /b 1
)
echo [OK] %LAYOUT_FILE% root = FrameLayout
exit /b 0
