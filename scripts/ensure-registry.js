#!/usr/bin/env node
const process = require('node:process');
const { execSync } = require('node:child_process');

const commands = [
  { label: 'node -v', command: 'node -v' },
  { label: 'npm -v', command: 'npm -v' },
  { label: 'npm config get registry', command: 'npm config get registry' },
  { label: 'npm config get "@eslint:registry"', command: 'npm config get "@eslint:registry"' },
];

function run(command, options = {}) {
  try {
    const result = execSync(command, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...options });
    return result.trim();
  } catch (error) {
    const message = error?.stderr?.toString()?.trim() || error.message;
    console.error(`[ensure-registry] command failed: ${command}`);
    if (message) console.error(message);
    throw error;
  }
}

function runAndLog(command) {
  console.log(`$ ${command}`);
  const output = run(command);
  if (output) {
    console.log(output);
  }
  return output;
}

function main() {
  console.log('🔧 Ensuring npm registry configuration (EFT-AI-App)');

  for (const entry of commands) {
    try {
      const output = run(entry.command);
      console.log(`${entry.label}: ${output || '<empty>'}`);
    } catch (error) {
      console.warn(`[ensure-registry] Unable to read ${entry.label}:`, error?.message || error);
    }
  }

  try {
    console.log('$ npm config list -l');
    const list = execSync('npm config list -l', { encoding: 'utf8' });
    const filtered = list
      .split('\n')
      .filter((line) => /eslint/i.test(line) || /registry/i.test(line))
      .join('\n');
    console.log(filtered || '<no eslint-related config entries>');
  } catch (error) {
    console.warn('[ensure-registry] Failed to list npm config:', error?.message || error);
  }

  const actions = [
    'npm config set registry https://registry.npmjs.org/',
    'npm config delete "@eslint:registry"',
    'npm config delete proxy',
    'npm config delete https-proxy',
    'npm cache clean --force',
  ];

  for (const command of actions) {
    try {
      runAndLog(command);
    } catch (error) {
      if (/config delete/.test(command) && error?.status === 1) {
        console.log('[ensure-registry] Nothing to delete; continuing...');
        continue;
      }
      throw error;
    }
  }

  console.log('✅ npm registry configuration refreshed');
}

try {
  main();
} catch (error) {
  console.error('❌ ensure-registry failed:', error.message || error);
  process.exitCode = 1;
}
