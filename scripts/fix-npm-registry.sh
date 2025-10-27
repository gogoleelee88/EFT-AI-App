#!/usr/bin/env bash
set -euo pipefail

echo "🔧 npm registry fixer"
node -v || true
npm -v || true

echo "Current registry: $(npm config get registry || true)"
echo "@eslint registry: $(npm config get '@eslint:registry' || true)"

echo "Cleaning npm config"
npm config set registry https://registry.npmjs.org/
if ! npm config delete "@eslint:registry"; then
  echo "@eslint:registry already unset"
fi
if ! npm config delete proxy; then
  echo "proxy config already unset"
fi
if ! npm config delete https-proxy; then
  echo "https-proxy config already unset"
fi

echo "Cleaning npm cache"
npm cache clean --force

echo "✅ Registry fix completed"
