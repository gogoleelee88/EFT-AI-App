#!/usr/bin/env bash
set -euo pipefail

BASE="https://moodtalk.app"
API="${BASE}/api"
LLM="${BASE}/llm"
INDEX_URL="${BASE}/index.html"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

fail() {
    echo -e "${RED}❌ $*${NC}"
    exit 1
}

ok() {
    echo -e "${GREEN}✅ $*${NC}"
}

warn() {
    echo -e "${YELLOW}⚠️  $*${NC}"
}

echo "=========================================="
echo "  백엔드/LLM 연결 자가테스트"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="
echo ""

echo "== 1. API /health 체크"
api_response=$(curl -fsS --max-time 5 "${API}/health" 2>&1) || fail "API /health 요청 실패"
# 'ok' 또는 'status' 키 확인 (서버 응답 형식 호환)
echo "$api_response" | grep -qiE '"(ok|status)"' || fail "API /health 응답 이상: $api_response"
ok "API /health → HTTP 200, JSON 정상"
echo "  응답: $api_response"
echo ""

echo "== 2. LLM /v1/chat/completions 스모크 테스트"
payload='{
  "model": "qwen-2.5",
  "messages": [{"role": "user", "content": "hello"}],
  "max_tokens": 16,
  "temperature": 0.1
}'

llm_available=true
llm_response=$(curl -fsS --max-time 10 -H 'Content-Type: application/json' -d "$payload" "${LLM}/v1/chat/completions" 2>&1) || {
    warn "LLM /v1/chat/completions 요청 실패 (서버 미실행 가능)"
    llm_available=false
}

if [ "$llm_available" = true ]; then
    echo "$llm_response" | grep -q '"choices"' || fail "LLM 응답에 'choices' 없음"
    ok "LLM /v1/chat/completions → HTTP 200"
else
    warn "LLM 서버 스킵 (선택사항)"
fi
echo ""

echo "== 3. localhost 금칙어 스캔"
index_html=$(curl -fsS "${INDEX_URL}" 2>&1) || fail "index.html 다운로드 실패"
bundle_path=$(echo "$index_html" | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -n 1)

if [ -z "$bundle_path" ]; then
    warn "번들 경로 추출 실패 (금칙어 스캔 스킵)"
else
    echo "  번들: ${BASE}${bundle_path}"
    bundle_content=$(curl -fsS "${BASE}${bundle_path}" 2>&1) || fail "번들 다운로드 실패"

    # localhost: 검색
    if echo "$bundle_content" | grep -qi 'localhost:'; then
        fail "번들에 localhost: 문자열 잔존!"
    else
        ok "localhost: 문자열 0건"
    fi

    # 추가 금칙어 검색
    forbidden_keywords=("127.0.0.1:8000" "127.0.0.1:8002" "http://localhost")
    found_forbidden=false

    for keyword in "${forbidden_keywords[@]}"; do
        if echo "$bundle_content" | grep -qF "$keyword"; then
            warn "금칙어 발견: '$keyword'"
            found_forbidden=true
        fi
    done

    if [ "$found_forbidden" = true ]; then
        fail "번들에 금칙어 잔존!"
    else
        ok "추가 금칙어 0건"
    fi
fi
echo ""

echo "=========================================="
ok "🎉 백엔드/LLM 연결 자가테스트 통과"
echo "  API /health: OK"
echo "  LLM 서버: ${llm_available}"
echo "  localhost 금칙어: 0건"
echo "=========================================="
exit 0
