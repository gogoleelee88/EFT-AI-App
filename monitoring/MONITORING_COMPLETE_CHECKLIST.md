# 모니터링 시스템 완성 체크리스트

## 📋 개요

모니터링 & 헬스체크 시스템 구축 완료 확인용 체크리스트입니다.

**업데이트**: 2025-10-02

---

## ✅ Phase 1: systemd 자동재시작 (필수)

### 1.1 서비스 파일 설정

```bash
# 1. 설정 파일 복사
mkdir -p ~/.config/systemd/user
cp monitoring/systemd-service-example.conf ~/.config/systemd/user/eft-api.service

# 2. 경로 수정 (실제 환경에 맞게)
nano ~/.config/systemd/user/eft-api.service
# WorkingDirectory=/home/moodtalk/tocmood/moodtalk-public
# ExecStart=/home/moodtalk/tocmood/moodtalk-public/.venv/bin/python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

**체크리스트:**
- [ ] `WorkingDirectory` 경로 확인
- [ ] `ExecStart` 경로 및 명령어 확인
- [ ] `Restart=always` 설정 확인
- [ ] `RestartSec=3` 설정 확인

### 1.2 서비스 등록 및 활성화

```bash
# 1. systemd 재로드
systemctl --user daemon-reload

# 2. 서비스 활성화 (부팅 시 자동 시작)
systemctl --user enable eft-api

# 3. 서비스 시작
systemctl --user start eft-api

# 4. 상태 확인
systemctl --user status eft-api
```

**성공 기준:**
- [ ] `Active: active (running)` 상태
- [ ] 메모리 사용량 정상 (< 500MB)
- [ ] 프로세스 PID 확인
- [ ] 에러 메시지 없음

### 1.3 자동 재시작 테스트

```bash
# 1. PID 확인
systemctl --user status eft-api | grep 'Main PID'

# 2. 프로세스 강제 종료
kill -9 <PID>

# 3. 3초 대기
sleep 3

# 4. 재시작 확인
systemctl --user status eft-api
```

**성공 기준:**
- [ ] 3초 내 자동 재시작 확인
- [ ] 새로운 PID 할당됨
- [ ] 서비스 정상 작동 (curl로 헬스체크)

---

## ✅ Phase 2: Nginx 헬스체크 엔드포인트 (필수)

### 2.1 Nginx 설정 추가

```bash
# 1. Nginx 설정 파일 열기
sudo nano /etc/nginx/sites-available/moodtalk.app

# 2. monitoring/nginx-health-endpoint.conf 내용 추가
# location = /health { ... }
# location = /api/health { ... }

# 3. 설정 검증
sudo nginx -t

# 4. Nginx 재로드
sudo systemctl reload nginx
```

**체크리스트:**
- [ ] `/health` 엔드포인트 설정 추가
- [ ] `/api/health` 엔드포인트 설정 추가
- [ ] `Cache-Control: no-store` 헤더 확인
- [ ] CORS 헤더 설정 확인 (`Access-Control-Allow-Origin: *`)

### 2.2 헬스체크 테스트

```bash
# 1. 로컬 테스트
curl http://localhost/health
curl http://localhost/api/health

# 2. HTTPS 테스트 (실제 도메인)
curl https://moodtalk.app/health
curl https://moodtalk.app/api/health

# 3. 헤더 확인
curl -I https://moodtalk.app/health | grep -i 'cache-control'
```

**성공 기준:**
- [ ] `/health` → HTTP 200, JSON 응답
- [ ] `/api/health` → HTTP 200, JSON 응답
- [ ] `Cache-Control: no-store` 헤더 존재
- [ ] 응답 시간 < 1초

---

## ✅ Phase 3: Uptime-Kuma 모니터링 (강력 추천)

### 3.1 Uptime-Kuma 설치

```bash
# 1. Docker 설치 확인
docker --version

# 2. Uptime-Kuma 실행
chmod +x monitoring/uptime-kuma-setup.sh
./monitoring/uptime-kuma-setup.sh

# 3. 컨테이너 확인
docker ps | grep uptime-kuma
```

**체크리스트:**
- [ ] Docker 설치 완료
- [ ] Uptime-Kuma 컨테이너 실행 중
- [ ] 포트 3001 리스닝 확인
- [ ] 웹 UI 접속 가능 (http://localhost:3001)

### 3.2 모니터 설정

**웹 UI에서 설정 (http://localhost:3001):**

1. **관리자 계정 생성**
   - [ ] Username/Password 설정
   - [ ] 로그인 성공

2. **API Health Monitor 추가**
   - [ ] Monitor Type: HTTP(s)
   - [ ] Friendly Name: EFT AI - API Health
   - [ ] URL: https://moodtalk.app/api/health
   - [ ] Heartbeat Interval: 60초
   - [ ] Expected Response Code: 200
   - [ ] Expected Response Body: "ok" 또는 "status"

3. **Frontend Monitor 추가**
   - [ ] Monitor Type: HTTP(s)
   - [ ] Friendly Name: EFT AI - Frontend
   - [ ] URL: https://moodtalk.app
   - [ ] Heartbeat Interval: 300초 (5분)

4. **LLM Monitor 추가 (선택)**
   - [ ] Monitor Type: HTTP(s)
   - [ ] Friendly Name: EFT AI - LLM
   - [ ] URL: https://moodtalk.app/llm/health
   - [ ] Heartbeat Interval: 120초

### 3.3 알림 설정

```
Settings → Notifications
```

**체크리스트:**
- [ ] Notification Type 선택 (Telegram/Discord/Email/Slack)
- [ ] API Key/Webhook URL 설정
- [ ] Test Notification 성공
- [ ] Failure Threshold: 2회 연속 실패 시 알림

**성공 기준:**
- [ ] 모든 모니터 Green 상태
- [ ] 알림 테스트 수신 확인
- [ ] 대시보드에서 Uptime 99%+ 확인

---

## ✅ Phase 4: 프론트엔드 텔레메트리 (선택사항)

### 4.1 Backend 텔레메트리 엔드포인트 추가

```python
# backend/main.py에 추가

from fastapi import APIRouter
from pydantic import BaseModel
from datetime import datetime

telemetry_router = APIRouter(prefix="/telemetry", tags=["Telemetry"])

class TelemetryPing(BaseModel):
    event: str
    timestamp: int
    userAgent: str
    screenResolution: str
    timezone: str
    language: str
    pwaInstalled: bool
    serviceWorkerActive: bool

@telemetry_router.post("/ping")
async def telemetry_ping(ping: TelemetryPing):
    # 로그 기록 또는 DB 저장
    print(f"[Telemetry] {ping.event} from {ping.userAgent[:50]}...")
    return {"status": "ok", "received_at": datetime.utcnow().isoformat()}

app.include_router(telemetry_router)
```

**체크리스트:**
- [ ] 텔레메트리 라우터 추가
- [ ] `/telemetry/ping` 엔드포인트 테스트
- [ ] 로그 기록 확인

### 4.2 Frontend 통합

```typescript
// frontend/src/App.tsx

import { bootSmoke } from '@/utils/telemetry-boot-smoke';

function App() {
  useEffect(() => {
    bootSmoke().then(result => {
      if (!result.overall) {
        console.error('Backend unreachable', result);
        // 오프라인 UI 표시 (선택)
      }
    });
  }, []);

  // ...
}
```

**체크리스트:**
- [ ] `telemetry-boot-smoke.ts` 파일 복사
- [ ] App.tsx에서 `bootSmoke()` 호출
- [ ] 브라우저 콘솔에서 `[SMOKE]` 로그 확인
- [ ] localStorage에 `last_smoke_test` 저장 확인

**성공 기준:**
- [ ] 앱 시작 시 자동 헬스체크 실행
- [ ] API 성공 시 `[SMOKE] ✅ Boot smoke test passed` 로그
- [ ] API 실패 시 `[SMOKE] ❌ Boot smoke test failed` 로그

---

## ✅ Phase 5: 로그 관리 (필수)

### 5.1 logrotate 설정

```bash
# 1. logrotate 설정 파일 생성
sudo nano /etc/logrotate.d/eft-ai

# 2. monitoring/log-filtering-guide.md 참조하여 설정 작성
# /var/log/nginx/*.log {
#   daily
#   rotate 14
#   compress
#   ...
# }

# 3. 설정 테스트
sudo logrotate -d /etc/logrotate.d/eft-ai

# 4. 강제 로테이션 테스트
sudo logrotate -f /etc/logrotate.d/eft-ai
```

**체크리스트:**
- [ ] logrotate 설정 파일 생성
- [ ] `daily` (매일 로테이션)
- [ ] `rotate 14` (14일 보관)
- [ ] `compress` (gzip 압축)
- [ ] 테스트 성공

### 5.2 systemd journal 크기 제한

```bash
# 1. journald 설정 파일 열기
sudo nano /etc/systemd/journald.conf

# 2. 아래 내용 추가/수정
[Journal]
SystemMaxUse=1G
SystemMaxFileSize=100M
MaxRetentionSec=14day

# 3. journald 재시작
sudo systemctl restart systemd-journald

# 4. 디스크 사용량 확인
journalctl --disk-usage
```

**체크리스트:**
- [ ] `SystemMaxUse=1G` 설정
- [ ] `MaxRetentionSec=14day` 설정
- [ ] journald 재시작 성공
- [ ] 디스크 사용량 < 1GB 확인

**성공 기준:**
- [ ] Nginx 로그 자동 로테이션 (`.gz` 파일 생성)
- [ ] journalctl 크기 제한 동작
- [ ] 14일 이상 오래된 로그 자동 삭제

---

## ✅ Phase 6: 자가진단 스크립트 (필수)

### 6.1 Boot Smoke Test 실행

```bash
# 1. 실행 권한 부여
chmod +x monitoring/boot-smoke-test.sh

# 2. 스크립트 실행
./monitoring/boot-smoke-test.sh

# 3. 결과 확인
echo $?  # 0이면 성공
```

**성공 기준:**
- [ ] API /health: HTTP 200 (< 1초)
- [ ] LLM /v1/chat/completions: HTTP 200 (< 10초) 또는 스킵
- [ ] 정적 번들: HTTP 200, CF 캐시 확인
- [ ] 금칙어: localhost/구버전 없음
- [ ] Service Worker: 캐시 정책 검증
- [ ] index.html: 캐시 정책 검증
- [ ] 최종: `🎉 배포 자가진단 통과!`

### 6.2 Extended Diagnostic 실행

```bash
# 1. 실행 권한 부여
chmod +x monitoring/extended-diagnostic.sh

# 2. 스크립트 실행
./monitoring/extended-diagnostic.sh

# 3. 생성된 리포트 확인
ls -lh ~/eft-diagnostics/diagnostic_*.log | tail -1
```

**성공 기준:**
- [ ] 시스템 정보 수집 완료
- [ ] 서비스 상태 확인 완료
- [ ] HTTP 엔드포인트 응답 시간 측정 완료
- [ ] 로그 분석 완료
- [ ] 리포트 파일 생성 (~/eft-diagnostics/)

---

## ✅ Phase 7: 운영 프로세스 (필수)

### 7.1 일일 점검 (5분)

```bash
# 1. 서비스 상태
systemctl --user status eft-api --no-pager

# 2. 헬스체크
curl -I https://moodtalk.app/api/health

# 3. 최근 에러
journalctl --user -u eft-api --since "1 hour ago" -p err --no-pager | wc -l
```

**체크리스트:**
- [ ] 서비스 Active (running) 상태
- [ ] API /health → HTTP 200
- [ ] 최근 1시간 에러 < 5건

### 7.2 주간 점검 (30분)

```bash
# 1. 디스크 사용량
df -h

# 2. 로그 크기
du -sh /var/log/nginx /var/log/journal

# 3. 백업 확인
ls -lh ~/backups/ | tail -10
```

**체크리스트:**
- [ ] 루트 파티션 < 80%
- [ ] Nginx 로그 < 5GB
- [ ] 최근 백업 7일 이내

### 7.3 월간 점검 (1시간)

```bash
# 1. 시스템 업데이트
sudo apt update && sudo apt upgrade -y

# 2. 서비스 재시작
systemctl --user restart eft-api
sudo systemctl restart nginx

# 3. 상태 확인
./monitoring/boot-smoke-test.sh
```

**체크리스트:**
- [ ] OS 보안 패치 적용
- [ ] Python 의존성 업데이트
- [ ] 서비스 재시작 후 정상 확인
- [ ] 스모크 테스트 통과

---

## ✅ Phase 8: 장애 대응 준비 (필수)

### 8.1 인시던트 플레이북 숙지

```bash
# 플레이북 파일 확인
cat monitoring/incident-response-playbook.md
```

**체크리스트:**
- [ ] Phase 1: 장애 감지 (0~30초) 절차 숙지
- [ ] Phase 2: 정보 수집 (30초~2분) 명령어 숙지
- [ ] Phase 3: 즉시 복구 시도 (2~5분) 절차 숙지
- [ ] Phase 5: 에스컬레이션 (10분 이후) 연락망 확인

### 8.2 긴급 명령어 테스트

```bash
# 1. 긴급 정보 수집 (1분 내)
{
  date
  systemctl --user status eft-api --no-pager
  tail -n 50 /var/log/nginx/error.log
  journalctl --user -u eft-api -n 50 --no-pager
} > ~/test_incident_$(date +%Y%m%d_%H%M%S).log

# 2. 파일 생성 확인
ls -lh ~/test_incident_*.log | tail -1
```

**체크리스트:**
- [ ] 정보 수집 스크립트 실행 성공
- [ ] 로그 파일 생성 확인
- [ ] 파일 내용 확인 (모든 정보 포함)

### 8.3 복구 절차 테스트

```bash
# 1. 서비스 재시작
systemctl --user restart eft-api

# 2. 상태 확인
systemctl --user status eft-api

# 3. 헬스체크
for i in {1..5}; do
  curl -sS https://moodtalk.app/api/health
  sleep 2
done
```

**성공 기준:**
- [ ] 재시작 성공
- [ ] 5회 연속 HTTP 200 응답
- [ ] 평균 응답 시간 < 1초

---

## 🎯 최종 점검 (All-in-One)

### 종합 검증 스크립트

```bash
#!/usr/bin/env bash
# monitoring-final-check.sh

echo "=== 1. systemd 자동재시작 ==="
systemctl --user is-active eft-api && echo "✅ Active" || echo "❌ Not Active"

echo ""
echo "=== 2. Nginx 헬스체크 ==="
curl -sS https://moodtalk.app/health | grep -q "ok\|status" && echo "✅ OK" || echo "❌ Failed"

echo ""
echo "=== 3. Uptime-Kuma ==="
docker ps | grep -q uptime-kuma && echo "✅ Running" || echo "❌ Not Running"

echo ""
echo "=== 4. 로그 로테이션 ==="
ls -1 /var/log/nginx/*.gz 2>/dev/null | wc -l | awk '{if ($1 > 0) print "✅ ",$1," compressed logs"; else print "⚠️  No compressed logs yet"}'

echo ""
echo "=== 5. Boot Smoke Test ==="
./monitoring/boot-smoke-test.sh > /dev/null 2>&1 && echo "✅ Passed" || echo "❌ Failed"

echo ""
echo "=== 종합 결과 ==="
echo "모든 항목이 ✅이면 모니터링 시스템 구축 완료!"
```

**실행:**
```bash
chmod +x monitoring-final-check.sh
./monitoring-final-check.sh
```

**성공 기준:**
- [ ] systemd 자동재시작: ✅ Active
- [ ] Nginx 헬스체크: ✅ OK
- [ ] Uptime-Kuma: ✅ Running
- [ ] 로그 로테이션: ✅ (압축 로그 존재)
- [ ] Boot Smoke Test: ✅ Passed

---

## 📞 지원 및 문의

**문제 발생 시:**
1. `monitoring/incident-response-playbook.md` 참조
2. `monitoring/extended-diagnostic.sh` 실행
3. 생성된 로그 파일 확인
4. 팀에 알림 (Slack/Discord)

**참고 문서:**
- [운영 체크리스트](operational-checklist.md)
- [로그 빠른 질의](log-quick-queries.md)
- [인시던트 대응 플레이북](incident-response-playbook.md)

---

**마지막 업데이트**: 2025-10-02
**버전**: 1.0.0
**다음 리뷰**: 첫 번째 인시던트 발생 후 또는 1개월 후
