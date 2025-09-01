# test_ascii.py
import sys, requests
sys.stdout.reconfigure(encoding='utf-8')  # 콘솔이 cp949여도 안전

print("Health check...")
r = requests.get("http://localhost:8000/health", timeout=10)
print("status:", r.status_code)
print("data:", r.json())

print("\nFree model test...")
try:
    test_data = {
        'message': 'ping free model',
        'max_tokens': 64,
        'temperature': 0.7
    }
    r = requests.post('http://localhost:8000/api/chat/free', json=test_data, timeout=60)
    print("status:", r.status_code)
    if r.status_code == 200:
        data = r.json()
        print("response:", data.get('response', 'N/A'))
        print("processing_time:", data.get('processing_time', 'N/A'))
        print("tier:", data.get('tier', 'N/A'))
    else:
        print("error:", r.text[:200])
except Exception as e:
    print("FAIL:", e)

print("\nPremium model test...")
try:
    test_data = {
        'message': 'ping premium model',
        'max_tokens': 128,
        'temperature': 0.7
    }
    r = requests.post('http://localhost:8000/api/chat/premium', json=test_data, timeout=60)
    print("status:", r.status_code)
    if r.status_code == 200:
        data = r.json()
        print("response:", data.get('response', 'N/A'))
        print("processing_time:", data.get('processing_time', 'N/A'))
        print("tier:", data.get('tier', 'N/A'))
    else:
        print("error:", r.text[:200])
except Exception as e:
    print("FAIL:", e)

print("\nDone.")