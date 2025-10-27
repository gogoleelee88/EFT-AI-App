#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const optional = String(process.env.ESLINT_OPTIONAL || '').toLowerCase() === 'true';
const root = path.resolve(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const backupPath = path.join(root, 'package.json.eslint-backup');
const removedPath = path.join(root, '.eslint-optional-removed.json');

if (!optional) {
  if (fs.existsSync(backupPath)) {
    console.warn('[preinstall] ESLINT_OPTIONAL not set but backup exists. Restoring original package.json.');
    const original = fs.readFileSync(backupPath, 'utf8');
    fs.writeFileSync(pkgPath, original);
    fs.rmSync(backupPath, { force: true });
  }
  if (fs.existsSync(removedPath)) {
    fs.rmSync(removedPath, { force: true });
  }
  console.log('[preinstall] ESLINT_OPTIONAL not enabled; proceeding normally.');
  process.exit(0);
}

if (fs.existsSync(backupPath)) {
  console.log('[preinstall] Optional ESLint mode already applied; skipping.');
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
fs.writeFileSync(backupPath, JSON.stringify(pkg, null, 2) + '\n');

const targets = [
  '@eslint/js',
  'eslint',
  'eslint-plugin-react-hooks',
  'eslint-plugin-react-refresh',
  'typescript-eslint',
];
const removed = [];

if (pkg.devDependencies) {
  for (const dep of targets) {
    if (dep in pkg.devDependencies) {
      delete pkg.devDependencies[dep];
      removed.push(dep);
    }
  }
  if (Object.keys(pkg.devDependencies).length === 0) {
    delete pkg.devDependencies;
  }
}

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
fs.writeFileSync(removedPath, JSON.stringify({ removed, timestamp: new Date().toISOString() }, null, 2) + '\n');

console.log('[preinstall] ESLINT_OPTIONAL=true detected; removed devDependencies:', removed.join(', ') || 'none');
