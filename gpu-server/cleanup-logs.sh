#!/usr/bin/env bash
# vLLM 엔진 로그 정리 스크립트
# 7일 이상 지난 로그 파일 자동 삭제

echo "=== vLLM 엔진 로그 정리 시작: $(date) ==="

# 로그 보관 주기 (일) - 필요시 수정
# 테스트 환경: LOG_RETENTION_DAYS=3
# 운영 환경: LOG_RETENTION_DAYS=14 또는 30
LOG_RETENTION_DAYS=7

# 로그 위치 설정
# 전용 폴더 사용으로 변경
LOG_DIR="$HOME/logs/engine"

# 실행 전 폴더 없으면 생성
mkdir -p "$LOG_DIR"

echo "로그 보관 주기: ${LOG_RETENTION_DAYS}일"
echo "검색 경로: ${LOG_DIR}"

# 지정 일수 이상 지난 엔진 로그 삭제
echo "삭제 대상 로그 검색 중..."
DELETED_A=$(find "$LOG_DIR" -name "engine-a-*.log" -mtime +${LOG_RETENTION_DAYS} -delete -print | wc -l)
DELETED_B=$(find "$LOG_DIR" -name "engine-b-*.log" -mtime +${LOG_RETENTION_DAYS} -delete -print | wc -l)

echo "삭제된 엔진 A 로그: ${DELETED_A}개"
echo "삭제된 엔진 B 로그: ${DELETED_B}개"

# 현재 남은 로그 파일 목록 출력
echo ""
echo "현재 로그 파일 목록:"
ls -la "$LOG_DIR"/engine-*.log 2>/dev/null || echo "로그 파일 없음"

# 로그 파일 총 용량 확인
echo ""
echo "로그 파일 총 용량:"
du -sh "$LOG_DIR"/engine-*.log 2>/dev/null || echo "0B"

echo ""
echo "=== 로그 정리 완료: $(date) ==="
echo ""
echo "🔧 설정 변경 가이드:"
echo "- 테스트 환경: LOG_RETENTION_DAYS=3"
echo "- 운영 환경: LOG_RETENTION_DAYS=14 또는 30"
echo "- 전용 폴더 사용: LOG_DIR=\"\$HOME/logs/engine\""
echo ""
echo "📅 크론탭 등록:"
echo "crontab -e 에서 다음 추가:"
echo "0 3 * * * bash -lc \"\$HOME/Desktop/EFT-AI-App/gpu-server/cleanup-logs.sh >> \$HOME/cleanup-logs.log 2>&1\""