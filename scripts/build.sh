#!/bin/bash
# dsh-set-workspace — host build (src/index.ts -> lib/index.js + lib/types).
# Client bundle is produced separately by tsdown (`npm run build:client`).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TSC="node_modules/typescript/bin/tsc"
if [ ! -f "$TSC" ]; then
  echo "build: typescript not installed (run: npm install)" >&2
  exit 1
fi

echo "=== Compiling src/index.ts -> lib ==="
node "$TSC" -p tsconfig.json
echo "=== host build complete ==="
