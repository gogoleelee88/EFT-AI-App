#!/usr/bin/env node
const { execSync } = require('node:child_process');
const https = require('node:https');
const process = require('node:process');

function getCommandOutput(command) {
  try {
    return execSync(command, { encoding: 'utf8' }).trim();
  } catch (error) {
    throw new Error(`${command} failed: ${error?.message || error}`);
  }
}

function parseSemver(version) {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return match.slice(1, 4).map((part) => Number(part));
}

function assertVersion(name, version, minimum) {
  const parsed = parseSemver(version);
  if (!parsed) {
    throw new Error(`${name} version ${version} is not a valid semver string`);
  }
  const [major, minor, patch] = parsed;
  const [minMajor, minMinor, minPatch] = minimum;
  const ok =
    major > minMajor ||
    (major === minMajor && (minor > minMinor || (minor === minMinor && patch >= minPatch)));
  if (!ok) {
    throw new Error(`${name} ${version} is below required ${minimum.join('.')}`);
  }
}

function checkRegistryReachability(url) {
  return new Promise((resolve) => {
    const request = https.request(url, { method: 'HEAD', timeout: 5000 }, (res) => {
      const ok = res.statusCode && res.statusCode >= 200 && res.statusCode < 400;
      if (!ok) {
        console.warn(`⚠️ Registry HEAD ${url} returned status ${res.statusCode}`);
      }
      res.resume();
      resolve();
    });
    request.on('error', (error) => {
      console.warn(`⚠️ Registry HEAD ${url} failed: ${error.message || error.code || 'unknown error'}`);
      resolve();
    });
    request.on('timeout', () => {
      console.warn(`⚠️ Registry HEAD ${url} timed out`);
      request.destroy();
      resolve();
    });
    request.end();
  });
}

async function main() {
  console.log('🔍 Checking npm registry configuration');
  const nodeVersion = process.version.replace(/^v/, '');
  const npmVersion = getCommandOutput('npm -v');
  console.log(`node version: ${nodeVersion}`);
  console.log(`npm version: ${npmVersion}`);

  assertVersion('node', nodeVersion, [18, 18, 0]);
  assertVersion('npm', npmVersion, [9, 0, 0]);

  const registry = getCommandOutput('npm config get registry') || '';
  const eslintRegistryRaw = getCommandOutput('npm config get "@eslint:registry"');
  const eslintRegistry = eslintRegistryRaw === 'undefined' ? '' : eslintRegistryRaw;

  console.log(`registry: ${registry}`);
  console.log(`@eslint:registry: ${eslintRegistry || '<not set>'}`);

  const expectedRegistry = 'https://registry.npmjs.org/';
  if (registry !== expectedRegistry) {
    throw new Error(`npm registry mismatch: expected ${expectedRegistry}, received ${registry}`);
  }
  if (eslintRegistry && eslintRegistry !== expectedRegistry) {
    throw new Error(`@eslint:registry should be unset or ${expectedRegistry}; found ${eslintRegistry}`);
  }

  await checkRegistryReachability('https://registry.npmjs.org/@eslint%2Fjs');
  console.log('✅ npm registry configuration checks passed');
}

main().catch((error) => {
  console.error('❌ npm registry check failed:', error.message || error);
  process.exitCode = 1;
});
