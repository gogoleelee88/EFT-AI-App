# 운영 체크리스트 (Operational Checklist)

## 📋 개요

EFT AI 앱 운영 시 정기적으로 확인해야 할 핵심 항목들을 정리한 체크리스트입니다.

**업데이트**: 2025-10-02

---

## 🌅 1. 일일 체크 (Daily Checks)

### A) 서비스 상태 확인 (5분)

```bash
# 빠른 상태 확인
sudo systemctl status nginx eft-ai-backend --no-pager
```

**체크리스트:**
- [ ] Nginx 서비스 Active (running) 상태
- [ ] FastAPI 서비스 Active (running) 상태
- [ ] 두 서비스 모두 restart 카운트 0 (또는 정상 범위)
- [ ] 메모리 사용량 정상 (< 80%)

### B) 엔드포인트 헬스체크 (3분)

```bash
# API 헬스체크
curl -I https://moodtalk.app/api/health

# LLM 헬스체크 (선택사항)
curl -I https://moodtalk.app/llm/health
```

**체크리스트:**
- [ ] API /health → HTTP 200
- [ ] 응답 시간 < 1초
- [ ] LLM /health → HTTP 200 (LLM 실행 시)
- [ ] cf-cache-status: BYPASS (캐시 안 됨 확인)

### C) 에러 로그 스캔 (5분)

```bash
# 최근 1시간 에러 확인
sudo journalctl -u eft-ai-backend --since "1 hour ago" -p err --no-pager | wc -l

# Nginx 에러 확인
tail -n 100 /var/log/nginx/error.log | grep -c '\[error\]'
```

**체크리스트:**
- [ ] FastAPI 에러 < 5건/시간
- [ ] Nginx 에러 < 10건/시간
- [ ] 치명적 에러 (crit/alert) 0건
- [ ] 업스트림 타임아웃 0건

### D) 트래픽 확인 (2분)

```bash
# 오늘 전체 요청 수
cat /var/log/nginx/access.log | wc -l

# 현재 활성 연결
ss -tunap | grep -E ':80|:443' | wc -l
```

**체크리스트:**
- [ ] 일 평균 트래픽 대비 ±50% 범위 내
- [ ] 비정상 IP 스파이크 없음
- [ ] 5xx 에러율 < 1%
- [ ] 평균 응답 시간 < 500ms

---

## 📅 2. 주간 체크 (Weekly Checks)

### A) 디스크 사용량 점검 (5분)

```bash
# 전체 디스크 상태
df -h

# 로그 디렉토리 크기
du -sh /var/log/nginx /var/log/journal
```

**체크리스트:**
- [ ] 루트 파티션 사용량 < 80%
- [ ] /var 파티션 사용량 < 70%
- [ ] Nginx 로그 총합 < 5GB
- [ ] Journal 로그 총합 < 2GB (설정에 따라)

### B) 백업 확인 (10분)

```bash
# 데이터베이스 백업 확인 (Firebase/Supabase)
# 백업 자동화 스크립트 로그 확인

ls -lh ~/backups/ | tail -10
```

**체크리스트:**
- [ ] 최근 백업이 7일 이내
- [ ] 백업 파일 크기 정상 (0이 아님)
- [ ] 백업 스크립트 에러 없음
- [ ] 오프사이트 백업 동기화 완료

### C) 보안 점검 (15분)

```bash
# 실패한 로그인 시도
sudo journalctl --since "7 days ago" | grep -i 'failed\|failure' | wc -l

# 방화벽 상태
sudo ufw status

# SSL 인증서 만료일
echo | openssl s_client -connect moodtalk.app:443 2>/dev/null | openssl x509 -noout -dates
```

**체크리스트:**
- [ ] 비정상 로그인 시도 < 50건/주
- [ ] 방화벽 활성화 및 규칙 정상
- [ ] SSL 인증서 유효 (만료일 > 30일)
- [ ] 패키지 업데이트 확인 (`apt list --upgradable`)

### D) 성능 분석 (10분)

```bash
# 평균 응답 시간
awk '{sum+=$NF; count++} END {print sum/count}' /var/log/nginx/access.log

# 가장 느린 엔드포인트
awk '{print $NF, $7}' /var/log/nginx/access.log | sort -rn | head -10

# CPU/메모리 사용 추세
top -bn1 | head -20
```

**체크리스트:**
- [ ] 평균 응답 시간 < 300ms
- [ ] 느린 엔드포인트 (> 3초) 조사 완료
- [ ] CPU 사용률 < 70%
- [ ] 메모리 스왑 사용 < 10%

---

## 🗓️ 3. 월간 체크 (Monthly Checks)

### A) 시스템 업데이트 (30분)

```bash
# 패키지 업데이트 (비운영 시간대)
sudo apt update && sudo apt upgrade -y

# 서비스 재시작
sudo systemctl restart nginx eft-ai-backend
```

**체크리스트:**
- [ ] OS 보안 패치 적용
- [ ] Python 의존성 업데이트 (`pip list --outdated`)
- [ ] Nginx 버전 확인 및 업데이트
- [ ] 재시작 후 서비스 정상 확인

### B) 로그 로테이션 검증 (10분)

```bash
# 로그 로테이션 상태
ls -lh /var/log/nginx/*.gz | tail -10

# journalctl 디스크 사용량
journalctl --disk-usage
```

**체크리스트:**
- [ ] Nginx 로그 자동 압축 확인 (.gz 파일 존재)
- [ ] 오래된 로그 자동 삭제 확인 (> 14일)
- [ ] journalctl 크기 제한 동작 확인
- [ ] logrotate 에러 없음

### C) 모니터링 시스템 점검 (15분)

```bash
# Uptime-Kuma 상태
docker ps | grep uptime-kuma

# 모니터 설정 확인
curl -sS http://localhost:3001
```

**체크리스트:**
- [ ] Uptime-Kuma 컨테이너 실행 중
- [ ] 모든 모니터 Green 상태
- [ ] 알림 테스트 성공 (Telegram/Discord/Email)
- [ ] 대시보드 접근 가능

### D) 용량 계획 검토 (20분)

```bash
# 트래픽 증가 추세
awk '{print $4}' /var/log/nginx/access.log* | cut -d: -f1 | sort | uniq -c | tail -30

# 데이터베이스 크기 (Firebase/Supabase 콘솔 확인)
# AI 모델 디스크 사용량
du -sh ~/.cache/huggingface
```

**체크리스트:**
- [ ] 월간 트래픽 증가율 < 100% (예상 범위 내)
- [ ] 데이터베이스 용량 계획 (스케일업 필요성)
- [ ] AI 모델 캐시 크기 확인 (< 20GB)
- [ ] 인프라 비용 검토 및 최적화

---

## 🚨 4. 긴급 대응 체크 (Incident Response)

### A) 장애 감지 시 (2분 내 실행)

```bash
# 빠른 진단
./extended-diagnostic.sh

# 핵심 정보 수집
{
  date
  sudo systemctl status nginx eft-ai-backend --no-pager
  tail -n 50 /var/log/nginx/error.log
  sudo journalctl -u eft-ai-backend -n 50 --no-pager
} > ~/incident_$(date +%Y%m%d_%H%M%S).log
```

**체크리스트:**
- [ ] 진단 스크립트 실행 완료
- [ ] 로그 파일 저장 완료
- [ ] 장애 시작 시각 기록
- [ ] 영향 범위 파악 (사용자 수, 기능)

### B) 복구 시도 (5분 내)

```bash
# 1. 서비스 재시작
sudo systemctl restart nginx eft-ai-backend

# 2. 캐시 정리
sudo systemctl reload nginx

# 3. 임시 트래픽 제한 (필요 시)
# sudo iptables -A INPUT -p tcp --dport 443 -m limit --limit 100/min -j ACCEPT
```

**체크리스트:**
- [ ] 재시작으로 복구 시도
- [ ] 복구 성공 여부 확인
- [ ] 근본 원인 임시 파악
- [ ] 재발 방지 조치 계획

### C) 에스컬레이션 판단 (10분 내)

**에스컬레이션 조건:**
- [ ] 30분 내 복구 불가능
- [ ] 데이터 손실 위험
- [ ] 보안 침해 의심
- [ ] 인프라 장애 (클라우드/네트워크)

**에스컬레이션 절차:**
1. 관리자/개발팀 알림
2. 사용자 공지 준비 (상태 페이지)
3. 외부 지원 요청 (필요 시)
4. 백업 복구 계획 수립

---

## 📊 5. 성공 기준 (KPI)

### A) 가용성 목표
- **Uptime**: 99.5% 이상 (월 3.6시간 이내 다운타임)
- **API 응답률**: 99% 이상 HTTP 200
- **평균 응답 시간**: < 500ms

### B) 성능 목표
- **동시 사용자**: 1,000명 처리 가능
- **AI 응답 시간**: < 5초 (95 percentile)
- **에러율**: < 1% (전체 요청 대비)

### C) 보안 목표
- **SSL/TLS**: A+ 등급 (SSL Labs)
- **보안 패치**: 30일 이내 적용
- **데이터 백업**: 일 1회 자동 백업

---

## 📞 지원 연락처

**장애 발생 시 연락 순서:**
1. **1차**: 개발팀 (슬랙/텔레그램)
2. **2차**: 시스템 관리자
3. **3차**: 클라우드 지원팀 (Vercel/Railway)

**참고 자료:**
- 로그 필터링 가이드: `log-filtering-guide.md`
- 진단 스크립트: `./extended-diagnostic.sh`
- 인시던트 플레이북: `incident-response-playbook.md`

---

**마지막 업데이트**: 2025-10-02
**버전**: 1.0.0 (운영 체크리스트)
