#!/usr/bin/env bash
set -euo pipefail

DOMAIN=${DOMAIN:-"https://www.moodtalk.app"}
ORIGIN=${ORIGIN:-"https://www.moodtalk.app"}
PATH_SUFFIX=${PATH_SUFFIX:-"/api/suds/record"}
DATA_PAYLOAD=${DATA_PAYLOAD:-'{"value":7,"source":"compare"}'}
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

log(){ printf '%s\n' "$*"; }
pass(){ log "PASS: $*"; }
fail(){ log "FAIL: $*"; exit 1; }

OPTIONS_OUTPUT="$TMPDIR/options.txt"
POST_OUTPUT="$TMPDIR/post.txt"
OPENAPI_OUTPUT="$TMPDIR/openapi.txt"

log "[1/3] OPTIONS preflight check"
if curl -sS -D "$OPTIONS_OUTPUT" -o /dev/null -X OPTIONS "${DOMAIN}${PATH_SUFFIX}" \
    -H "Origin: ${ORIGIN}" \
    -H 'Access-Control-Request-Method: POST' \
    -H 'Access-Control-Request-Headers: content-type'; then
    if grep -qi "access-control-allow-methods:.*POST" "$OPTIONS_OUTPUT" && \
       grep -qi "access-control-allow-origin: ${ORIGIN}" "$OPTIONS_OUTPUT"; then
        pass "OPTIONS responded with CORS headers";
    else
        fail "OPTIONS missing required CORS headers (see $OPTIONS_OUTPUT)";
    fi
else
    fail "OPTIONS request failed"
fi

log "[2/3] POST submission"
if curl -sS -D "$POST_OUTPUT" -o "$TMPDIR/post-body.json" -X POST "${DOMAIN}${PATH_SUFFIX}" \
    -H 'Content-Type: application/json' \
    -H "Origin: ${ORIGIN}" \
    --data "$DATA_PAYLOAD"; then
    if grep -q "200" "$POST_OUTPUT" && jq -e '.actions[0].type == "start_eftar"' "$TMPDIR/post-body.json" >/dev/null 2>&1; then
        pass "POST returned start_eftar"
    else
        fail "POST missing start_eftar (status/body in $POST_OUTPUT)"
    fi
else
    fail "POST request failed"
fi

log "[3/3] OpenAPI availability"
if curl -sS -D "$OPENAPI_OUTPUT" -o "$TMPDIR/openapi.json" "${DOMAIN}/openapi.json"; then
    if grep -q "200" "$OPENAPI_OUTPUT"; then
        pass "OpenAPI reachable"
    else
        fail "OpenAPI unexpected status (see $OPENAPI_OUTPUT)"
    fi
else
    fail "OpenAPI fetch failed"
fi

log "Verification finished successfully."
