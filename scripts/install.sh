#!/bin/bash
# dsh-set-workspace — one-click installer (Git Bash / WSL / macOS / Linux)
#
#   curl -fsSL https://raw.githubusercontent.com/tsingshitao-nuke/dsh-set-workspace/main/scripts/install.sh | bash
#
# Idempotent: safe to run again. Installs the bundle into every existing DSH
# profile (the official Desktop app uses "desktop", `dsh web` uses "web"), then
# registers the Explorer right-click menu once for the machine.
set -euo pipefail

REPO='github:tsingshitao-nuke/dsh-set-workspace'
PROFILES_DIR="$HOME/.dsh/profiles"

profiles=()
if [ -d "$PROFILES_DIR" ]; then
  while IFS= read -r name; do
    profiles+=("$name")
  done < <(find "$PROFILES_DIR" -mindepth 1 -maxdepth 1 -type d -exec test -f '{}/package.json' \; -print 2>/dev/null | xargs -r -n1 basename)
fi
if [ ${#profiles[@]} -eq 0 ]; then
  profiles=("web")
fi

installed=()
for profile in "${profiles[@]}"; do
  pkg="$PROFILES_DIR/$profile/node_modules/dsh-set-workspace"
  if [ -f "$pkg/package.json" ]; then
    echo "==> profile \"$profile\": already installed"
    installed+=("$profile")
    continue
  fi
  echo "==> installing into profile \"$profile\""
  dsh plugin --profile "$profile" add "$REPO" || true
  if [ -f "$pkg/package.json" ]; then
    installed+=("$profile")
  fi
done

if [ ${#installed[@]} -eq 0 ]; then
  echo "bundle not installed in any profile — try manually: dsh plugin --profile desktop add $REPO" >&2
  exit 1
fi

menu="$PROFILES_DIR/${installed[0]}/node_modules/dsh-set-workspace/bin/install-context-menu.cjs"
echo "==> Registering Explorer context menu"
node "$menu"

echo ""
echo "Done. Right-click a folder in File Explorer -> 'Open DSH Workspace Here'."
echo "Profiles with the bundle: ${installed[*]}"
echo "Restart DSH (Desktop: quit from the tray, then relaunch) so the host half publishes its port."
