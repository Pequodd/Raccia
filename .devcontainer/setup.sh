#!/usr/bin/env bash
# Runs once when the codespace is created: dependencies and the web build.
set -e
cd "$(dirname "$0")/.."
(cd server && npm ci --no-audit --no-fund)
(cd app && npm ci --no-audit --no-fund && npx expo export --platform web --output-dir dist)
