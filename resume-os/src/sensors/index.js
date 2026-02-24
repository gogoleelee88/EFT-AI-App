// sensors: active window + input 집계 (로컬 전용)
// - 키 입력 내용은 저장하지 않고, 집계 통계만 이벤트로 전달
// - 원본 영상/OCR은 이 모듈에서 수행하지 않음 (정책상 금지)

const { logEvent } = require('../storage/eventsRepo');
const { startActiveWindowSensor, stopActiveWindowSensor } = require('./activeWindow');
const { startInputSensor, stopInputSensor } = require('./input');
const eventBus = require('../engine/eventBus');

// ActivityBuffer (30~60초 시계열) 축적용 상태
let bufferStartTs = null;
let bufferSamples = [];
const BUFFER_WINDOW_MS = 60 * 1000;

/**
 * InputStats 스냅샷을 기반으로 ActivityBuffer에 한 샘플 추가
 * @param {{ ts:number, key_presses:number, backspace_presses:number, mouse_moves:number, mouse_clicks:number, scroll_events:number }} stats
 */
function updateActivityBufferFromInput(stats) {
  const now = stats.ts || Date.now();
  if (!bufferStartTs) {
    bufferStartTs = now;
    bufferSamples = [];
  }

  const features = [
    stats.key_presses || 0,
    stats.backspace_presses || 0,
    stats.mouse_moves || 0,
    stats.mouse_clicks || 0,
    stats.scroll_events || 0,
  ];

  bufferSamples.push({
    tOffsetMs: now - bufferStartTs,
    features,
  });

  const duration = now - bufferStartTs;
  if (duration >= BUFFER_WINDOW_MS) {
    const buffer = {
      startedAt: bufferStartTs,
      durationMs: duration,
      samples: bufferSamples.slice(),
    };
    // 엔진 쪽으로 ActivityBuffer 전달 (하이브리드 행동 인식용)
    eventBus.emit('activity-buffer', buffer);

    bufferStartTs = null;
    bufferSamples = [];
  }
}

function startSensors() {
  console.log('[sensors] starting active window + input sensors');

  // Active window → APP_FOCUS 이벤트로 로깅
  startActiveWindowSensor((snap) => {
    logEvent(
      'APP_FOCUS',
      {
        app: snap.app,
        window_title: snap.window_title,
        pid: snap.pid,
        path: snap.path,
      },
      1.0
    );
  });

  // 키보드/마우스 집계 → 주기적으로 KEY_ACTIVITY 이벤트로 로깅
  startInputSensor((stats) => {
    logEvent(
      'KEY_ACTIVITY',
      {
        key_presses: stats.key_presses,
        backspace_presses: stats.backspace_presses,
        mouse_moves: stats.mouse_moves,
        mouse_clicks: stats.mouse_clicks,
        scroll_events: stats.scroll_events,
      },
      1.0
    );

    // 동일한 InputStats를 사용해 ActivityBuffer용 시계열도 함께 축적
    updateActivityBufferFromInput(stats);
  });
}

function stopSensors() {
  console.log('[sensors] stopping sensors');
  stopActiveWindowSensor();
  stopInputSensor();
  bufferStartTs = null;
  bufferSamples = [];
}

module.exports = {
  startSensors,
  stopSensors,
};

