// custom_patterns.json 관리: 사용자 정의 행동 패턴 시그니처 저장/로딩
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./sqlite');

const PATTERN_PATH = path.join(DATA_DIR, 'custom_patterns.json');

function ensureLoaded() {
  try {
    if (!fs.existsSync(PATTERN_PATH)) {
      return {
        version: 1,
        featureVersion: 'v1',
        patterns: [],
      };
    }
    const raw = fs.readFileSync(PATTERN_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.patterns || !Array.isArray(parsed.patterns)) {
      parsed.patterns = [];
    }
    return parsed;
  } catch (e) {
    console.error('[customPatternsRepo] load error, resetting file:', e);
    return {
      version: 1,
      featureVersion: 'v1',
      patterns: [],
    };
  }
}

function saveAll(doc) {
  try {
    fs.writeFileSync(PATTERN_PATH, JSON.stringify(doc, null, 2), 'utf8');
  } catch (e) {
    console.error('[customPatternsRepo] save error:', e);
  }
}

function loadCustomPatterns() {
  const doc = ensureLoaded();
  return doc.patterns;
}

function addCustomPattern({ name, description, signature }) {
  const doc = ensureLoaded();
  const id = `p_${Date.now()}_${Math.floor(Math.random() * 1e6).toString(36)}`;
  const createdAt = Date.now();
  const pattern = {
    id,
    name,
    description: description || '',
    createdAt,
    signature,
    stats: {
      numExamples: 1,
      avgDurationMs: signature.durationMs || 0,
    },
  };
  doc.patterns.push(pattern);
  saveAll(doc);
  return pattern;
}

module.exports = {
  loadCustomPatterns,
  addCustomPattern,
  PATTERN_PATH,
};

