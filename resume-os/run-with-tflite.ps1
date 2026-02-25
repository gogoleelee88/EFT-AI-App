# TFLite 모델/라벨 경로를 설정한 뒤 실행 복귀 OS 앱 실행
# 사용법: .\run-with-tflite.ps1
# activity_model.tflite, activity_labels.json 경로를 실제 위치에 맞게 수정하세요.

$ModelPath = "C:\Users\lco20\OneDrive\바탕 화면\archive\wisdm\activity_model.tflite"
$LabelsPath = "C:\Users\lco20\OneDrive\바탕 화면\archive\wisdm\activity_labels.json"

$env:RESUME_OS_TFLITE_MODEL = $ModelPath
$env:RESUME_OS_TFLITE_LABELS = $LabelsPath

Write-Host "[run-with-tflite] RESUME_OS_TFLITE_MODEL = $ModelPath"
Write-Host "[run-with-tflite] RESUME_OS_TFLITE_LABELS = $LabelsPath"
Write-Host "[run-with-tflite] npm start 실행 중..."
npm start
