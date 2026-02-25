// SQLite 스키마 정의 및 연결 (향후 tasks/calendar/events 등 테이블 생성 코드가 들어갈 자리)
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'resume_os.db');

function openDb() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (_) {}
  const db = new sqlite3.Database(DB_PATH);
  return db;
}

module.exports = {
  openDb,
  DB_PATH,
  DATA_DIR,
};

