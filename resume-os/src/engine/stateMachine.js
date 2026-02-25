// Multimodal Focus Tracker: 최근 events를 기반으로 상태/스코어 추정
// 상태: FOCUSING / IDLE / STUCK / DISTRACTED / FATIGUED / MICRO_INTERRUPT

const { getRecentEvents } = require('../storage/eventsRepo');

const TEN_MIN_MS = 10 * 60 * 1000;

/**
 * 최근 KEY_ACTIVITY / APP_FOCUS 이벤트를 기반으로 단순한 상태를 추정한다.
 * @param {{ts:number,type:string,payload:any}[]} events
 */
function estimateState(events) {
  const now = Date.now();
  const keyEvents = events.filter((e) => e.type === 'KEY_ACTIVITY');
  const focusEvents = events.filter((e) => e.type === 'APP_FOCUS');

  const lastKeyTs = keyEvents.length > 0 ? keyEvents[0].ts : 0;
  const lastFocusTs = focusEvents.length > 0 ? focusEvents[0].ts : 0;
  const idleMs = now - Math.max(lastKeyTs, lastFocusTs);

  // 기본 스코어 초기값
  let state = 'FOCUSING';
  let fatigue_score = 0.3;
  let attention_score = 0.7;
  let stuck_conf = 0.0;

  // IDLE: 7분 이상 입력/포커스 변화 없음
  if (idleMs >= 7 * 60 * 1000) {
    state = 'IDLE';
    attention_score = 0.2;
  }

  // STUCK: 최근 10분 내 활동은 있지만 backspace 비율 높고 포커스 변화 거의 없음
  if (keyEvents.length > 0) {
    const totalKeys = keyEvents.reduce((acc, e) => acc + (e.payload.key_presses || 0), 0);
    const totalBack = keyEvents.reduce((acc, e) => acc + (e.payload.backspace_presses || 0), 0);
    const ratio = totalKeys > 0 ? totalBack / totalKeys : 0;
    const distinctApps = new Set(focusEvents.map((e) => e.payload.app || '')).size;
    if (totalKeys > 50 && ratio > 0.3 && distinctApps <= 2) {
      state = 'STUCK';
      stuck_conf = Math.min(1.0, 0.5 + ratio); // 0.8~1.0 정도
      attention_score = 0.4;
    }
  }

  // DISTRACTED: 최근 10분 내 포커스 전환이 매우 잦음
  const focusInWindow = focusEvents.filter((e) => now - e.ts <= TEN_MIN_MS);
  if (focusInWindow.length > 15 && keyEvents.length > 0) {
    state = 'DISTRACTED';
    attention_score = 0.3;
  }

  // FATIGUED: 최근 10분 동안 키 입력은 적고, idle은 아니지만 활동이 뜨문뜨문
  const keyInWindow = keyEvents.filter((e) => now - e.ts <= TEN_MIN_MS);
  const totalKeysWindow = keyInWindow.reduce((acc, e) => acc + (e.payload.key_presses || 0), 0);
  if (state === 'FOCUSING' && totalKeysWindow > 0 && totalKeysWindow < 40 && idleMs > 2 * 60 * 1000) {
    state = 'FATIGUED';
    fatigue_score = 0.7;
    attention_score = 0.5;
  }

  // MICRO_INTERRUPT: (MVP에선 모바일 신호 없음) → TODO: desktop idle/lock + 모바일 movement 연동 시 구현
  // 현재는 사용하지 않음.

  return {
    state,
    stuck_conf,
    fatigue_score,
    attention_score,
  };
}

/**
 * 최근 events를 불러와 상태를 추정하고 콜백으로 전달.
 * @param {(snapshot: {ts:number,state:string,stuck_conf:number,fatigue_score:number,attention_score:number}) => void} cb
 * @param {number} [windowMs]
 */
function runFocusTrackerOnce(cb, windowMs = 15 * 60 * 1000) {
  getRecentEvents(windowMs, ['KEY_ACTIVITY', 'APP_FOCUS'], (err, events) => {
    if (err) return;
    const est = estimateState(events);
    const snapshot = {
      ts: Date.now(),
      ...est,
    };
    cb(snapshot);
  });
}

module.exports = {
  estimateState,
  runFocusTrackerOnce,
};

