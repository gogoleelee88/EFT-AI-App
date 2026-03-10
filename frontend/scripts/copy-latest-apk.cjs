#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const frontendRoot = path.resolve(__dirname, "..");
const destination = path.join(frontendRoot, "public", "latest.apk");

const candidates = [
  process.env.APK_SOURCE_PATH,
  path.resolve(frontendRoot, "..", "mobile-agent-android", "apk-share", "latest.apk"),
].filter(Boolean);

const source = candidates.find((candidate) => fs.existsSync(candidate));
const requireSource =
  process.env.APK_COPY_REQUIRED === "1" ||
  process.env.CI === "true" ||
  process.env.VERCEL === "1";

if (!source) {
  const message =
    "[copy-latest-apk] source not found. set APK_SOURCE_PATH or place file at ../mobile-agent-android/apk-share/latest.apk";
  if (requireSource) {
    console.error(`${message} (required in CI/deploy)`);
    process.exit(1);
  }
  console.warn(`${message} (skip copy in local mode)`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);

const sizeMiB = (fs.statSync(destination).size / (1024 * 1024)).toFixed(2);
console.log(`[copy-latest-apk] copied ${source} -> ${destination} (${sizeMiB} MiB)`);
