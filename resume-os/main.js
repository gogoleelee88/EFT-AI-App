// Electron 메인 프로세스 (실행 복귀 OS - MVP 스켈레톤)
const { app, BrowserWindow, ipcMain, Tray, nativeImage, Menu } = require('electron');
const path = require('path');
const { initializeSchema } = require('./src/storage/db');
const { startSensors, stopSensors } = require('./src/sensors');
const { startEngine, stopEngine } = require('./src/engine');
const { updateNudgeDecision, logEvent } = require('./src/storage/eventsRepo');
const { registerCustomPatternFromUnknown } = require('./src/engine/activityRecognizer');
const eventBus = require('./src/engine/eventBus');

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {Tray | null} */
let tray = null;

// 16x16 트레이 아이콘 (단색 점 - MVP용 인라인 PNG)
const TRAY_ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAiklEQVQ4T2NkYGD4z0ABYBzVMKoBBgwMDIyMjP8ZGBj+M/z//5/hP8N/Bob/DAz/GRj+MzD8Z2D4z8Dwn4HhPwPDfwaG/wwM/xkY/jMw/Gdg+M/A8J+B4T8Dw38Ghv8MDP8ZGP4zMPxnYPjPwPCfgeE/A8N/Bob/DAz/GRj+MzD8Z2D4z8Dwn4HhPwPDfwYAQQYGFy5Q0j0AAAAASUVORK5CYII=';

function createTray() {
  const icon = nativeImage.createFromDataURL('data:image/png;base64,' + TRAY_ICON_BASE64);
  tray = new Tray(icon);
  tray.setToolTip('실행 복귀 OS');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '창 열기', click: () => { if (mainWindow) mainWindow.show(); } },
      { type: 'separator' },
      { label: '종료', click: () => { app.quit(); } },
    ])
  );
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    },
    show: true
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('close', (e) => {
    if (!app.isQuitting && tray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // 초기화: 로컬 DB 스키마 생성, 센서/엔진 스켈레톤 시작
  initializeSchema();
  startSensors();
  startEngine();

  createMainWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });

  // 엔진에서 올라오는 nudge 이벤트를 renderer로 브로드캐스트
  eventBus.on('nudge', (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.webContents.send('nudge', payload);
    }
  });

  // 엔진에서 올라오는 Unknown_Activity 이벤트를 renderer로 전달
  eventBus.on('unknown-activity', (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('unknown-activity', payload);
    }
  });

  // 실제 종료 시 창 닫기 허용 (트레이 "종료" 클릭 시)
  app.on('before-quit', () => {
    app.isQuitting = true;
  });

  // renderer → nudge 응답 처리
  ipcMain.on('nudge:response', (_event, data) => {
    const { id, action, snoozeMinutes } = data || {};
    if (typeof id !== 'number') return;

    let accepted = null;
    let dismissed = null;
    let snooze = null;
    if (action === 'accept') {
      accepted = true;
      dismissed = false;
    } else if (action === 'dismiss') {
      accepted = false;
      dismissed = true;
    } else if (action === 'snooze') {
      accepted = false;
      dismissed = false;
      snooze = typeof snoozeMinutes === 'number' ? snoozeMinutes : 15;
    } else {
      return;
    }

    updateNudgeDecision(id, {
      accepted_bool: accepted,
      dismissed_bool: dismissed,
      snooze_minutes: snooze,
    });
    logEvent(
      'COACHING',
      { action: 'nudge_response', id, response: action, snooze_minutes: snooze },
      1.0
    );
  });

  // renderer → Unknown_Activity 사용자 정의 패턴 등록
  ipcMain.on('custom-activity:register', (_event, data) => {
    const { bufferId, name, description } = data || {};
    if (!bufferId || !name) return;
    try {
      const pattern = registerCustomPatternFromUnknown({ bufferId, name, description });
      logEvent('CUSTOM_ACTIVITY_REGISTERED_UI', { patternId: pattern.id, name }, 1.0);
    } catch (e) {
      console.error('[main] custom-activity:register error:', e);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopSensors();
    stopEngine();
    if (tray) tray.destroy();
    app.quit();
  }
});

