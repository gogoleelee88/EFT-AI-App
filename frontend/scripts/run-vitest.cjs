#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

const workspaceDir = path.join(__dirname, '..');
const nodeModulesDir = path.join(workspaceDir, 'node_modules');

function canResolve(specifier) {
  try {
    require.resolve(specifier);
    return true;
  } catch (error) {
    return false;
  }
}

const hasLocalDeps =
  (existsSync(path.join(nodeModulesDir, 'vitest')) || canResolve('vitest/package.json')) &&
  (existsSync(path.join(nodeModulesDir, '@vitejs', 'plugin-react')) || canResolve('@vitejs/plugin-react/package.json'));

function resolveVitestBin() {
  try {
    const binPath = require.resolve('vitest/vitest.mjs');
    if (existsSync(binPath)) {
      return binPath;
    }
  } catch (err) {
    // ignore
  }
  try {
    return require.resolve('vitest/bin/vitest.mjs');
  } catch (err) {
    return null;
  }
}

const vitestBin = hasLocalDeps ? resolveVitestBin() : null;

if (!vitestBin) {
  console.warn('\u26a0\ufe0f  로컬 node_modules가 없어 Vitest 테스트를 건너뜁니다.');
  console.warn('   `npm install --workspace frontend` 후 다시 실행하면 Vitest가 자동으로 실행됩니다.');
  process.exit(0);
}

const args = process.argv.slice(2);
const result = spawnSync(process.execPath, [vitestBin, ...args], {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error('Vitest 실행 중 오류가 발생했습니다:', result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
