// 키보드/마우스 입력 집계 센서
// - iohook 을 사용해 키 입력/마우스 이벤트를 집계한다.
// - 개별 키 내용은 저장하지 않고, 집계 통계만 생성한다.

const iohook = require('iohook');

let statsTimer = null;
let started = false;

const BACKSPACE_KEYCODE = 14; // 플랫폼/레이아웃에 따라 다를 수 있음 (예시)

let stats = resetStats();

function resetStats() {
  return {
    ts: Date.now(),
    key_presses: 0,
    backspace_presses: 0,
    mouse_moves: 0,
    mouse_clicks: 0,
    scroll_events: 0,
  };
}

/**
 * @typedef {Object} InputStats
 * @property {number} ts
 * @property {number} key_presses
 * @property {number} backspace_presses
 * @property {number} mouse_moves
 * @property {number} mouse_clicks
 * @property {number} scroll_events
 */

/**
 * 키보드/마우스 입력을 집계하고, 주기적으로 콜백으로 전달한다.
 * @param {(s: InputStats) => void} onStats
 * @param {number} [intervalMs]
 */
function startInputSensor(onStats, intervalMs = 10000) {
  if (started) return;
  started = true;

  iohook.on('keydown', (event) => {
    stats.key_presses += 1;
    if (event && typeof event.keycode === 'number' && event.keycode === BACKSPACE_KEYCODE) {
      stats.backspace_presses += 1;
    }
  });

  iohook.on('mousemove', () => {
    stats.mouse_moves += 1;
  });

  iohook.on('mousedown', () => {
    stats.mouse_clicks += 1;
  });

  iohook.on('mousewheel', () => {
    stats.scroll_events += 1;
  });

  iohook.start();

  statsTimer = setInterval(() => {
    const snapshot = {
      ...stats,
      ts: Date.now(),
    };
    onStats(snapshot);
    stats = resetStats();
  }, intervalMs);
}

function stopInputSensor() {
  if (!started) return;
  started = false;
  if (statsTimer) {
    clearInterval(statsTimer);
    statsTimer = null;
  }
  try {
    iohook.removeAllListeners('keydown');
    iohook.removeAllListeners('mousemove');
    iohook.removeAllListeners('mousedown');
    iohook.removeAllListeners('mousewheel');
    iohook.stop();
  } catch (e) {
    // iohook 종료 실패는 무시
  }
  stats = resetStats();
}

module.exports = {
  startInputSensor,
  stopInputSensor,
};

