#!/bin/bash

# Phase 1 검증: curl vs Python 완전 동등 조건 비교 스크립트

echo "============================================================"
echo "🔬 curl vs Python 완전 동등 조건 테스트"
echo "============================================================"
echo ""

# 공통 설정
URL="http://localhost:8000/api/chat/compare"
HEADERS="Content-Type: application/json"
BODY='{"message": "화가 나요", "temperature": 0.7, "max_tokens": 100}'
TIMEOUT=30

echo "📋 테스트 조건:"
echo "  URL: $URL"
echo "  Headers: $HEADERS"
echo "  Body: $BODY"
echo "  Timeout: ${TIMEOUT}초"
echo ""

# curl 테스트
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📡 curl 테스트"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
CURL_RESULT=$(curl -X POST "$URL" \
  -H "$HEADERS" \
  -d "$BODY" \
  -s \
  --max-time "$TIMEOUT")

CURL_STATUS=$?
echo "Exit Code: $CURL_STATUS"
echo ""

if [ $CURL_STATUS -eq 0 ]; then
  CURL_LLAMA3_LEN=$(echo "$CURL_RESULT" | jq -r '.llama3_response.response // ""' | wc -c)
  CURL_QWEN25_LEN=$(echo "$CURL_RESULT" | jq -r '.qwen25_response.response // ""' | wc -c)
  
  echo "✅ curl 성공!"
  echo "  llama3_response 길이: $CURL_LLAMA3_LEN 문자"
  echo "  qwen25_response 길이: $CURL_QWEN25_LEN 문자"
  echo ""
  echo "llama3_response (처음 100자):"
  echo "$CURL_RESULT" | jq -r '.llama3_response.response // "없음"' | head -c 100
  echo "..."
  echo ""
else
  echo "❌ curl 실패!"
fi

echo ""

# Python 테스트 (동등 조건)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🐍 Python 테스트 (requests 라이브러리)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd /home/moodtalk/tocmood/moodtalk-public && source .venv/bin/activate && python3 << PYEOF
import requests
import json

url = "$URL"
headers = {"$HEADERS"}
body = json.loads('$BODY')
timeout = $TIMEOUT

try:
    response = requests.post(url, headers=headers, json=body, timeout=timeout)
    print(f"Exit Code: {response.status_code}")
    print()
    
    if response.status_code == 200:
        data = response.json()
        llama3_len = len(data.get("llama3_response", {}).get("response", ""))
        qwen25_len = len(data.get("qwen25_response", {}).get("response", ""))
        
        print(f"✅ Python 성공!")
        print(f"  llama3_response 길이: {llama3_len} 문자")
        print(f"  qwen25_response 길이: {qwen25_len} 문자")
        print()
        print("llama3_response (처음 100자):")
        print(data.get("llama3_response", {}).get("response", "없음")[:100])
        print("...")
    else:
        print(f"❌ Python HTTP {response.status_code} 에러!")
except Exception as e:
    print(f"❌ Python 예외 발생: {e}")
PYEOF

echo ""
echo "============================================================"
echo "🎯 결론: curl과 Python이 동일한 조건에서 동일한 응답을 받는지 확인"
echo "============================================================"
