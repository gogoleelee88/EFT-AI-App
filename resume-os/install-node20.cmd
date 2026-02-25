@echo off
REM Node LTS(v20)로 전환 후 npm install
REM nvm-windows 가 설치되어 있어야 합니다.
REM 사용법: 이 파일이 있는 폴더(resume-os)에서 더블클릭 또는
REM        cmd 에서: cd resume-os && install-node20.cmd

cd /d "%~dp0"

echo [install-node20] nvm use 20 ...
call nvm use 20
if errorlevel 1 (
  echo [install-node20] nvm use 20 실패. nvm install 20 후 다시 시도하세요.
  pause
  exit /b 1
)

echo [install-node20] npm install 실행 중...
call npm install
if errorlevel 1 (
  echo [install-node20] npm install 실패.
  pause
  exit /b 1
)

echo [install-node20] 완료. 실행: npm start 또는 run-with-tflite.ps1
pause
