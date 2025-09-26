#!/bin/bash

# 메모리 통계 API 빠른 테스트 스크립트
# 사용법: ./test_memory_api.sh [session_id]

SESSION_ID="${1:-TEST_SESSION}"
BASE_URL="http://localhost:8000"

echo "🔍 메모리 통계 API 테스트"
echo "Session ID: $SESSION_ID"
echo "Base URL: $BASE_URL"
echo ""

# 1. 헬스체크
echo "1️⃣ 헬스체크..."
curl -s "$BASE_URL/health" | jq -r '.status // "ERROR"'
echo ""

# 2. 메모리 통계 조회
echo "2️⃣ 메모리 통계 조회..."
response=$(curl -s "$BASE_URL/api/memory/$SESSION_ID/stats")
echo "$response" | jq .

# 3. 응답 구조 검증
echo ""
echo "3️⃣ 응답 구조 검증..."
ok=$(echo "$response" | jq -r '.ok // false')
session_id=$(echo "$response" | jq -r '.session_id // "none"')
turns_count=$(echo "$response" | jq -r '.stats.turns_count // "none"')

if [ "$ok" = "true" ]; then
    echo "✅ API 응답: OK"
    echo "✅ Session ID: $session_id"
    echo "✅ 턴 수: $turns_count"
else
    echo "❌ API 응답 실패"
    echo "$response" | jq -r '.error // "Unknown error"'
fi

echo ""
echo "🎯 테스트 완료!"

# Windows용 실행 명령어 안내
echo ""
echo "💡 Windows에서 실행하려면:"
echo "curl -s \"http://localhost:8000/api/memory/TEST_SESSION/stats\" | jq ."