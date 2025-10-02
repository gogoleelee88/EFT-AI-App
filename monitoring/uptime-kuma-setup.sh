#!/usr/bin/env bash
# ===================================================================
# Uptime-Kuma 설치 및 설정 스크립트
# ===================================================================
# 목적: 간단하고 강력한 모니터링 대시보드 구축
# 실행: ./uptime-kuma-setup.sh
# 접속: http://localhost:3001 (또는 Nginx 프록시 설정 시 /monitor)
# ===================================================================

set -euo pipefail

# === 색상 코드 ===
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $*"
}

# ===================================================================
# 1. Docker 설치 확인
# ===================================================================

check_docker() {
    log_step "1. Checking Docker installation"

    if ! command -v docker &> /dev/null; then
        log_error "Docker not found. Please install Docker first:"
        log_error "  curl -fsSL https://get.docker.com | sh"
        log_error "  sudo usermod -aG docker \$USER"
        exit 1
    fi

    if ! docker ps &> /dev/null; then
        log_error "Docker daemon not running or permission denied"
        log_error "  sudo systemctl start docker"
        log_error "  sudo usermod -aG docker \$USER"
        exit 1
    fi

    log_info "Docker OK ($(docker --version))"
}

# ===================================================================
# 2. Uptime-Kuma 컨테이너 실행
# ===================================================================

run_uptime_kuma() {
    log_step "2. Running Uptime-Kuma container"

    # 기존 컨테이너 확인
    if docker ps -a --format '{{.Names}}' | grep -q '^uptime-kuma$'; then
        log_warn "Container 'uptime-kuma' already exists"

        if docker ps --format '{{.Names}}' | grep -q '^uptime-kuma$'; then
            log_info "Already running"
            return 0
        else
            log_info "Starting existing container..."
            docker start uptime-kuma
            return 0
        fi
    fi

    # 데이터 디렉토리 생성
    UPTIME_DATA="${HOME}/.uptime-kuma-data"
    mkdir -p "$UPTIME_DATA"

    log_info "Creating new container..."

    # 컨테이너 실행
    docker run -d \
        --name uptime-kuma \
        --restart always \
        -p 3001:3001 \
        -v "${UPTIME_DATA}:/app/data" \
        louislam/uptime-kuma:1

    log_info "Container started successfully"
    log_info "  Data directory: $UPTIME_DATA"
    log_info "  Port: 3001"
}

# ===================================================================
# 3. 헬스체크 대기
# ===================================================================

wait_for_uptime_kuma() {
    log_step "3. Waiting for Uptime-Kuma to be ready"

    local max_wait=30
    local count=0

    while [ $count -lt $max_wait ]; do
        if curl -fsS http://localhost:3001 &> /dev/null; then
            log_info "Uptime-Kuma is ready!"
            return 0
        fi

        echo -n "."
        sleep 1
        ((count++))
    done

    log_error "Uptime-Kuma did not start within ${max_wait}s"
    log_error "  Check logs: docker logs uptime-kuma"
    exit 1
}

# ===================================================================
# 4. 모니터링 대상 설정 가이드
# ===================================================================

show_setup_guide() {
    log_step "4. Setup Guide"

    echo ""
    echo "=========================================="
    log_info "🎉 Uptime-Kuma is running!"
    echo "=========================================="
    echo ""

    log_info "1. Access Dashboard:"
    echo "   http://localhost:3001"
    echo ""

    log_info "2. First-time setup:"
    echo "   - Create admin account (user/password)"
    echo "   - Skip auto-setup wizard"
    echo ""

    log_info "3. Add monitors (recommended):"
    echo ""
    echo "   📍 Monitor 1: API Health"
    echo "   - Monitor Type: HTTP(s)"
    echo "   - Friendly Name: EFT AI - API Health"
    echo "   - URL: https://moodtalk.app/api/health"
    echo "   - Heartbeat Interval: 60 seconds"
    echo "   - Expected Response: JSON with {\"ok\":true} or {\"status\":\"ok\"}"
    echo ""

    echo "   📍 Monitor 2: Frontend (CDN)"
    echo "   - Monitor Type: HTTP(s)"
    echo "   - Friendly Name: EFT AI - Frontend"
    echo "   - URL: https://moodtalk.app"
    echo "   - Heartbeat Interval: 300 seconds (5 min)"
    echo "   - Expected Response: HTTP 200"
    echo ""

    echo "   📍 Monitor 3: LLM Server (Optional)"
    echo "   - Monitor Type: HTTP(s)"
    echo "   - Friendly Name: EFT AI - LLM"
    echo "   - URL: https://moodtalk.app/llm/health"
    echo "   - Heartbeat Interval: 120 seconds"
    echo "   - Expected Response: HTTP 200"
    echo ""

    log_info "4. Notification setup (optional):"
    echo "   - Settings → Notifications"
    echo "   - Add Telegram/Discord/Email/Slack"
    echo "   - Test notification"
    echo ""

    log_info "5. Container management:"
    echo "   - View logs:    docker logs uptime-kuma -f"
    echo "   - Stop:         docker stop uptime-kuma"
    echo "   - Start:        docker start uptime-kuma"
    echo "   - Restart:      docker restart uptime-kuma"
    echo "   - Remove:       docker rm -f uptime-kuma"
    echo ""

    echo "=========================================="
}

# ===================================================================
# 5. Nginx 프록시 설정 (선택사항)
# ===================================================================

show_nginx_proxy_config() {
    log_step "5. Nginx Proxy Configuration (Optional)"

    echo ""
    log_info "To access via https://moodtalk.app/monitor:"
    echo ""

    cat <<'EOF'
# Add to /etc/nginx/sites-available/moodtalk.app:

location ^~ /monitor/ {
    proxy_pass http://127.0.0.1:3001/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # WebSocket 지원 (실시간 업데이트)
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    # 타임아웃
    proxy_read_timeout 300s;
    proxy_connect_timeout 75s;
}

# 적용:
# sudo nginx -t && sudo systemctl reload nginx
EOF

    echo ""
    log_info "After setup, access: https://moodtalk.app/monitor"
}

# ===================================================================
# 메인 실행
# ===================================================================

main() {
    echo "=========================================="
    echo "  Uptime-Kuma Setup Script"
    echo "  $(date '+%Y-%m-%d %H:%M:%S')"
    echo "=========================================="
    echo ""

    check_docker
    run_uptime_kuma
    wait_for_uptime_kuma
    show_setup_guide
    show_nginx_proxy_config

    echo ""
    log_info "✅ Setup complete!"
    log_info "   Open http://localhost:3001 to configure monitors"
    echo ""

    exit 0
}

if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
