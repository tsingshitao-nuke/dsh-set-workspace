#!/bin/bash
# dsh-set-workspace — one-click installer (Git Bash / WSL / macOS / Linux)
# Idempotent: safe to run again.
set -euo pipefail

echo "==> Installing dsh-set-workspace bundle"
dsh plugin --profile web add github:tsingshitao-nuke/dsh-set-workspace

PKG="$HOME/.dsh/profiles/web/node_modules/dsh-set-workspace"
if [ ! -d "$PKG" ]; then
  echo "package not found at $PKG — install the bundle manually first" >&2
  exit 1
fi

echo "==> Registering Explorer context menu"
node "$PKG/bin/install-context-menu.cjs"

echo ""
echo "Done. Right-click a folder in File Explorer -> 'Open DSH Workspace Here'."
echo "Restart DSH if the host half changed; a client-only change needs only a hard refresh."
