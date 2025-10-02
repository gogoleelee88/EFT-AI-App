# 로그 빠른 질의 레퍼런스 (Quick Log Queries)

## 📋 개요

운영 중 자주 사용하는 로그 질의 명령어 모음입니다. 복사해서 바로 실행하세요.

**업데이트**: 2025-10-02

---

## 🔍 1. journalctl 빠른 질의 (FastAPI/systemd)

### A) 기본 조회

```bash
# 최근 100줄
journalctl --user -u eft-api -n 100 --no-pager

# 실시간 모니터링
journalctl --user -u eft-api -f

# 오늘 로그만
journalctl --user -u eft-api --since today --no-pager

# 최근 1시간
journalctl --user -u eft-api --since "1 hour ago" --no-pager

# 특정 시간대
journalctl --user -u eft-api --since "2025-10-02 14:00" --until "2025-10-02 15:00" --no-pager
```

### B) 에러/경고 필터링

```bash
# 에러 레벨만 (error, crit, alert, emerg)
journalctl --user -u eft-api -p err --no-pager

# 최근 200줄 중 에러/트레이스백
journalctl --user -u eft-api -n 200 --no-pager | egrep 'ERROR|Traceback|Exception'

# 404 에러만
journalctl --user -u eft-api --no-pager | grep '404'

# 정적 파일 404 (assets)
journalctl --user -u eft-api --no-pager | egrep 'GET /assets/.*404'

# Python 트레이스백 전체
journalctl --user -u eft-api --no-pager | awk '/Traceback/,/^[^ ]/'
```

### C) 성능 분석

```bash
# 느린 요청 찾기 (3초 이상)
journalctl --user -u eft-api -n 1000 --no-pager | grep -E 'processing_time.*[3-9]\.[0-9]|[1-9][0-9]\.'

# AI 응답 시간 추출
journalctl --user -u eft-api --no-pager | grep 'chat/completion' | awk '{print $NF}'

# 평균 응답 시간 계산
journalctl --user -u eft-api --since "1 hour ago" --no-pager | \
  grep -oE 'processing_time: [0-9.]+' | \
  awk '{sum+=$2; count++} END {print "Average:", sum/count, "s"}'
```

---

## 📊 2. Nginx 액세스 로그 질의

### A) 기본 조회

```bash
# 최근 100줄
tail -n 100 /var/log/nginx/access.log

# 실시간 모니터링
tail -f /var/log/nginx/access.log

# 오늘 전체 요청 수
cat /var/log/nginx/access.log | wc -l

# 시간대별 요청 수 (Top 10)
awk '{print $4}' /var/log/nginx/access.log | cut -d: -f2 | sort | uniq -c | sort -rn | head -10
```

### B) URL/경로 분석

```bash
# 가장 많이 요청된 URL (Top 20)
awk '{print $7}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -20

# 정적 파일 요청만 (JS/CSS/이미지)
grep -E '\.(js|css|png|jpg|gif|svg|ico|woff2?)' /var/log/nginx/access.log | tail -50

# API 요청만
grep '/api/' /var/log/nginx/access.log | tail -50

# LLM 요청만
grep '/llm/' /var/log/nginx/access.log | tail -50

# 특정 번들 요청 (예: index-BcWyEr4G.js)
grep 'index-BcWyEr4G.js' /var/log/nginx/access.log
```

### C) HTTP 상태 코드 분석

```bash
# 상태 코드 분포
awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c | sort -rn

# 4xx 에러만
awk '$9 ~ /4[0-9][0-9]/ {print $4, $7, $9}' /var/log/nginx/access.log | tail -50

# 5xx 에러만
awk '$9 ~ /5[0-9][0-9]/ {print $4, $7, $9}' /var/log/nginx/access.log | tail -50

# 404 에러만 (URL 포함)
awk '$9 == 404 {print $7}' /var/log/nginx/access.log | sort | uniq -c | sort -rn

# 정적 파일 4xx/5xx
grep -E 'assets/.*\.(js|css)' /var/log/nginx/access.log | egrep '" (4|5)[0-9]{2} '
```

### D) IP 주소 분석

```bash
# IP별 요청 수 (Top 10)
awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -10

# 특정 IP 요청 추적
grep '192.168.1.100' /var/log/nginx/access.log | tail -50

# 가장 많은 에러를 발생시킨 IP
awk '$9 ~ /[45][0-9][0-9]/ {print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -10

# 봇/크롤러 탐지 (User-Agent)
awk -F'"' '{print $6}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -20
```

### E) 응답 시간 분석

```bash
# 평균 응답 시간 (마지막 컬럼이 응답 시간일 경우)
awk '{sum+=$NF; count++} END {print "Average:", sum/count, "s"}' /var/log/nginx/access.log

# 가장 느린 요청 Top 10
awk '{print $NF, $7}' /var/log/nginx/access.log | sort -rn | head -10

# 95 percentile 응답 시간
awk '{print $NF}' /var/log/nginx/access.log | sort -n | awk 'BEGIN{c=0} {a[c++]=$1} END{print a[int(c*0.95)]}'

# 1초 이상 느린 요청
awk '$NF > 1.0 {print $4, $7, $NF}' /var/log/nginx/access.log | tail -50
```

---

## 🚨 3. Nginx 에러 로그 질의

### A) 기본 조회

```bash
# 최근 100줄
tail -n 100 /var/log/nginx/error.log

# 실시간 모니터링
tail -f /var/log/nginx/error.log

# 오늘 에러 수
grep "$(date +%Y/%m/%d)" /var/log/nginx/error.log | wc -l
```

### B) 에러 레벨 필터링

```bash
# 특정 레벨만 (error, crit, alert, emerg)
grep '\[error\]' /var/log/nginx/error.log | tail -50

# crit/alert 레벨만 (심각한 에러)
egrep '\[(crit|alert|emerg)\]' /var/log/nginx/error.log | tail -50

# warn 레벨 제외한 에러
grep -v '\[warn\]' /var/log/nginx/error.log | grep '\[' | tail -50
```

### C) 특정 에러 유형

```bash
# 업스트림 에러 (백엔드 연결 실패)
grep 'upstream' /var/log/nginx/error.log | tail -50

# 업스트림 타임아웃
grep 'upstream timed out' /var/log/nginx/error.log | tail -20

# FastAPI 연결 실패
grep 'connect() failed.*127.0.0.1:8000' /var/log/nginx/error.log | tail -20

# LLM 연결 실패
grep 'connect() failed.*127.0.0.1:8002' /var/log/nginx/error.log | tail -20

# 파일 없음 (404)
grep 'open().*failed.*No such file' /var/log/nginx/error.log | tail -20

# 권한 에러
grep 'permission denied' /var/log/nginx/error.log | tail -20
```

---

## 🔎 4. 통합 질의 (복합 조건)

### A) 특정 시간대 에러 추적

```bash
# 오후 3시~4시 사이 에러 (journalctl + grep)
journalctl --user -u eft-api --since "2025-10-02 15:00" --until "2025-10-02 16:00" --no-pager | \
  egrep 'ERROR|Traceback'

# 같은 시간대 Nginx 에러
awk '$1 ~ /2025\/10\/02/ && $2 ~ /15:/ {print}' /var/log/nginx/error.log
```

### B) 특정 URL 문제 추적

```bash
# /api/chat 엔드포인트 5xx 에러
grep '/api/chat' /var/log/nginx/access.log | awk '$9 ~ /5[0-9][0-9]/ {print}'

# 해당 시각 FastAPI 로그 확인
# (위에서 시각 확인 후)
journalctl --user -u eft-api --since "2025-10-02 15:30" --until "2025-10-02 15:31" --no-pager
```

### C) 금칙어 검사 (배포 후)

```bash
# localhost 문자열 존재 여부 (번들)
curl -fsS https://moodtalk.app/assets/index-BcWyEr4G.js | grep -qi 'localhost:' && \
  echo "❌ localhost 발견!" || echo "✅ localhost 없음"

# 구버전 해시 존재 여부
curl -fsS https://moodtalk.app/assets/index-BcWyEr4G.js | grep -qi 'Cmcu9lgI' && \
  echo "❌ 구버전 해시 발견!" || echo "✅ 구버전 없음"

# 127.0.0.1 하드코딩 검사
curl -fsS https://moodtalk.app/assets/index-BcWyEr4G.js | grep -qF '127.0.0.1:8000' && \
  echo "❌ 127.0.0.1:8000 발견!" || echo "✅ 하드코딩 없음"
```

---

## 📈 5. 원라이너 대시보드

### A) 실시간 요청 모니터링

```bash
# 초당 요청 수 (Nginx)
tail -f /var/log/nginx/access.log | pv -l -i 1 -r > /dev/null

# 최근 10개 요청 (URL + 상태 + 응답시간)
tail -n 10 /var/log/nginx/access.log | awk '{print $4, $7, $9, $NF}'

# 실시간 에러 카운트
watch -n 2 'grep -c "\[error\]" /var/log/nginx/error.log'
```

### B) 종합 상태 대시보드

```bash
# watch 명령으로 2초마다 갱신
watch -n 2 '
echo "=== Last 10 Requests ==="
tail -n 10 /var/log/nginx/access.log | awk "{print \$4, \$7, \$9, \$NF}"

echo ""
echo "=== Error Count ==="
grep -c "\[error\]" /var/log/nginx/error.log

echo ""
echo "=== FastAPI Status ==="
systemctl --user status eft-api --no-pager | head -10
'
```

### C) AI 요청 추적

```bash
# 실시간 AI 채팅 요청
journalctl --user -u eft-api -f --no-pager | grep 'POST /api/chat'

# AI 응답 시간 실시간 표시
journalctl --user -u eft-api -f --no-pager | grep -oE 'processing_time: [0-9.]+'

# LLM 요청 추적
tail -f /var/log/nginx/access.log | grep '/llm/v1/chat/completions'
```

---

## 🛠️ 6. 헤더/캐시 검증

### A) Cloudflare 캐시 상태

```bash
# cf-cache-status 확인
curl -I https://moodtalk.app/assets/index-BcWyEr4G.js | grep -i 'cf-cache-status:'

# 여러 리소스 일괄 확인
for url in \
  "https://moodtalk.app/index.html" \
  "https://moodtalk.app/sw.js" \
  "https://moodtalk.app/assets/index-BcWyEr4G.js"
do
  echo "=== $url ==="
  curl -sI "$url" | grep -iE 'cache-control:|cf-cache-status:'
  echo ""
done
```

### B) Cache-Control 검증

```bash
# Service Worker (no-store 기대)
curl -I https://moodtalk.app/sw.js | grep -i 'cache-control:'

# index.html (no-cache 기대)
curl -I https://moodtalk.app/index.html | grep -i 'cache-control:'

# 정적 번들 (immutable 기대)
curl -I https://moodtalk.app/assets/index-BcWyEr4G.js | grep -i 'cache-control:'
```

---

## 💾 7. 로그 저장 및 공유

### A) 문제 발생 시 정보 수집 (1분 이내)

```bash
# 모든 정보를 하나의 파일로
{
  echo "=== Timestamp ==="
  date

  echo ""
  echo "=== Nginx Errors (Last 50) ==="
  tail -n 50 /var/log/nginx/error.log

  echo ""
  echo "=== FastAPI Errors (Last 20) ==="
  journalctl --user -u eft-api -n 20 --no-pager -p err

  echo ""
  echo "=== Service Status ==="
  systemctl --user status eft-api --no-pager

  echo ""
  echo "=== Disk Usage ==="
  df -h /var/log

  echo ""
  echo "=== Recent Access (Last 20) ==="
  tail -n 20 /var/log/nginx/access.log

} > ~/debug_$(date +%Y%m%d_%H%M%S).log

# 생성된 파일 확인
ls -lh ~/debug_*.log | tail -1
```

### B) 특정 에러 패턴 추출

```bash
# 404 에러 URL 리스트
awk '$9 == 404 {print $7}' /var/log/nginx/access.log | sort | uniq > ~/404_urls.txt

# Python 트레이스백 전체 추출
journalctl --user -u eft-api --no-pager | awk '/Traceback/,/^[^ ]/' > ~/tracebacks.log

# 업스트림 에러 추출
grep 'upstream' /var/log/nginx/error.log > ~/upstream_errors.log
```

---

## 📋 성공 기준

**✅ 각 명령어 실행 시:**
- 결과가 즉시 표시됨
- 원하는 정보만 필터링됨
- 불필요한 노이즈 제거됨

**✅ 문제 발생 시:**
- 2분 내 핵심 정보 수집 가능
- 근본 원인 파악에 필요한 로그 확보
- 팀과 공유 가능한 형태로 저장

**✅ 일상 운영:**
- 빠른 상태 확인 (30초 이내)
- 에러 추세 파악 (1분 이내)
- 성능 병목 탐지 (2분 이내)

---

**마지막 업데이트**: 2025-10-02
**버전**: 1.0.0
**다음 리뷰**: 운영 중 추가 질의 발견 시 업데이트
