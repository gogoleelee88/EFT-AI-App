// Active window 센서
// - active-win 라이브러리를 사용해 현재 포커스된 앱/윈도우 타이틀을 주기적으로 폴링
// - OCR은 수행하지 않으며, app/window_title 수준의 메타데이터만 수집

const activeWin = require('active-win');

let timer = null;
let lastSignature = null;

/**
 * @typedef {Object} ActiveWindowSnapshot
 * @property {number} ts
 * @property {string} app
 * @property {string} window_title
 * @property {number | null} [pid]
 * @property {string | null} [path]
 */

/**
 * 활성 윈도우를 주기적으로 폴링하고 변화가 있을 때만 콜백을 호출한다.
 * @param {(snap: ActiveWindowSnapshot) => void} onChange
 * @param {number} [intervalMs]
 */
function startActiveWindowSensor(onChange, intervalMs = 2000) {
  if (timer) return;

  timer = setInterval(async () => {
    try {
      const info = await activeWin();
      if (!info || !info.owner) return;
      const app = info.owner.name || 'unknown';
      const title = info.title || '';
      const sig = `${app}::${title}`;
      if (sig === lastSignature) return;
      lastSignature = sig;

      const snap = {
        ts: Date.now(),
        app,
        window_title: title,
        pid: info.owner.processId ?? null,
        path: info.owner.path ?? null,
      };
      onChange(snap);
    } catch (e) {
      // active-win 실패 시 조용히 무시 (센서 품질이 낮은 경우 Graceful Degradation)
      // console.error('[activeWindowSensor] error:', e);
    }
  }, intervalMs);
}

function stopActiveWindowSensor() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  lastSignature = null;
}

module.exports = {
  startActiveWindowSensor,
  stopActiveWindowSensor,
};

