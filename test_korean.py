#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import requests
import json
import os

# 한국어 요청 테스트
url = "http://localhost:8000/api/chat"
API_KEY = os.getenv("PREMIUM_API_KEY", "TEST_PREMIUM_KEY_PLACEHOLDER")
headers = {
    "Content-Type": "application/json; charset=utf-8",
    "X-API-Key": API_KEY
}

data = {
    "message": "안녕하세요, 오늘 너무 스트레스받아서 힘들어요",
    "temperature": 0.7,
    "max_tokens": 300
}

try:
    response = requests.post(url, headers=headers, json=data)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
