#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-}"
ACCESS_TOKEN="${ACCESS_TOKEN:-}"
TENANT_ID="${TENANT_ID:-}"

if [[ -z "$BASE_URL" || -z "$ACCESS_TOKEN" || -z "$TENANT_ID" ]]; then
  echo "BASE_URL, ACCESS_TOKEN, TENANT_ID are required"
  exit 2
fi

auth_header=("Authorization: Bearer ${ACCESS_TOKEN}")
tenant_header=("X-Tenant-Id: ${TENANT_ID}")

create_resp="$(curl -fsS -X POST "${BASE_URL}/api/v1/meals" \
  -H "${auth_header[0]}" -H "${tenant_header[0]}" \
  -H "Content-Type: application/json" -H "Idempotency-Key: SMOKE-MEAL-1-$(date +%s)" \
  --data '{"meal_state":"ATE","source":"manual"}')"
meal_id="$(echo "$create_resp" | jq -r '.meal_id')"
[[ -n "$meal_id" && "$meal_id" != "null" ]]
echo "meal_id=${meal_id}"

tmp_img="$(mktemp -t mealv1.XXXXXX.jpg)"
printf '\xff\xd8\xff\xe0fakejpg' > "$tmp_img"

upload_resp="$(curl -fsS -X POST "${BASE_URL}/api/v1/meals/${meal_id}/photos/upload" \
  -H "${auth_header[0]}" -H "${tenant_header[0]}" \
  -H "Idempotency-Key: SMOKE-MEAL-2-$(date +%s)" \
  -F "raw_store=false" \
  -F "files=@${tmp_img};type=image/jpeg")"
upload_count="$(echo "$upload_resp" | jq '.uploaded | length')"
[[ "$upload_count" -ge 1 ]]

estimate_resp="$(curl -fsS -X POST "${BASE_URL}/api/v1/meals/${meal_id}/estimate" \
  -H "${auth_header[0]}" -H "${tenant_header[0]}" \
  -H "Content-Type: application/json" -H "Idempotency-Key: SMOKE-MEAL-3-$(date +%s)" \
  --data '{"track":"AUTO","force_recompute":true}')"
track_used="$(echo "$estimate_resp" | jq -r '.track_used')"
[[ "$track_used" == "A" || "$track_used" == "B" ]]

post_check_resp="$(curl -fsS -X POST "${BASE_URL}/api/v1/meals/${meal_id}/post-check" \
  -H "${auth_header[0]}" -H "${tenant_header[0]}" \
  -H "Content-Type: application/json" -H "Idempotency-Key: SMOKE-MEAL-4-$(date +%s)" \
  --data '{"slot":"T30","sleepiness":2,"focus_drop":2,"sluggishness":2,"gi_discomfort":0,"headache":0,"caffeine_used":false}')"
dip_partial="$(echo "$post_check_resp" | jq '.dip_score_partial')"
[[ "$dip_partial" -ge 0 && "$dip_partial" -le 100 ]]

advice_resp="$(curl -fsS -X GET "${BASE_URL}/api/v1/meals/${meal_id}/advice" \
  -H "${auth_header[0]}" -H "${tenant_header[0]}")"
decision_mode="$(echo "$advice_resp" | jq -r '.decision_mode')"
task_mode="$(echo "$advice_resp" | jq -r '.task_mode')"
[[ -n "$decision_mode" && "$decision_mode" != "null" ]]
[[ -n "$task_mode" && "$task_mode" != "null" ]]

echo "SMOKE_MEAL_V1_OK"
echo "decision_mode=${decision_mode} task_mode=${task_mode}"

