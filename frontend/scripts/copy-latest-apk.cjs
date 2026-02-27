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

if (!source) {
  console.warn(
    "[copy-latest-apk] source not found; skip copy. set APK_SOURCE_PATH or place file at ../mobile-agent-android/apk-share/latest.apk"
  );
  process.exit(0);
}

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);

const sizeMiB = (fs.statSync(destination).size / (1024 * 1024)).toFixed(2);
console.log(`[copy-latest-apk] copied ${source} -> ${destination} (${sizeMiB} MiB)`);
