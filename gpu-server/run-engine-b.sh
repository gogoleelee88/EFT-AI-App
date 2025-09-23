#!/usr/bin/env bash
set -e

# 날짜별 로그 파일 설정
LOG_FILE="$HOME/engine-b-$(date +%Y%m%d).log"
echo "=== vLLM Engine B 시작: $(date) ===" >> "$LOG_FILE"

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
echo "엔진 B 프로세스 실행 중 (PID $$)" >> "$LOG_FILE"
echo "모델 로드 완료 확인: curl -s http://127.0.0.1:8002/v1/models | jq" >> "$LOG_FILE"

# vLLM 서버 실행 (로그 저장)
# 보안: --host 127.0.0.1 (같은 서버만) 또는 0.0.0.0 (외부 접근시 방화벽 필수)
exec python -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen2.5-7B-Instruct \
  --served-model-name engine-b \
  --host 127.0.0.1 --port 8002 \
  --dtype half \
  --gpu-memory-utilization 0.85 \
  --max-model-len 4096 \
  --trust-remote-code \
  --enforce-eager \
  >> "$LOG_FILE" 2>&1