# 인시던트 대응 플레이북 (Incident Response Playbook)

## 📋 개요

장애 발생 시 2분 내 핵심 정보를 수집하고 체계적으로 대응하기 위한 실전 가이드입니다.

**목표**: 장애 발견 → 2분 내 정보 수집 → 5분 내 복구 시도 → 10분 내 에스컬레이션 판단

**업데이트**: 2025-10-02

---

## 🚨 Phase 1: 장애 감지 (0~30초)

### A) 장애 확인

**증상 체크리스트:**
- [ ] 사용자 신고 접수 (채팅/이메일/SNS)
- [ ] 모니터링 알림 수신 (Uptime-Kuma)
- [ ] 직접 확인: https://moodtalk.app 접속 불가
- [ ] API 호출 실패 (프론트엔드 콘솔 에러)

**장애 유형 판단:**
```bash
# 빠른 증상 확인 (30초 내)
curl -I https://moodtalk.app                    # 프론트엔드
curl -I https://moodtalk.app/api/health        # 백엔드 API
curl -I https://moodtalk.app/llm/health        # LLM 서버
```

**장애 분류:**
- **Level 1 (Critical)**: 전체 서비스 다운
- **Level 2 (High)**: 핵심 기능 불가 (AI 채팅 등)
- **Level 3 (Medium)**: 부분 기능 장애
- **Level 4 (Low)**: 성능 저하

---

## 🔍 Phase 2: 정보 수집 (30초~2분)

### A) 자동 진단 스크립트 실행

```bash
# 1. 확장 진단 스크립트 (90초 완료)
cd ~/EFT-AI-App/monitoring
./extended-diagnostic.sh

# 2. 빠른 로그 수집 (30초)
{
  echo "=== Timestamp ==="
  date

  echo ""
  echo "=== Service Status ==="
  sudo systemctl status nginx eft-ai-backend --no-pager | head -30

  echo ""
  echo "=== Recent Errors (Nginx) ==="
  tail -n 50 /var/log/nginx/error.log

  echo ""
  echo "=== Recent Errors (FastAPI) ==="
  sudo journalctl -u eft-ai-backend -n 50 --no-pager -p err

  echo ""
  echo "=== Active Connections ==="
  ss -tunap | grep -E ':80|:443|:8000|:8002' | head -20

  echo ""
  echo "=== System Resources ==="
  free -h
  df -h | grep -E '^Filesystem|/$|/var'

} > ~/incident_$(date +%Y%m%d_%H%M%S).log

# 생성된 로그 파일 확인
ls -lh ~/incident_*.log | tail -1
```

### B) 핵심 정보 체크리스트

**인프라 레벨:**
- [ ] 서버 응답: `ping moodtalk.app` (네트워크)
- [ ] DNS 정상: `nslookup moodtalk.app` (DNS)
- [ ] Nginx 프로세스: `ps aux | grep nginx` (웹서버)
- [ ] FastAPI 프로세스: `ps aux | grep uvicorn` (AI 서버)

**애플리케이션 레벨:**
- [ ] API 엔드포인트: `curl https://moodtalk.app/api/health`
- [ ] LLM 엔드포인트: `curl https://moodtalk.app/llm/health`
- [ ] 프론트엔드: `curl -I https://moodtalk.app`
- [ ] 에러 로그: 최근 100줄 확인

**리소스 레벨:**
- [ ] CPU 사용률: `top -bn1 | head -20`
- [ ] 메모리 사용: `free -h`
- [ ] 디스크 공간: `df -h`
- [ ] 네트워크: `ss -tunap | wc -l` (연결 수)

---

## 🛠️ Phase 3: 즉시 복구 시도 (2~5분)

### A) 레벨별 복구 절차

#### **Level 1: 서비스 재시작 (가장 빠른 해결책)**

```bash
# 1. 백엔드 서비스 재시작
sudo systemctl restart eft-ai-backend

# 2. Nginx 재시작
sudo systemctl restart nginx

# 3. 상태 확인
sudo systemctl status nginx eft-ai-backend --no-pager

# 4. 엔드포인트 테스트
curl -I https://moodtalk.app/api/health
```

**복구 확인:**
- [ ] 서비스 Active (running) 상태
- [ ] API /health → HTTP 200
- [ ] 프론트엔드 정상 접속
- [ ] 사용자 기능 테스트 (AI 채팅)

#### **Level 2: 캐시/설정 재로드**

```bash
# 1. Nginx 설정 재로드 (재시작 없이)
sudo nginx -t                    # 설정 검증
sudo systemctl reload nginx      # 재로드

# 2. Cloudflare 캐시 퍼지 (필요 시)
# Cloudflare Dashboard → Caching → Purge Everything

# 3. 브라우저 캐시 무시 테스트
curl -H "Cache-Control: no-cache" https://moodtalk.app
```

#### **Level 3: 리소스 문제 해결**

```bash
# 1. 디스크 가득 참
sudo journalctl --vacuum-time=1d    # 오래된 로그 삭제
sudo find /var/log/nginx -name "*.gz" -mtime +3 -delete  # 압축 로그 삭제

# 2. 메모리 부족
sudo systemctl restart eft-ai-backend  # 메모리 누수 프로세스 재시작
# 필요 시: 서버 재부팅

# 3. CPU 과부하
# 임시 트래픽 제한
sudo iptables -A INPUT -p tcp --dport 443 -m limit --limit 100/min -j ACCEPT
```

### B) 복구 검증

```bash
# 1. 헬스체크 스크립트
for i in {1..5}; do
  echo "=== Attempt $i ==="
  curl -sS https://moodtalk.app/api/health | jq '.'
  sleep 2
done

# 2. 부하 테스트 (경량)
ab -n 100 -c 10 https://moodtalk.app/api/health

# 3. AI 채팅 테스트
curl -X POST https://moodtalk.app/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"테스트","conversation_history":[]}'
```

**복구 성공 기준:**
- [ ] 5회 연속 HTTP 200 응답
- [ ] 평균 응답 시간 < 1초
- [ ] 에러 로그 증가 없음
- [ ] AI 채팅 정상 작동

---

## 📢 Phase 4: 사용자 커뮤니케이션 (5~10분)

### A) 장애 공지 템플릿

#### **초기 공지 (5분 내)**
```
[긴급] 서비스 일시 장애 안내

현재 EFT AI 앱에 일시적인 접속 장애가 발생했습니다.

🕐 발생 시각: 2025-10-02 15:30
🔧 현재 상태: 복구 진행 중
⏰ 예상 복구: 10분 이내

불편을 드려 죄송합니다. 빠르게 복구하겠습니다.

- EFT AI 팀
```

#### **복구 완료 공지**
```
[복구 완료] 서비스 정상화 안내

EFT AI 앱 서비스가 정상 복구되었습니다.

✅ 복구 완료: 2025-10-02 15:40
⏱️ 장애 시간: 약 10분
🔍 원인: [간단한 설명]

이용에 불편을 드려 대단히 죄송합니다.

- EFT AI 팀
```

### B) 공지 채널

**우선순위:**
1. **앱 내 배너** (긴급 공지)
2. **이메일** (등록 사용자)
3. **SNS** (공식 계정)
4. **상태 페이지** (https://status.moodtalk.app)

---

## 🚀 Phase 5: 에스컬레이션 (10분 이후)

### A) 에스컬레이션 조건

**즉시 에스컬레이션:**
- [ ] 10분 내 복구 불가능
- [ ] 근본 원인 파악 실패
- [ ] 데이터 손실/손상 의심
- [ ] 보안 침해 가능성
- [ ] 인프라 전체 장애 (클라우드)

### B) 에스컬레이션 절차

```bash
# 1. 팀 알림
# Slack/Discord/Telegram으로 긴급 알림 발송

# 2. 외부 지원 요청
# - Vercel Support (프론트엔드)
# - Railway Support (백엔드)
- Cloudflare Support (CDN/DNS)

# 3. 전문가 상담
# - HuggingFace (AI 모델)
# - Firebase/Supabase (데이터베이스)
```

### C) 장기 복구 계획

**30분 이상 장애 시:**
1. **임시 우회 방법** 제공 (오프라인 모드 등)
2. **백업 복구** 준비 (데이터베이스)
3. **대체 인프라** 전환 검토
4. **사용자 보상** 계획 (프리미엄 무료 연장 등)

---

## 📊 Phase 6: 사후 분석 (복구 후 24시간 내)

### A) 인시던트 리포트 작성

**필수 포함 내용:**
```markdown
# 인시던트 리포트

## 1. 요약
- 발생 시각: 2025-10-02 15:30
- 복구 시각: 2025-10-02 15:40
- 장애 시간: 10분
- 영향 범위: 전체 사용자 (약 500명)

## 2. 근본 원인 (Root Cause)
- [기술적 원인 상세 설명]
- [발생 경로 및 메커니즘]

## 3. 타임라인
- 15:30 - 장애 감지
- 15:31 - 진단 스크립트 실행
- 15:33 - Nginx 재시작 시도
- 15:35 - 근본 원인 파악 (디스크 가득 찬 상태)
- 15:37 - 로그 정리 후 서비스 재시작
- 15:40 - 복구 완료

## 4. 복구 조치
- [취한 조치들]

## 5. 재발 방지 대책
- [ ] 디스크 사용량 자동 모니터링 추가
- [ ] 로그 로테이션 주기 단축 (14일 → 7일)
- [ ] 알림 임계값 조정 (80% → 70%)
- [ ] 예방적 정리 스크립트 cron 등록

## 6. 교훈 (Lessons Learned)
- [배운 점]
- [개선할 점]
```

### B) 개선 작업 등록

```bash
# 1. GitHub Issue 생성
# 제목: [Incident] 2025-10-02 디스크 부족 장애 재발 방지
# 라벨: incident, high-priority, infrastructure

# 2. 할 일 등록
- [ ] 디스크 모니터링 강화
- [ ] 자동 정리 스크립트 추가
- [ ] 알림 임계값 조정
- [ ] 운영 문서 업데이트
```

---

## 🔧 Phase 7: 예방 조치 (복구 후 1주일 내)

### A) 모니터링 강화

```bash
# 1. 디스크 사용량 모니터링 추가 (cron)
cat << 'EOF' | crontab -
# 디스크 사용량 체크 (1시간마다)
0 * * * * df -h / | awk 'NR==2 {if ($5+0 > 80) system("echo Disk usage: " $5 " | mail -s \"[Alert] Disk High\" admin@example.com")}'
EOF

# 2. Uptime-Kuma 모니터 추가
# - 엔드포인트: /api/health
# - 간격: 1분
# - 알림: Telegram/Discord

# 3. 로그 크기 모니터링
cat << 'EOF' >> /etc/cron.daily/log-size-check
#!/bin/bash
LOG_SIZE=$(du -sm /var/log | awk '{print $1}')
if [ $LOG_SIZE -gt 5000 ]; then
  echo "Log directory exceeds 5GB: ${LOG_SIZE}MB" | mail -s "[Alert] Log Size High" admin@example.com
fi
EOF
chmod +x /etc/cron.daily/log-size-check
```

### B) 자동 복구 메커니즘

```bash
# 1. 서비스 자동 재시작 (systemd)
# /etc/systemd/system/eft-ai-backend.service에 추가:
[Service]
Restart=always
RestartSec=3
StartLimitInterval=600
StartLimitBurst=10

# 2. 자가 치유 스크립트 (cron)
cat << 'EOF' > ~/self-healing.sh
#!/bin/bash
# API 헬스체크
if ! curl -fsS --max-time 5 https://moodtalk.app/api/health > /dev/null; then
  echo "API unhealthy, restarting..."
  sudo systemctl restart eft-ai-backend
  sleep 10
  # 재확인
  if curl -fsS --max-time 5 https://moodtalk.app/api/health > /dev/null; then
    echo "Recovery successful" | mail -s "[Auto-Recovery] API Restarted" admin@example.com
  else
    echo "Recovery failed, manual intervention needed" | mail -s "[Alert] API Down" admin@example.com
  fi
fi
EOF

chmod +x ~/self-healing.sh

# cron 등록 (5분마다)
(crontab -l 2>/dev/null; echo "*/5 * * * * ~/self-healing.sh >> ~/self-healing.log 2>&1") | crontab -
```

---

## 📞 연락처 및 리소스

### A) 긴급 연락망

**1차 대응팀:**
- 개발자 A: +82-10-1234-5678 (Slack: @developer_a)
- 개발자 B: +82-10-2345-6789 (Slack: @developer_b)

**2차 에스컬레이션:**
- 시스템 관리자: admin@example.com
- CTO: cto@example.com

**외부 지원:**
- Vercel Support: support@vercel.com
- Cloudflare: https://dash.cloudflare.com/support

### B) 핵심 문서

- [시스템 아키텍처](../docs/architecture.md)
- [API 문서](../docs/api-docs.md)
- [배포 가이드](../DEPLOYMENT_CHECK_GUIDE.md)
- [로그 필터링 가이드](./log-filtering-guide.md)
- [운영 체크리스트](./operational-checklist.md)

### C) 진단 도구

```bash
# 빠른 진단 명령어 모음
alias incident-check='sudo systemctl status nginx eft-ai-backend --no-pager'
alias incident-logs='tail -n 100 /var/log/nginx/error.log && sudo journalctl -u eft-ai-backend -n 100 --no-pager'
alias incident-restart='sudo systemctl restart nginx eft-ai-backend'
alias incident-full='./extended-diagnostic.sh'

# .bashrc에 추가
echo "
# Incident Response Aliases
alias incident-check='sudo systemctl status nginx eft-ai-backend --no-pager'
alias incident-logs='tail -n 100 /var/log/nginx/error.log && sudo journalctl -u eft-ai-backend -n 100 --no-pager'
alias incident-restart='sudo systemctl restart nginx eft-ai-backend'
alias incident-full='cd ~/EFT-AI-App/monitoring && ./extended-diagnostic.sh'
" >> ~/.bashrc

source ~/.bashrc
```

---

## ✅ 최종 체크리스트

**장애 대응 완료 확인:**
- [ ] 서비스 완전 복구 (5회 연속 헬스체크 성공)
- [ ] 사용자 공지 발송 (복구 완료)
- [ ] 인시던트 로그 저장 (~/incident_*.log)
- [ ] 타임라인 기록 (시작~종료 시각)
- [ ] 근본 원인 파악 완료
- [ ] 재발 방지 대책 수립
- [ ] 인시던트 리포트 작성 (24시간 내)
- [ ] 개선 작업 티켓 등록
- [ ] 팀 회고 회의 일정 잡기

---

**마지막 업데이트**: 2025-10-02
**버전**: 1.0.0 (인시던트 대응 플레이북)
**다음 리뷰**: 3개월 후 또는 다음 인시던트 발생 시
