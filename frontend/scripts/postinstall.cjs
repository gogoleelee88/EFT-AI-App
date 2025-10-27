#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const backupPath = path.join(root, 'package.json.eslint-backup');
const removedPath = path.join(root, '.eslint-optional-removed.json');

if (!fs.existsSync(backupPath)) {
  if (fs.existsSync(removedPath)) {
    fs.rmSync(removedPath, { force: true });
  }
  console.log('[postinstall] No ESLint optional backup found; nothing to restore.');
  process.exit(0);
}

try {
  const original = fs.readFileSync(backupPath, 'utf8');
  fs.writeFileSync(pkgPath, original);
  fs.rmSync(backupPath, { force: true });
  if (fs.existsSync(removedPath)) {
    fs.rmSync(removedPath, { force: true });
  }
  console.log('[postinstall] Restored original package.json after optional ESLint install.');
} catch (error) {
  console.error('[postinstall] Failed to restore original package.json:', error);
  process.exitCode = 1;
}
