# 모니터링 & 헬스체크 시스템

## 📋 개요

EFT AI 앱의 완전한 모니터링 및 장애 대응 시스템입니다.

**목표**: 장애 예방 + 빠른 감지 + 자동 복구 + 체계적 대응

**업데이트**: 2025-10-02

---

## 📁 파일 구조

```
monitoring/
├── systemd-service-example.conf    # systemd 자동재시작 설정
├── uptime-kuma-setup.sh            # Uptime-Kuma 모니터링 설치
├── telemetry.ts                    # 프론트엔드 텔레메트리 핑
├── log-filtering-guide.md          # 로그 필터링 & 로테이션 가이드
├── extended-diagnostic.sh          # 확장된 자가진단 스크립트
├── operational-checklist.md        # 운영 체크리스트
├── incident-response-playbook.md   # 인시던트 대응 플레이북
├── prometheus-blackbox.yml         # Prometheus Blackbox (선택)
└── README.md                       # 이 파일
```

---

## 🚀 빠른 시작 (Quick Start)

### 1단계: systemd 자동재시작 설정 (필수)

```bash
# 1. 설정 파일 복사
mkdir -p ~/.config/systemd/user
cp systemd-service-example.conf ~/.config/systemd/user/eft-api.service

# 2. 경로 수정 (실제 경로로 변경)
nano ~/.config/systemd/user/eft-api.service
# WorkingDirectory=/home/moodtalk/tocmood/moodtalk-public
# ExecStart=/home/moodtalk/tocmood/moodtalk-public/.venv/bin/python -m uvicorn ...

# 3. 서비스 등록
systemctl --user daemon-reload
systemctl --user enable eft-api
systemctl --user start eft-api

# 4. 확인
systemctl --user status eft-api
```

**성공 기준:**
- `Active: active (running)` 상태
- 프로세스 kill 시 3초 내 자동 재시작

### 2단계: Uptime-Kuma 모니터링 (강력 추천)

```bash
# 1. Docker 설치 확인
docker --version

# 2. Uptime-Kuma 실행
chmod +x uptime-kuma-setup.sh
./uptime-kuma-setup.sh

# 3. 웹 UI 접속
# http://localhost:3001

# 4. 모니터 추가
# - API Health: https://moodtalk.app/api/health (60초마다)
# - Frontend: https://moodtalk.app (5분마다)
# - LLM Health: https://moodtalk.app/llm/health (2분마다)
```

**성공 기준:**
- Uptime-Kuma 대시보드 접속 가능
- 모든 모니터 Green 상태
- 알림 테스트 성공

### 3단계: 프론트엔드 텔레메트리 (선택사항)

```typescript
// frontend/src/App.tsx에 추가

import { bootSmoke, startPeriodicPing } from '@/monitoring/telemetry';

function App() {
  useEffect(() => {
    // 앱 부팅 시 자동 헬스체크
    bootSmoke().then(result => {
      if (!result.success) {
        console.error('Backend unreachable', result.errors);
        // 오프라인 UI 표시
      }
    });

    // 주기적 활동 추적 (1분마다)
    const stopPing = startPeriodicPing(60000);

    return () => stopPing(); // 컴포넌트 언마운트 시 중단
  }, []);

  // ...
}
```

**성공 기준:**
- 앱 시작 시 백엔드 헬스체크 자동 실행
- 1분마다 활동 핑 전송
- 네트워크 장애 시 적절한 오프라인 UI 표시

### 4단계: 로그 관리 설정

```bash
# 1. logrotate 설정
sudo cp log-filtering-guide.md /tmp/
# 가이드 참고하여 /etc/logrotate.d/eft-ai 설정

# 2. systemd journal 크기 제한
sudo nano /etc/systemd/journald.conf
# SystemMaxUse=1G
# MaxRetentionSec=14day

sudo systemctl restart systemd-journald

# 3. 확인
sudo logrotate -d /etc/logrotate.d/eft-ai
journalctl --disk-usage
```

**성공 기준:**
- Nginx 로그 자동 로테이션 (14일 보관)
- journalctl 크기 < 1GB
- 오래된 로그 자동 삭제

---

## 📊 운영 가이드

### 일일 점검 (5분)

```bash
# 서비스 상태
systemctl --user status eft-api

# 엔드포인트 체크
curl -I https://moodtalk.app/api/health

# 최근 에러
sudo journalctl -u eft-api --since "1 hour ago" -p err --no-pager
```

**체크리스트:** `operational-checklist.md` 참조

### 주간 점검 (30분)

- 디스크 사용량 확인 (`df -h`)
- 백업 상태 확인
- 보안 패치 적용
- 성능 분석 (응답 시간, 에러율)

**체크리스트:** `operational-checklist.md` 참조

### 월간 점검 (1시간)

- 시스템 업데이트 (`apt upgrade`)
- 로그 로테이션 검증
- 용량 계획 검토
- 모니터링 시스템 점검

**체크리스트:** `operational-checklist.md` 참조

---

## 🚨 장애 대응

### 장애 감지 시 (2분 내)

```bash
# 1. 자동 진단 실행
cd ~/EFT-AI-App/monitoring
./extended-diagnostic.sh

# 2. 핵심 정보 수집
{
  date
  systemctl --user status eft-api --no-pager
  tail -n 50 ~/logs/eft-api.log
  curl -I https://moodtalk.app/api/health
} > ~/incident_$(date +%Y%m%d_%H%M%S).log
```

### 즉시 복구 시도 (5분 내)

```bash
# 1. 서비스 재시작
systemctl --user restart eft-api

# 2. 확인
systemctl --user status eft-api
curl -I https://moodtalk.app/api/health

# 3. 5회 연속 테스트
for i in {1..5}; do curl -sS https://moodtalk.app/api/health; sleep 2; done
```

### 에스컬레이션 (10분 이후)

**조건:**
- 10분 내 복구 불가
- 근본 원인 미파악
- 데이터 손실 의심
- 보안 침해 가능성

**절차:** `incident-response-playbook.md` 참조

---

## 🛠️ 고급 기능

### A) Prometheus + Blackbox Exporter (선택사항)

```bash
# 1. Docker Compose 설정
cd ~/eft-monitoring
cp prometheus-blackbox.yml docker-compose.yml

# blackbox-config.yml, prometheus-config.yml 생성 (파일 내 가이드 참조)

# 2. 실행
docker-compose up -d

# 3. 접속
# Prometheus: http://localhost:9090
# Grafana: http://localhost:3002 (admin/admin)
```

**성공 기준:**
- Prometheus Targets 모두 UP
- Grafana 대시보드에서 메트릭 확인
- 응답 시간, 성공률, SSL 만료일 모니터링

### B) 자동 복구 스크립트 (Self-Healing)

```bash
# 1. 자가 치유 스크립트 생성
cat << 'EOF' > ~/self-healing.sh
#!/bin/bash
if ! curl -fsS --max-time 5 https://moodtalk.app/api/health > /dev/null; then
  echo "API unhealthy, restarting..."
  systemctl --user restart eft-api
  sleep 10
  if curl -fsS --max-time 5 https://moodtalk.app/api/health > /dev/null; then
    echo "Recovery successful" | mail -s "[Auto-Recovery] API Restarted" admin@example.com
  else
    echo "Recovery failed!" | mail -s "[Alert] API Down" admin@example.com
  fi
fi
EOF

chmod +x ~/self-healing.sh

# 2. cron 등록 (5분마다)
(crontab -l 2>/dev/null; echo "*/5 * * * * ~/self-healing.sh >> ~/self-healing.log 2>&1") | crontab -
```

### C) 로그 실시간 대시보드 (GoAccess)

```bash
# 설치
sudo apt install goaccess -y

# 실시간 웹 대시보드 (포트 7890)
goaccess /var/log/nginx/access.log \
  -o /tmp/report.html \
  --log-format=COMBINED \
  --real-time-html \
  --ws-url=ws://0.0.0.0:7890 \
  --port=7890 \
  --daemonize

# 접속: http://localhost:7890/tmp/report.html
```

---

## 📚 참고 문서

### 핵심 가이드

1. **systemd-service-example.conf**
   - 자동 재시작 설정
   - 리소스 제한
   - 로깅 설정

2. **uptime-kuma-setup.sh**
   - 모니터링 대시보드 설치
   - 알림 설정 가이드
   - Nginx 프록시 설정

3. **telemetry.ts**
   - 프론트엔드 헬스체크
   - 주기적 활동 추적
   - 에러 리포팅

4. **log-filtering-guide.md**
   - 실시간 로그 필터링
   - 로그 분석 명령어
   - 로그 로테이션 설정

5. **extended-diagnostic.sh**
   - 자동 진단 스크립트
   - 응답 시간 측정
   - 2분 내 정보 수집

6. **operational-checklist.md**
   - 일일/주간/월간 점검
   - 성공 기준 (KPI)
   - 보안 점검

7. **incident-response-playbook.md**
   - 장애 대응 절차
   - 복구 시나리오
   - 사후 분석

8. **prometheus-blackbox.yml**
   - Prometheus 설정
   - Grafana 대시보드
   - 메트릭 수집

### 외부 리소스

- [Uptime-Kuma 공식 문서](https://github.com/louislam/uptime-kuma)
- [systemd 서비스 가이드](https://www.freedesktop.org/software/systemd/man/systemd.service.html)
- [Prometheus Blackbox Exporter](https://github.com/prometheus/blackbox_exporter)
- [GoAccess 실시간 로그](https://goaccess.io/)

---

## ✅ 구축 완료 체크리스트

### 기본 설정 (필수)
- [ ] systemd 자동재시작 설정 완료
- [ ] Uptime-Kuma 모니터링 실행 중
- [ ] 로그 로테이션 설정 완료
- [ ] 엔드포인트 헬스체크 정상

### 고급 기능 (선택)
- [ ] 프론트엔드 텔레메트리 통합
- [ ] Prometheus + Blackbox Exporter 설치
- [ ] 자동 복구 스크립트 cron 등록
- [ ] GoAccess 실시간 대시보드

### 운영 준비
- [ ] 운영 체크리스트 숙지
- [ ] 인시던트 대응 플레이북 숙지
- [ ] 긴급 연락망 확인
- [ ] 백업 복구 절차 테스트

### 알림 설정
- [ ] Uptime-Kuma 알림 채널 등록 (Telegram/Discord/Email)
- [ ] 알림 테스트 성공
- [ ] 디스크 사용량 알림 설정
- [ ] 에러 발생 시 자동 알림

---

## 📞 지원

**문제 발생 시:**
1. `extended-diagnostic.sh` 실행
2. `incident-response-playbook.md` 참조
3. 생성된 로그 파일 확인 (`~/incident_*.log`)
4. 팀에 알림 (Slack/Discord)

**문의:**
- GitHub Issues: [프로젝트 저장소]
- Email: admin@moodtalk.app

---

**마지막 업데이트**: 2025-10-02
**버전**: 1.0.0
**다음 리뷰**: 1개월 후 또는 메이저 인시던트 발생 시
