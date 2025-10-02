# 로그 필터링 & 로테이션 빠른 참조 가이드

## 📋 개요

운영 중 로그를 빠르게 필터링하고 관리하는 실용적인 명령어 모음입니다.

**업데이트**: 2025-10-02

---

## 🔍 1. 로그 필터링 (실시간)

### A) Nginx 액세스 로그

```bash
# 특정 경로만 보기 (/api/* 요청)
tail -f /var/log/nginx/access.log | grep '/api/'

# 특정 경로 제외하고 보기 (static 파일 제외)
tail -f /var/log/nginx/access.log | grep -v -E '\.(js|css|png|jpg|ico)'

# 특정 IP 주소 요청만 보기
tail -f /var/log/nginx/access.log | grep '192.168.1.100'

# HTTP 상태 코드별 필터링 (5xx 에러만)
tail -f /var/log/nginx/access.log | grep ' 5[0-9][0-9] '

# 느린 요청 찾기 (응답 시간 > 1초)
tail -f /var/log/nginx/access.log | awk '$NF > 1.0'

# JSON 형식으로 파싱 (jq 사용)
tail -f /var/log/nginx/access.log | jq -R 'fromjson? | select(.status >= 500)'
```

### B) Nginx 에러 로그

```bash
# 실시간 에러 모니터링
tail -f /var/log/nginx/error.log

# 특정 레벨만 보기 (error, crit, alert)
tail -f /var/log/nginx/error.log | grep '\[error\]'

# 업스트림 에러만 보기
tail -f /var/log/nginx/error.log | grep 'upstream'

# 특정 도메인 에러만 보기
tail -f /var/log/nginx/error.log | grep 'moodtalk.app'
```

### C) FastAPI 로그 (systemd journal)

```bash
# 실시간 로그 보기
sudo journalctl -u eft-ai-backend -f

# 오늘 로그만 보기
sudo journalctl -u eft-ai-backend --since today

# 최근 1시간 로그
sudo journalctl -u eft-ai-backend --since "1 hour ago"

# 특정 시간대 로그
sudo journalctl -u eft-ai-backend --since "2025-10-02 14:00" --until "2025-10-02 15:00"

# 에러 레벨만 보기
sudo journalctl -u eft-ai-backend -p err

# AI 응답 관련 로그만 보기
sudo journalctl -u eft-ai-backend -f | grep 'chat/completion'

# 느린 AI 응답 찾기 (3초 이상)
sudo journalctl -u eft-ai-backend -f | grep -E 'processing_time.*[3-9]\.[0-9]|[1-9][0-9]\.'
```

---

## 📊 2. 로그 분석 (과거 데이터)

### A) 트래픽 분석

```bash
# 오늘 전체 요청 수
cat /var/log/nginx/access.log | wc -l

# 시간대별 요청 수 (Top 10)
awk '{print $4}' /var/log/nginx/access.log | cut -d: -f2 | sort | uniq -c | sort -rn | head -10

# 가장 많이 요청된 URL (Top 20)
awk '{print $7}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -20

# IP별 요청 수 (Top 10)
awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -10

# User-Agent 분석 (봇 탐지)
awk -F'"' '{print $6}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -10
```

### B) 에러 분석

```bash
# HTTP 상태 코드 분포
awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c | sort -rn

# 5xx 에러 발생 시간 및 URL
awk '$9 ~ /5[0-9][0-9]/ {print $4, $7}' /var/log/nginx/access.log

# 가장 많은 에러를 발생시킨 IP
awk '$9 ~ /[45][0-9][0-9]/ {print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -10

# 업스트림 타임아웃 횟수
grep 'upstream timed out' /var/log/nginx/error.log | wc -l
```

### C) 성능 분석

```bash
# 평균 응답 시간 (Nginx)
awk '{sum+=$NF; count++} END {print sum/count}' /var/log/nginx/access.log

# 95 percentile 응답 시간 (대략적)
awk '{print $NF}' /var/log/nginx/access.log | sort -n | awk 'BEGIN{c=0} {a[c++]=$1} END{print a[int(c*0.95)]}'

# 가장 느린 요청 Top 10
awk '{print $NF, $7}' /var/log/nginx/access.log | sort -rn | head -10
```

---

## 🗂️ 3. 로그 로테이션 (자동화)

### A) logrotate 설정

**파일**: `/etc/logrotate.d/eft-ai`

```bash
# Nginx 로그 로테이션
/var/log/nginx/*.log {
    daily                    # 매일 로테이션
    rotate 14                # 14일 보관
    missingok                # 파일 없어도 오류 무시
    notifempty               # 빈 파일은 로테이션 안 함
    compress                 # gzip 압축
    delaycompress            # 압축을 한 주기 뒤로 연기
    sharedscripts            # 스크립트 1번만 실행
    postrotate
        # Nginx 재로드 (로그 파일 새로 열기)
        [ -f /var/run/nginx.pid ] && kill -USR1 $(cat /var/run/nginx.pid)
    endscript
}

# FastAPI 로그 로테이션 (systemd journal은 자동 관리)
# journalctl 최대 크기 설정은 /etc/systemd/journald.conf에서
```

**적용**:
```bash
# 설정 테스트
sudo logrotate -d /etc/logrotate.d/eft-ai

# 강제 로테이션 (테스트)
sudo logrotate -f /etc/logrotate.d/eft-ai

# 자동 실행 (cron에서 매일 실행됨)
ls -la /etc/cron.daily/logrotate
```

### B) systemd journal 크기 제한

**파일**: `/etc/systemd/journald.conf`

```ini
[Journal]
# 최대 디스크 사용량 (전체 로그)
SystemMaxUse=1G

# 파일당 최대 크기
SystemMaxFileSize=100M

# 보관 기간
MaxRetentionSec=14day

# 파일 개수 제한
SystemMaxFiles=20
```

**적용**:
```bash
# 설정 재로드
sudo systemctl restart systemd-journald

# 수동 정리 (오래된 로그 삭제)
sudo journalctl --vacuum-time=7d      # 7일 이상 삭제
sudo journalctl --vacuum-size=500M    # 500MB 이하로 축소
```

---

## 🚨 4. 긴급 상황별 빠른 명령어

### A) "지금 당장 에러 찾기!"

```bash
# 최근 10분간 에러 로그 (모든 소스)
{
  echo "=== Nginx Errors ==="
  tail -n 100 /var/log/nginx/error.log | grep -E '\[error\]|\[crit\]'

  echo ""
  echo "=== FastAPI Errors ==="
  sudo journalctl -u eft-ai-backend --since "10 min ago" -p err

  echo ""
  echo "=== System Errors ==="
  sudo journalctl --since "10 min ago" -p err | grep -v 'eft-ai'
} | less
```

### B) "트래픽이 폭증했다!"

```bash
# 실시간 요청 속도 (초당)
tail -f /var/log/nginx/access.log | pv -l -i 1 -r > /dev/null

# 현재 접속 IP 분포
tail -n 1000 /var/log/nginx/access.log | awk '{print $1}' | sort | uniq -c | sort -rn | head -20

# 특정 IP 차단 (임시)
sudo iptables -A INPUT -s 192.168.1.100 -j DROP
```

### C) "디스크가 가득 찼다!"

```bash
# 로그 파일 크기 확인
du -sh /var/log/nginx/*
du -sh /var/log/journal/*

# 즉시 오래된 로그 삭제
sudo journalctl --vacuum-time=1d      # 1일 이상 삭제
sudo find /var/log/nginx -name "*.gz" -mtime +7 -delete  # 7일 이상 압축 파일 삭제

# 로그 로테이션 강제 실행
sudo logrotate -f /etc/logrotate.conf
```

---

## 📈 5. 모니터링 대시보드 (실시간)

### A) 원라이너 대시보드

```bash
# 실시간 요청 모니터링
watch -n 1 'echo "=== Last 10 Requests ===" && tail -n 10 /var/log/nginx/access.log | awk "{print \$4, \$7, \$9, \$NF}" && echo "" && echo "=== Error Count ===" && grep -c "\[error\]" /var/log/nginx/error.log'

# AI 서버 상태 모니터링
watch -n 2 'echo "=== FastAPI Status ===" && sudo systemctl status eft-ai-backend --no-pager -l | head -20 && echo "" && echo "=== Recent AI Requests ===" && sudo journalctl -u eft-ai-backend -n 5 --no-pager | grep "POST /api/chat"'
```

### B) GoAccess (웹 대시보드)

```bash
# 설치
sudo apt install goaccess -y

# 실시간 웹 대시보드 (포트 7890)
sudo goaccess /var/log/nginx/access.log -o /tmp/report.html --log-format=COMBINED --real-time-html --ws-url=ws://0.0.0.0:7890 --port=7890 --daemonize

# 접속: http://localhost:7890/tmp/report.html
# 종료: sudo pkill goaccess
```

---

## 🛠️ 6. 고급 팁

### A) 복잡한 필터링 (jq 활용)

```bash
# Nginx 로그를 JSON으로 변환 후 분석
tail -f /var/log/nginx/access.log | \
  awk '{print "{\"ip\":\""$1"\",\"time\":\""$4" "$5"\",\"method\":\""$6"\",\"url\":\""$7"\",\"status\":"$9",\"size\":"$10",\"response_time\":"$NF"}"}' | \
  jq -r 'select(.status >= 400) | "\(.time) \(.url) \(.status)"'
```

### B) 로그 스트리밍 (원격 서버로)

```bash
# rsyslog 설정으로 원격 서버로 실시간 전송
# /etc/rsyslog.d/50-eft-ai.conf:
# *.* @@log-server.example.com:514

# 재시작
sudo systemctl restart rsyslog
```

### C) Prometheus Exporter (메트릭 추출)

```bash
# nginx-prometheus-exporter 설치
docker run -p 9113:9113 nginx/nginx-prometheus-exporter:latest -nginx.scrape-uri=http://localhost:8080/stub_status

# 메트릭 확인
curl http://localhost:9113/metrics
```

---

## 📞 지원

**문제 발생 시 수집할 정보:**
```bash
# 1분 안에 모든 정보 수집
{
  echo "=== Timestamp ==="
  date

  echo ""
  echo "=== Nginx Errors (Last 50) ==="
  tail -n 50 /var/log/nginx/error.log

  echo ""
  echo "=== FastAPI Errors (Last 20) ==="
  sudo journalctl -u eft-ai-backend -n 20 -p err

  echo ""
  echo "=== Disk Usage ==="
  df -h /var/log

  echo ""
  echo "=== Service Status ==="
  sudo systemctl status nginx eft-ai-backend --no-pager
} > ~/debug_$(date +%Y%m%d_%H%M%S).log

# 생성된 파일을 지원팀에 전송
ls -lh ~/debug_*.log
```

---

**마지막 업데이트**: 2025-10-02
**버전**: 1.0.0 (로그 필터링 & 로테이션)
