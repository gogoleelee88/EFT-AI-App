-- Supabase: emotion_checkins 테이블에 available_time 컬럼 추가
-- 실행 위치: Supabase 대시보드 → SQL Editor → New query
-- 목적: POST /api/emotion/checkin 500 (PGRST204) 해결

ALTER TABLE emotion_checkins
ADD COLUMN IF NOT EXISTS available_time integer NULL;

COMMENT ON COLUMN emotion_checkins.available_time IS '사용 가능 시간(분). 프론트 8번째 인테이크 항목';

ALTER TABLE emotion_checkins
ADD COLUMN IF NOT EXISTS plan_start_resistance text NULL;

COMMENT ON COLUMN emotion_checkins.plan_start_resistance IS '일정 시작저항 타입(시작저항 / 업무시작했으나 막힘).';
