#!/usr/bin/env bash
# ===================================================================
# 배포 후 "원클릭" 자가진단 (확장판)
# ===================================================================
# 목적: 응답시간/헤더 검증/CF 캐시상태/금칙어 스캔 통합
# 실행: ./boot-smoke-test.sh
# 성공 기준: 모든 체크 통과 시 exit 0
# ===================================================================

set -euo pipefail

# === 설정 ===
BASE="${BASE_URL:-https://moodtalk.app}"
API="${BASE}/api"
LLM="${BASE}/llm"

# 번들 해시 추출 (index.html에서)
INDEX_HTML=$(curl -fsS "${BASE}/index.html" 2>/dev/null || echo "")
BUNDLE_PATH=$(echo "$INDEX_HTML" | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1)

if [ -z "$BUNDLE_PATH" ]; then
    echo "⚠️  번들 경로 추출 실패, 기본값 사용"
    BUNDLE_PATH="/assets/index-BcWyEr4G.js"
fi

BUNDLE_URL="${BASE}${BUNDLE_PATH}"

# 색상 코드
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# === 유틸리티 함수 ===
fail() {
    echo -e "${RED}❌ $*${NC}"
    exit 1
}

ok() {
    echo -e "${GREEN}✅ $*${NC}"
}

warn() {
    echo -e "${YELLOW}ℹ️  $*${NC}"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

# 시간 측정 함수
measure_time() {
    local start=$(date +%s%3N)
    "$@" >/dev/null 2>&1
    local end=$(date +%s%3N)
    echo $(( (end - start) ))
}

# ===================================================================
# 1. API 헬스체크
# ===================================================================
echo "=========================================="
echo "  배포 후 자가진단 (Boot Smoke Test)"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="
echo ""

info "1. API 헬스체크 시작..."

# 응답 시간 측정
api_start=$(date +%s%3N)
api_response=$(curl -fsS --max-time 5 "${API}/health" 2>&1) || fail "API /health 요청 실패"
api_end=$(date +%s%3N)
api_time=$(( (api_end - api_start) ))

# JSON 검증
echo "$api_response" | grep -qiE '"(ok|status)"' || fail "API /health 응답에 'ok' 또는 'status' 없음"

# 응답 시간 체크 (1초 이하 권장)
if [ $api_time -lt 1000 ]; then
    ok "API /health OK (${api_time}ms)"
elif [ $api_time -lt 2000 ]; then
    warn "API /health 느림 (${api_time}ms) - 1초 이상"
else
    fail "API /health 너무 느림 (${api_time}ms)"
fi

# ===================================================================
# 2. LLM 스모크 테스트
# ===================================================================
echo ""
info "2. LLM 스모크 테스트 시작..."

llm_payload='{"model":"qwen-2.5","messages":[{"role":"user","content":"ping"}],"max_tokens":8,"temperature":0.1}'

llm_start=$(date +%s%3N)
llm_response=$(curl -fsS --max-time 10 \
    -H 'Content-Type: application/json' \
    -d "$llm_payload" \
    "${LLM}/v1/chat/completions" 2>&1) || {
    warn "LLM /v1/chat/completions 실패 (서버 미실행 가능)"
    llm_available=false
}

if [ "${llm_available:-true}" = "true" ]; then
    llm_end=$(date +%s%3N)
    llm_time=$(( (llm_end - llm_start) ))

    # OpenAI 호환 응답 검증
    echo "$llm_response" | grep -q '"choices"' || fail "LLM 응답에 'choices' 없음"

    if [ $llm_time -lt 5000 ]; then
        ok "LLM OK (${llm_time}ms)"
    else
        warn "LLM 느림 (${llm_time}ms) - 5초 이상"
    fi
else
    warn "LLM 서버 스킵 (선택사항)"
fi

# ===================================================================
# 3. 정적 번들 헤더 & Cloudflare 캐시 상태
# ===================================================================
echo ""
info "3. 정적 번들 헤더 검증..."
info "   번들: ${BUNDLE_URL}"

bundle_headers=$(curl -sSI --max-time 5 "${BUNDLE_URL}" 2>/dev/null) || fail "번들 다운로드 실패"

# HTTP 200 체크
echo "$bundle_headers" | grep -qi '^HTTP/.* 200' || fail "번들 HTTP 200 아님"
ok "번들 HTTP 200 ✓"

# Cloudflare 헤더 체크
if echo "$bundle_headers" | grep -qi '^cf-cache-status:'; then
    cf_status=$(echo "$bundle_headers" | grep -i '^cf-cache-status:' | awk '{print $2}' | tr -d '\r')
    ok "Cloudflare 헤더 감지: $cf_status"

    # HIT/MISS/EXPIRED 등 확인
    case "$cf_status" in
        HIT)
            ok "Cloudflare 캐시 HIT (정상)"
            ;;
        MISS|DYNAMIC|BYPASS)
            warn "Cloudflare 캐시 $cf_status (초기 요청 또는 캐시 규칙 확인 필요)"
            ;;
        EXPIRED)
            warn "Cloudflare 캐시 만료 (재검증 중)"
            ;;
        *)
            warn "Cloudflare 캐시 상태: $cf_status"
            ;;
    esac
else
    warn "Cloudflare 헤더 없음 (직통 연결일 수 있음)"
fi

# Cache-Control 헤더 체크
if echo "$bundle_headers" | grep -qi '^cache-control:.*immutable'; then
    ok "정적 캐시 정책 OK (immutable)"
elif echo "$bundle_headers" | grep -qi '^cache-control:.*max-age=31536000'; then
    ok "정적 캐시 정책 OK (max-age=1년)"
else
    cache_control=$(echo "$bundle_headers" | grep -i '^cache-control:' | cut -d: -f2- | tr -d '\r' | xargs || echo "없음")
    warn "Cache-Control 개선 필요: $cache_control"
fi

# ===================================================================
# 4. 금칙어 스캔 (localhost, 구버전 해시 등)
# ===================================================================
echo ""
info "4. 번들 금칙어 스캔..."

bundle_content=$(curl -fsS --max-time 10 "${BUNDLE_URL}" 2>/dev/null) || fail "번들 콘텐츠 다운로드 실패"

# localhost 문자열 체크
if echo "$bundle_content" | grep -qi 'localhost:'; then
    echo "$bundle_content" | grep -oi '.{0,50}localhost:.{0,50}' | head -3
    fail "번들에 localhost 문자열 존재!"
else
    ok "localhost 문자열 없음 ✓"
fi

# 추가 금칙어 (127.0.0.1, http://localhost 등)
forbidden_found=false

if echo "$bundle_content" | grep -qF '127.0.0.1:8000'; then
    warn "번들에 127.0.0.1:8000 존재 (FastAPI 하드코딩)"
    forbidden_found=true
fi

if echo "$bundle_content" | grep -qF '127.0.0.1:8002'; then
    warn "번들에 127.0.0.1:8002 존재 (LLM 하드코딩)"
    forbidden_found=true
fi

if echo "$bundle_content" | grep -qF 'http://localhost'; then
    warn "번들에 http://localhost 존재"
    forbidden_found=true
fi

# 구버전 해시 체크 (Cmcu9lgI는 예시)
if echo "$bundle_content" | grep -qF 'Cmcu9lgI'; then
    warn "구버전 번들 해시 감지: Cmcu9lgI"
    forbidden_found=true
fi

# workbox 구버전 체크
if echo "$bundle_content" | grep -qE 'workbox-.*\.js'; then
    warn "구버전 workbox 참조 감지"
    forbidden_found=true
fi

if [ "$forbidden_found" = "false" ]; then
    ok "금칙어 없음 ✓"
else
    fail "번들에 금칙어 존재! 코드 수정 필요"
fi

# ===================================================================
# 5. Service Worker 캐시 정책 체크
# ===================================================================
echo ""
info "5. Service Worker 캐시 정책 검증..."

sw_headers=$(curl -sSI --max-time 5 "${BASE}/sw.js" 2>/dev/null) || warn "Service Worker 다운로드 실패 (없을 수 있음)"

if [ -n "${sw_headers:-}" ]; then
    # HTTP 200 체크
    if echo "$sw_headers" | grep -qi '^HTTP/.* 200'; then
        ok "Service Worker HTTP 200 ✓"
    else
        warn "Service Worker HTTP 200 아님"
    fi

    # Cache-Control: no-store 확인
    if echo "$sw_headers" | grep -qiE '^cache-control:.*no-store'; then
        ok "Service Worker 캐시 방지 정책 OK (no-store)"
    else
        sw_cache=$(echo "$sw_headers" | grep -i '^cache-control:' | cut -d: -f2- | tr -d '\r' | xargs || echo "없음")
        warn "Service Worker Cache-Control: $sw_cache (no-store 권장)"
    fi

    # Cloudflare 캐시 상태 (BYPASS/DYNAMIC 기대)
    if echo "$sw_headers" | grep -qiE '^cf-cache-status:.*(HIT|EXPIRED)'; then
        sw_cf=$(echo "$sw_headers" | grep -i '^cf-cache-status:' | awk '{print $2}' | tr -d '\r')
        warn "Service Worker가 Cloudflare에 캐시됨! ($sw_cf) - BYPASS로 설정 필요"
    else
        sw_cf=$(echo "$sw_headers" | grep -i '^cf-cache-status:' | awk '{print $2}' | tr -d '\r' || echo "없음")
        ok "Service Worker CF 캐시 상태: $sw_cf"
    fi
else
    warn "Service Worker 없음 (PWA 미사용 또는 경로 다름)"
fi

# ===================================================================
# 6. 프론트엔드 index.html 캐시 정책
# ===================================================================
echo ""
info "6. index.html 캐시 정책 검증..."

index_headers=$(curl -sSI --max-time 5 "${BASE}/index.html" 2>/dev/null) || fail "index.html 다운로드 실패"

# HTTP 200 체크
echo "$index_headers" | grep -qi '^HTTP/.* 200' || fail "index.html HTTP 200 아님"
ok "index.html HTTP 200 ✓"

# Cache-Control: no-cache 또는 no-store 확인
if echo "$index_headers" | grep -qiE '^cache-control:.*(no-cache|no-store)'; then
    ok "index.html 캐시 방지 정책 OK"
else
    idx_cache=$(echo "$index_headers" | grep -i '^cache-control:' | cut -d: -f2- | tr -d '\r' | xargs || echo "없음")
    warn "index.html Cache-Control: $idx_cache (no-cache 권장)"
fi

# Cloudflare 캐시 상태 (HIT면 경고)
if echo "$index_headers" | grep -qiE '^cf-cache-status:.*(HIT|EXPIRED)'; then
    idx_cf=$(echo "$index_headers" | grep -i '^cf-cache-status:' | awk '{print $2}' | tr -d '\r')
    warn "index.html이 Cloudflare에 캐시됨! ($idx_cf) - 최신 배포 반영 안 될 수 있음"
else
    idx_cf=$(echo "$index_headers" | grep -i '^cf-cache-status:' | awk '{print $2}' | tr -d '\r' || echo "없음")
    ok "index.html CF 캐시 상태: $idx_cf"
fi

# ===================================================================
# 최종 결과
# ===================================================================
echo ""
echo "=========================================="
ok "🎉 배포 자가진단 통과!"
echo "=========================================="
echo ""
echo "요약:"
echo "  ✅ API /health: ${api_time}ms"
[ "${llm_available:-true}" = "true" ] && echo "  ✅ LLM /v1/chat/completions: ${llm_time}ms" || echo "  ⚠️  LLM 서버 스킵"
echo "  ✅ 정적 번들: HTTP 200, CF 캐시 확인 완료"
echo "  ✅ 금칙어: localhost/구버전 없음"
echo "  ✅ Service Worker: 캐시 정책 검증 완료"
echo "  ✅ index.html: 캐시 정책 검증 완료"
echo ""
echo "다음 단계:"
echo "  1. Uptime-Kuma에서 실시간 모니터링 확인"
echo "  2. 브라우저 DevTools Network 탭에서 실제 요청 확인"
echo "  3. Cloudflare 캐시 규칙 재확인 (필요 시)"
echo ""

exit 0
