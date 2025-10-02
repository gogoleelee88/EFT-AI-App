#!/usr/bin/env bash
# ===================================================================
# 확장된 자가진단 스크립트 (응답 시간 측정 포함)
# ===================================================================
# 목적: 운영 중 문제 발생 시 2분 내 핵심 정보 수집
# 실행: ./extended-diagnostic.sh
# 결과: diagnostic_YYYYMMDD_HHMMSS.log 파일 생성
# ===================================================================

set -euo pipefail

# === 설정 ===
BASE_URL="${BASE_URL:-https://moodtalk.app}"
API_URL="${BASE_URL}/api"
LLM_URL="${BASE_URL}/llm"
OUTPUT_DIR="${HOME}/eft-diagnostics"

# 색상 코드
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# === 유틸리티 함수 ===
log_section() {
    echo -e "\n${CYAN}========================================${NC}"
    echo -e "${CYAN}$*${NC}"
    echo -e "${CYAN}========================================${NC}"
}

log_info() {
    echo -e "${GREEN}[INFO]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

# HTTP 응답 시간 측정
measure_http() {
    local url="$1"
    local method="${2:-GET}"
    local label="${3:-URL}"

    local start_time=$(date +%s%3N)  # 밀리초 단위
    local http_code
    local response_time

    if [ "$method" = "GET" ]; then
        http_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || echo "000")
    else
        http_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST "$url" -H 'Content-Type: application/json' -d '{}' 2>/dev/null || echo "000")
    fi

    local end_time=$(date +%s%3N)
    response_time=$((end_time - start_time))

    if [ "$http_code" = "200" ]; then
        log_info "$label: HTTP $http_code (${response_time}ms) ✓"
    elif [ "$http_code" = "000" ]; then
        log_error "$label: Timeout or unreachable (${response_time}ms)"
    else
        log_warn "$label: HTTP $http_code (${response_time}ms)"
    fi

    echo "$http_code|$response_time"
}

# ===================================================================
# 1. 시스템 정보
# ===================================================================
collect_system_info() {
    log_section "1. System Information"

    echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S %Z')"
    echo "Hostname: $(hostname)"
    echo "Uptime: $(uptime)"
    echo ""

    echo "=== CPU Usage ==="
    top -bn1 | head -20
    echo ""

    echo "=== Memory Usage ==="
    free -h
    echo ""

    echo "=== Disk Usage ==="
    df -h | grep -E '^Filesystem|/$|/var'
    echo ""

    echo "=== Network Interfaces ==="
    ip addr show | grep -E 'inet |ether '
}

# ===================================================================
# 2. 서비스 상태
# ===================================================================
check_services() {
    log_section "2. Service Status"

    local services=("nginx" "eft-ai-backend")

    for service in "${services[@]}"; do
        echo "=== $service ==="
        if systemctl is-active --quiet "$service"; then
            log_info "$service: Running ✓"
            systemctl status "$service" --no-pager -l | head -15
        else
            log_error "$service: Not running!"
            systemctl status "$service" --no-pager -l | head -15
        fi
        echo ""
    done
}

# ===================================================================
# 3. HTTP 엔드포인트 응답 시간 측정
# ===================================================================
check_http_endpoints() {
    log_section "3. HTTP Endpoint Response Times"

    echo "=== Frontend ==="
    measure_http "$BASE_URL" "GET" "Homepage"
    echo ""

    echo "=== API Endpoints ==="
    local api_result
    api_result=$(measure_http "${API_URL}/health" "GET" "API Health")
    echo "Result: $api_result"
    echo ""

    echo "=== LLM Endpoints ==="
    local llm_result
    llm_result=$(measure_http "${LLM_URL}/health" "GET" "LLM Health")
    echo "Result: $llm_result"
    echo ""

    # 상세 AI 스모크 테스트 (선택사항)
    echo "=== AI Smoke Test (Optional) ==="
    local ai_start=$(date +%s%3N)
    local ai_response

    ai_response=$(curl -fsS --max-time 15 \
      -H 'Content-Type: application/json' \
      -d '{"model":"qwen-2.5","messages":[{"role":"user","content":"hi"}],"max_tokens":10}' \
      "${LLM_URL}/v1/chat/completions" 2>&1) || {
        log_warn "AI Smoke Test: Failed (server may be down)"
        echo "Error: $ai_response"
    }

    if [ -n "${ai_response:-}" ]; then
        local ai_end=$(date +%s%3N)
        local ai_time=$((ai_end - ai_start))

        if echo "$ai_response" | grep -q '"choices"'; then
            log_info "AI Smoke Test: Success (${ai_time}ms) ✓"
        else
            log_warn "AI Smoke Test: Invalid response (${ai_time}ms)"
            echo "Response: ${ai_response:0:200}..."
        fi
    fi
}

# ===================================================================
# 4. 로그 분석 (최근 에러)
# ===================================================================
analyze_logs() {
    log_section "4. Recent Errors (Last 100 Lines)"

    echo "=== Nginx Error Log ==="
    if [ -f /var/log/nginx/error.log ]; then
        tail -n 100 /var/log/nginx/error.log | grep -E '\[error\]|\[crit\]' | tail -20 || echo "No errors found"
    else
        log_warn "Nginx error log not found"
    fi
    echo ""

    echo "=== FastAPI Error Log (journalctl) ==="
    if systemctl list-units --full --all | grep -q eft-ai-backend; then
        sudo journalctl -u eft-ai-backend --since "10 min ago" -p err --no-pager | tail -20 || echo "No errors found"
    else
        log_warn "FastAPI service not found"
    fi
    echo ""

    echo "=== System Errors (Last 10 minutes) ==="
    sudo journalctl --since "10 min ago" -p err --no-pager | grep -v 'eft-ai' | tail -20 || echo "No system errors"
}

# ===================================================================
# 5. 네트워크 진단
# ===================================================================
check_network() {
    log_section "5. Network Diagnostics"

    echo "=== DNS Resolution ==="
    if command -v dig &> /dev/null; then
        dig +short moodtalk.app A || log_warn "DNS resolution failed"
    else
        nslookup moodtalk.app || log_warn "DNS resolution failed"
    fi
    echo ""

    echo "=== Active Connections ==="
    ss -tunap | grep -E ':80|:443|:8000|:8001|:8002' | head -20
    echo ""

    echo "=== Port Listening ==="
    sudo netstat -tulnp | grep -E ':80|:443|:8000|:8001|:8002' || echo "No services listening"
}

# ===================================================================
# 6. 프로세스 분석
# ===================================================================
check_processes() {
    log_section "6. Process Analysis"

    echo "=== Python Processes (FastAPI) ==="
    ps aux | grep -E '[p]ython.*uvicorn' | head -10 || echo "No FastAPI processes found"
    echo ""

    echo "=== Nginx Processes ==="
    ps aux | grep -E '[n]ginx' | head -10 || echo "No Nginx processes found"
    echo ""

    echo "=== High CPU Processes (Top 10) ==="
    ps aux --sort=-%cpu | head -11
    echo ""

    echo "=== High Memory Processes (Top 10) ==="
    ps aux --sort=-%mem | head -11
}

# ===================================================================
# 7. 디스크 및 I/O 분석
# ===================================================================
check_disk_io() {
    log_section "7. Disk & I/O Analysis"

    echo "=== Disk Space ==="
    df -h
    echo ""

    echo "=== Inode Usage ==="
    df -i | grep -E '^Filesystem|/$|/var'
    echo ""

    echo "=== Large Log Files ==="
    du -sh /var/log/nginx/* 2>/dev/null | sort -h | tail -5
    du -sh /var/log/journal/* 2>/dev/null | sort -h | tail -5
    echo ""

    if command -v iostat &> /dev/null; then
        echo "=== I/O Stats ==="
        iostat -x 1 3
    fi
}

# ===================================================================
# 8. 보안 체크 (선택사항)
# ===================================================================
check_security() {
    log_section "8. Security Check"

    echo "=== Failed Login Attempts (Last 24h) ==="
    sudo journalctl --since "24 hours ago" | grep -i 'failed\|failure' | wc -l || echo "0"
    echo ""

    echo "=== Firewall Status ==="
    if command -v ufw &> /dev/null; then
        sudo ufw status
    elif command -v firewall-cmd &> /dev/null; then
        sudo firewall-cmd --list-all
    else
        log_warn "No firewall detected"
    fi
    echo ""

    echo "=== Recent Logins ==="
    last -n 10
}

# ===================================================================
# 9. 백엔드 헬스체크 (상세)
# ===================================================================
detailed_health_check() {
    log_section "9. Detailed Backend Health Check"

    echo "=== API /health Response ==="
    curl -sS --max-time 5 "${API_URL}/health" | jq '.' 2>/dev/null || curl -sS --max-time 5 "${API_URL}/health"
    echo ""

    echo "=== LLM /health Response ==="
    curl -sS --max-time 5 "${LLM_URL}/health" | jq '.' 2>/dev/null || curl -sS --max-time 5 "${LLM_URL}/health"
    echo ""

    echo "=== Upstream Check (if configured) ==="
    if [ -f /etc/nginx/sites-enabled/moodtalk.app ]; then
        grep -E 'proxy_pass|upstream' /etc/nginx/sites-enabled/moodtalk.app | head -10
    fi
}

# ===================================================================
# 메인 실행
# ===================================================================
main() {
    # 출력 디렉토리 생성
    mkdir -p "$OUTPUT_DIR"

    # 출력 파일 경로
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local output_file="${OUTPUT_DIR}/diagnostic_${timestamp}.log"

    echo "=========================================="
    echo "  Extended Diagnostic Script"
    echo "  Starting at $(date '+%Y-%m-%d %H:%M:%S')"
    echo "=========================================="
    echo ""
    echo "Output will be saved to: $output_file"
    echo ""

    # 모든 검사 실행 (출력을 파일과 화면 모두에 표시)
    {
        collect_system_info
        check_services
        check_http_endpoints
        analyze_logs
        check_network
        check_processes
        check_disk_io
        check_security
        detailed_health_check

        # 최종 요약
        log_section "10. Summary"
        echo "Diagnostic completed at: $(date '+%Y-%m-%d %H:%M:%S')"
        echo "Total runtime: $SECONDS seconds"
        echo ""
        echo "Next steps:"
        echo "1. Review errors in Section 4 (Recent Errors)"
        echo "2. Check response times in Section 3 (HTTP Endpoints)"
        echo "3. Verify service status in Section 2 (Services)"
        echo "4. Monitor disk usage in Section 7 (Disk & I/O)"
        echo ""
        echo "Report saved to: $output_file"

    } 2>&1 | tee "$output_file"

    # 파일 정보 출력
    echo ""
    log_info "Diagnostic complete!"
    log_info "Report: $output_file ($(du -h "$output_file" | awk '{print $1}'))"

    # 오래된 진단 파일 정리 (7일 이상)
    find "$OUTPUT_DIR" -name "diagnostic_*.log" -mtime +7 -delete 2>/dev/null || true

    exit 0
}

# 스크립트 직접 실행 시에만 main 호출
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
