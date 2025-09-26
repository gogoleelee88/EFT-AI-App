#!/usr/bin/env bash
set -e

# 날짜별 로그 파일 설정
LOG_FILE="$HOME/engine-a-$(date +%Y%m%d).log"
echo "=== vLLM Engine A 시작: $(date) ===" >> "$LOG_FILE"

# 환경 변수 설정
export HF_HOME="$HOME/.cache/huggingface"
export CUDA_VISIBLE_DEVICES=0
export HF_HUB_ENABLE_HF_TRANSFER=1

# 가상환경 활성화
source "$HOME/vllm/bin/activate"

# VRAM 체크 (선택)
echo "GPU 메모리 상태:" >> "$LOG_FILE"
nvidia-smi --query-gpu=memory.total,memory.used,memory.free --format=csv,noheader,nounits >> "$LOG_FILE" 2>/dev/null || echo "nvidia-smi 실행 실패" >> "$LOG_FILE"

# 실행 시작 메시지
echo "엔진 A 프로세스 실행 중 (PID $$)" >> "$LOG_FILE"
echo "모델 로드 완료 확인: curl -s http://127.0.0.1:8001/v1/models | jq" >> "$LOG_FILE"

# vLLM 서버 실행 (로그 저장)
exec python -m vllm.entrypoints.openai.api_server \
  --model meta-llama/Meta-Llama-3-8B-Instruct \
  --served-model-name engine-a \
  --host 0.0.0.0 --port 8001 \
  --dtype half \
  --gpu-memory-utilization 0.85 \
  --max-model-len 4096 \
  --trust-remote-code \
  --enforce-eager \
  >> "$LOG_FILE" 2>&1