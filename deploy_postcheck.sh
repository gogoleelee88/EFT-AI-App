#!/usr/bin/env bash
# deploy_postcheck.sh - 배포 후 자가검증 스크립트
# 역할: CDN 배포 후 번들 무결성, 금칙어, 캐시 헤더 검증
set -euo pipefail

# === 설정 ===
ORIGIN_BASE="http://127.0.0.1:8000"
CDN_BASE="https://moodtalk.app"
INDEX_URL="${CDN_BASE}/index.html"

# 금칙어 리스트 (구버전 번들 해시 및 레거시 경로)
LEGACY_KEYWORDS=(
    "Cmcu9lgI"        # 구버전 index 번들 해시
    "eft-guide"       # 레거시 경로
)

# 색상 코드
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# === 유틸리티 함수 ===
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

# HTTP 200 응답 확인
require_200() {
    local url="$1"
    local label="${2:-URL}"
    local http_code

    http_code=$(curl -s -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || echo "000")

    if [ "$http_code" != "200" ]; then
        log_error "$label: HTTP $http_code (expected 200)"
        log_error "  URL: $url"
        return 1
    fi

    log_info "$label: HTTP 200 ✓"
    return 0
}

# URL 바디의 SHA256 해시 계산
sha256_of() {
    local url="$1"
    local body

    body=$(curl -sfL "$url" 2>/dev/null)

    if [ -z "$body" ]; then
        log_error "Empty response from $url"
        return 1
    fi

    # macOS/Linux 호환
    if command -v sha256sum &> /dev/null; then
        echo "$body" | sha256sum | awk '{print $1}'
    elif command -v shasum &> /dev/null; then
        echo "$body" | shasum -a 256 | awk '{print $1}'
    else
        log_error "sha256sum or shasum not found"
        return 1
    fi
}

# Cache-Control 헤더 검증
check_cache_control() {
    local url="$1"
    local expected_pattern="$2"
    local label="${3:-URL}"
    local cache_header

    cache_header=$(curl -sI "$url" 2>/dev/null | grep -i '^cache-control:' | sed 's/^cache-control: //i' | tr -d '\r' || echo "")

    if [ -z "$cache_header" ]; then
        log_warn "$label: No Cache-Control header"
        return 1
    fi

    if echo "$cache_header" | grep -qiE "$expected_pattern"; then
        log_info "$label: Cache-Control ✓ ($cache_header)"
        return 0
    else
        log_warn "$label: Cache-Control mismatch"
        log_warn "  Got: $cache_header"
        log_warn "  Expected pattern: $expected_pattern"
        return 1
    fi
}

# === A. CDN index.html에서 번들 JS 추출 ===
extract_bundle_path() {
    log_step "A. Extracting bundle path from index.html"

    local index_html
    index_html=$(curl -sfL "$INDEX_URL" 2>/dev/null)

    if [ -z "$index_html" ]; then
        log_error "Failed to fetch index.html from $INDEX_URL"
        exit 1
    fi

    log_info "Downloaded index.html (${#index_html} bytes)"

    # 정규식: /assets/index-{hash}.js 추출 (POSIX grep 호환)
    local bundle_path
    bundle_path=$(echo "$index_html" | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -n 1)

    if [ -z "$bundle_path" ]; then
        log_error "Failed to extract bundle JS path"
        log_error "  Pattern: /assets/index-[A-Za-z0-9_-]+\\.js"
        log_error "  Searched in: $INDEX_URL"
        exit 1
    fi

    log_info "Extracted: $bundle_path ✓"
    echo "$bundle_path"
}

# === B. 오리진/CDN 해시 비교 ===
compare_origin_cdn() {
    local js_path="$1"
    log_step "B. Comparing Origin vs CDN hash"

    local origin_url="${ORIGIN_BASE}${js_path}"
    local cdn_url="${CDN_BASE}${js_path}"

    # 오리진 체크
    log_info "Origin: $origin_url"
    if ! require_200 "$origin_url" "Origin"; then
        exit 1
    fi

    # CDN 체크
    log_info "CDN: $cdn_url"
    if ! require_200 "$cdn_url" "CDN"; then
        exit 1
    fi

    # SHA256 해시 비교
    log_info "Computing SHA256 hashes..."

    local origin_hash cdn_hash
    origin_hash=$(sha256_of "$origin_url")
    if [ -z "$origin_hash" ]; then
        log_error "Failed to compute origin hash"
        exit 1
    fi

    cdn_hash=$(sha256_of "$cdn_url")
    if [ -z "$cdn_hash" ]; then
        log_error "Failed to compute CDN hash"
        exit 1
    fi

    log_info "Origin SHA256: $origin_hash"
    log_info "CDN    SHA256: $cdn_hash"

    if [ "$origin_hash" != "$cdn_hash" ]; then
        log_error "Hash mismatch!"
        log_error "  Origin and CDN serve different files"
        log_error "  This indicates cache inconsistency or deployment issue"
        exit 1
    fi

    log_info "Hash match ✓ (Origin == CDN)"
}

# === C. 금칙어 검사 ===
check_legacy_keywords() {
    local js_path="$1"
    log_step "C. Checking for legacy keywords"

    local cdn_url="${CDN_BASE}${js_path}"
    local bundle_body

    log_info "Downloading bundle from CDN..."
    bundle_body=$(curl -sfL "$cdn_url" 2>/dev/null)

    if [ -z "$bundle_body" ]; then
        log_error "Failed to download CDN bundle"
        exit 1
    fi

    log_info "Bundle size: ${#bundle_body} bytes"

    local found_legacy=false
    local keyword

    for keyword in "${LEGACY_KEYWORDS[@]}"; do
        # grep -F: 문자열 리터럴 검색 (정규식 해석 안 함)
        if echo "$bundle_body" | grep -qF "$keyword"; then
            log_error "Found legacy keyword: '$keyword'"

            # 해당 키워드 포함 라인 출력 (최대 3줄, 각 100자)
            echo "$bundle_body" | grep -F "$keyword" | head -n 3 | while IFS= read -r line; do
                local preview="${line:0:100}"
                log_error "  → ${preview}..."
            done

            found_legacy=true
        fi
    done

    if [ "$found_legacy" = true ]; then
        log_error "Legacy keyword check failed"
        log_error "  Bundle contains references to old files"
        exit 1
    fi

    log_info "No legacy references ✓"
}

# === D. 캐시 헤더 검증 ===
validate_cache_headers() {
    local js_path="$1"
    log_step "D. Validating Cache-Control headers"

    local cdn_bundle_url="${CDN_BASE}${js_path}"

    # 1. 해시 번들: immutable 기대
    log_info "Checking hashed bundle headers..."
    if check_cache_control "$cdn_bundle_url" "immutable|max-age=31536000" "Hashed bundle"; then
        : # success
    else
        log_warn "  Recommendation: Add 'immutable' for hashed assets"
    fi

    # 2. index.html: no-cache 기대
    log_info "Checking index.html headers..."
    if check_cache_control "$INDEX_URL" "no-cache|no-store" "index.html"; then
        : # success
    else
        log_warn "  Recommendation: Add 'no-cache' for index.html"
    fi
}

# === 메인 실행 ===
main() {
    echo "========================================"
    echo "  배포 후 자가검증 스크립트"
    echo "  $(date '+%Y-%m-%d %H:%M:%S')"
    echo "========================================"
    echo ""

    # Step A: 번들 경로 추출
    BUNDLE_PATH=$(extract_bundle_path)
    echo ""

    # Step B: 오리진/CDN 해시 비교
    compare_origin_cdn "$BUNDLE_PATH"
    echo ""

    # Step C: 금칙어 검사
    check_legacy_keywords "$BUNDLE_PATH"
    echo ""

    # Step D: 캐시 헤더 검증
    validate_cache_headers "$BUNDLE_PATH"
    echo ""

    echo "========================================"
    log_info "🎉 All checks passed!"
    log_info "  Bundle: $BUNDLE_PATH"
    log_info "  Status: Ready for production"
    echo "========================================"

    exit 0
}

# 스크립트 직접 실행 시에만 main 호출
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
