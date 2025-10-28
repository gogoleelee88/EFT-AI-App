#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-https://www.moodtalk.app}"
ORIGIN="${DOMAIN}"

mask_headers() {
  sed -E '/Set-Cookie|cf-ray|x-request-id|trace-id/d'
}

print_section() {
  printf '\n== %s ==\n' "$1"
}

print_section "OPTIONS /suds"
curl -i -X OPTIONS "${DOMAIN}/suds" \
  -H "Origin: ${ORIGIN}" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type" \
  | mask_headers

print_section "POST /suds"
printf '# Expect HTTP 200 and actions[0].type == "start_eftar" with route %s\n' "/eftar"
curl -i -X POST "${DOMAIN}/suds" \
  -H "Content-Type: application/json" \
  -d '{"type":"manual","score":7}' \
  | mask_headers

print_section "legacy POST /api/suds/record"
printf '# Expect identical JSON body (actions[0].type == "start_eftar")\n'
curl -i -X POST "${DOMAIN}/api/suds/record" \
  -H "Content-Type: application/json" \
  -d '{"value":7,"source":"compare"}' \
  | mask_headers
