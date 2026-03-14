#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const process = require("node:process");

const EXPECTED_REGISTRY = "https://registry.npmjs.org/";
const EXPECTED_LINES = [
  `registry=${EXPECTED_REGISTRY}`,
  `@eslint:registry=${EXPECTED_REGISTRY}`,
];
const APPLY_MODE = process.argv.includes("--apply");
const repoRoot = path.resolve(__dirname, "..");
const npmrcPath = path.join(repoRoot, ".npmrc");

function readProjectNpmrc() {
  if (!fs.existsSync(npmrcPath)) {
    return [];
  }
  return fs
    .readFileSync(npmrcPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function printStatus(lines) {
  const hasRegistry = lines.includes(EXPECTED_LINES[0]);
  const hasEslintRegistry = lines.includes(EXPECTED_LINES[1]);

  console.log("Ensuring npm registry configuration (EFT-AI-App)");
  console.log(`repo .npmrc: ${npmrcPath}`);
  console.log(`registry line: ${hasRegistry ? "ok" : "missing"}`);
  console.log(`@eslint registry line: ${hasEslintRegistry ? "ok" : "missing"}`);

  return hasRegistry && hasEslintRegistry;
}

function writeProjectNpmrc() {
  const content = `${EXPECTED_LINES.join("\n")}\n`;
  fs.writeFileSync(npmrcPath, content, "utf8");
  console.log(`Wrote ${npmrcPath}`);
}

function main() {
  const currentLines = readProjectNpmrc();
  const isConfigured = printStatus(currentLines);

  if (APPLY_MODE && !isConfigured) {
    writeProjectNpmrc();
    printStatus(readProjectNpmrc());
    return;
  }

  if (!isConfigured) {
    console.log('Project .npmrc is not aligned. Run "npm run fix:registry".');
  }
}

main();
