// Preload 스크립트: renderer에 노출할 안전한 IPC API 정의
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('resumeOS', {
  /**
   * Proactive Coach Nudge 수신 리스너 등록.
   * payload: { id, type, ts, state }
   */
  onNudge: (handler) => {
    ipcRenderer.removeAllListeners('nudge');
    ipcRenderer.on('nudge', (_event, payload) => {
      try {
        handler(payload);
      } catch (e) {
        console.error('[resumeOS.onNudge] handler error:', e);
      }
    });
  },

  /**
   * Nudge에 대한 사용자 응답 전송.
   * data: { id, action: 'accept' | 'dismiss' | 'snooze', snoozeMinutes?: number }
   */
  respondNudge: (data) => {
    ipcRenderer.send('nudge:response', data);
  },

  /**
   * Unknown_Activity 수신 리스너 등록.
   * payload: { bufferId, ts, state }
   */
  onUnknownActivity: (handler) => {
    ipcRenderer.removeAllListeners('unknown-activity');
    ipcRenderer.on('unknown-activity', (_event, payload) => {
      try {
        handler(payload);
      } catch (e) {
        console.error('[resumeOS.onUnknownActivity] handler error:', e);
      }
    });
  },

  /**
   * Unknown_Activity를 사용자 정의 패턴으로 등록 요청.
   * data: { bufferId, name, description? }
   */
  registerCustomActivity: (data) => {
    ipcRenderer.send('custom-activity:register', data);
  },
});

