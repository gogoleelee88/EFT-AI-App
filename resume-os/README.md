# 실행 복귀 OS (Resume OS)

Electron + SQLite 기반 데스크톱 에이전트. 하이브리드 행동 인식(커스텀 패턴 + TFLite) 지원.

## Node 버전 (LTS v20 권장)

iohook 등 네이티브 모듈 호환을 위해 **Node LTS v20** 사용을 권장합니다.

### 1) nvm-windows 사용 시

```cmd
cd resume-os
nvm use 20
npm install
npm start
```

또는 **install-node20.cmd** 더블클릭(또는 `install-node20.cmd` 실행) → Node 20 전환 후 `npm install` 자동 실행.

### 2) fnm 사용 시

```powershell
cd resume-os
fnm use 20
npm install
npm start
```

### 3) .nvmrc

프로젝트 루트에 `.nvmrc`(내용: `20`)가 있으므로, `nvm use` 또는 `fnm use`만 실행하면 자동으로 v20을 사용합니다.

## TFLite 모델로 실행

1. `activity_model.tflite`, `activity_labels.json` 경로를 **run-with-tflite.ps1** 안에서 수정.
2. Node 20 환경에서:

```powershell
.\run-with-tflite.ps1
```

또는 환경변수 설정 후:

```powershell
$env:RESUME_OS_TFLITE_MODEL = "C:\path\to\activity_model.tflite"
$env:RESUME_OS_TFLITE_LABELS = "C:\path\to\activity_labels.json"
npm start
```

## 스크립트 요약

| 파일 | 설명 |
|------|------|
| `install-node20.cmd` | nvm use 20 후 npm install (CMD) |
| `install-node20.ps1` | nvm/fnm use 후 npm install (PowerShell) |
| `run-with-tflite.ps1` | TFLite 경로 설정 후 npm start |
