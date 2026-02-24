// 엔진: Multimodal Focus Tracker + Proactive Coach + KPI 로깅 진입점

const { logEvent } = require('../storage/eventsRepo');
const { insertStateSnapshot } = require('../storage/stateRepo');
const { runDailySummaryBatch } = require('../storage/dailySummaryRepo');
const { runDailyProfileBatch } = require('../storage/dailyProfileRepo');
const { refreshProfileFromData } = require('../storage/userProfileRepo');
const { runFocusTrackerOnce } = require('./stateMachine');
const { evaluateProactiveCoach } = require('./coach');
const { tickKpiLogger } = require('./kpiLogger');
const { recognizeActivityFromSnapshot, recognizeActivityFromBuffer } = require('./activityRecognizer');
const eventBus = require('./eventBus');

let engineTimer = null;

function startEngine() {
  console.log('[engine] startEngine(): starting focus tracker + coach + KPI loops');
  if (engineTimer) return;

  // 1분마다 Focus Tracker 실행 → state_snapshots 기록 → Proactive Coach 평가 → KPI 로깅
  engineTimer = setInterval(() => {
    runFocusTrackerOnce((snapshot) => {
      // state_snapshots 저장
      insertStateSnapshot({
        ts: snapshot.ts,
        state: snapshot.state,
        stuck_conf: snapshot.stuck_conf,
        fatigue_score: snapshot.fatigue_score,
        attention_score: snapshot.attention_score,
        active_task_id: null,
      });
      logEvent('STATE_CHANGE', snapshot, 0.9);
      // 행동 인식 엔진 (커스텀 + 기본 모델 + Unknown)
      try {
        recognizeActivityFromSnapshot(snapshot);
      } catch (e) {
        console.error('[engine] recognizeActivityFromSnapshot error:', e);
      }
      // Proactive Coach 평가
      evaluateProactiveCoach(snapshot);
      // KPI 로깅
      tickKpiLogger();
    });
  }, 60 * 1000);

  // 부트스트랩 시 한 번 실행
  runFocusTrackerOnce((snapshot) => {
    insertStateSnapshot({
      ts: snapshot.ts,
      state: snapshot.state,
      stuck_conf: snapshot.stuck_conf,
      fatigue_score: snapshot.fatigue_score,
      attention_score: snapshot.attention_score,
      active_task_id: null,
    });
    logEvent('STATE_CHANGE', snapshot, 0.9);
    try {
      recognizeActivityFromSnapshot(snapshot);
    } catch (e) {
      console.error('[engine] recognizeActivityFromSnapshot(bootstrap) error:', e);
    }
    evaluateProactiveCoach(snapshot);
    tickKpiLogger();
  });

  // daily_summary 배치: 어제/오늘 상태 비율 집계 (DESIGN §3)
  runDailySummaryBatch('default', (err) => {
    if (err) console.error('[engine] runDailySummaryBatch error:', err);
  });

  // daily_user_profile 배치: 매일 사용자 프로파일 정리 (상태 + nudge + 앱/행동 + 1문단 요약)
  runDailyProfileBatch('default', (err) => {
    if (err) console.error('[engine] runDailyProfileBatch error:', err);
  });

  // user_profile 갱신: 누적 프로파일(nudge 패턴, 막힐 때 앱, 집중 시간대, 고민/방해요소 등) 유도 후 병합
  refreshProfileFromData('default', (err) => {
    if (err) console.error('[engine] refreshProfileFromData error:', err);
  });

  // sensors 에서 올라오는 ActivityBuffer → 행동 인식 엔진에 전달
  eventBus.on('activity-buffer', (buffer) => {
    try {
      recognizeActivityFromBuffer(buffer);
    } catch (e) {
      console.error('[engine] recognizeActivityFromBuffer error:', e);
    }
  });
}

function stopEngine() {
  if (engineTimer) {
    clearInterval(engineTimer);
    engineTimer = null;
  }
  console.log('[engine] stopEngine(): stopped');
}

module.exports = {
  startEngine,
  stopEngine,
};

