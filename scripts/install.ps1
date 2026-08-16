# dsh-set-workspace — one-click installer (Windows PowerShell 5.1+ / pwsh)
# Idempotent: safe to run again. Installs the bundle, then registers the
# Explorer right-click menu.
$ErrorActionPreference = 'Stop'

Write-Host "==> Installing dsh-set-workspace bundle" -ForegroundColor Cyan
dsh plugin --profile web add github:tsingshitao-nuke/dsh-set-workspace

$pkg = Join-Path $env:USERPROFILE '.dsh\profiles\web\node_modules\dsh-set-workspace'
if (-not (Test-Path $pkg)) {
  Write-Error "package not found at $pkg — install the bundle manually first (dsh plugin --profile web add github:tsingshitao-nuke/dsh-set-workspace)"
  exit 1
}

Write-Host "==> Registering Explorer context menu" -ForegroundColor Cyan
node (Join-Path $pkg 'bin\install-context-menu.cjs')

Write-Host ""
Write-Host "Done. Right-click a folder in File Explorer ->" -ForegroundColor Green
Write-Host "  '在此处打开 DSH 工作区' / 'Open DSH Workspace Here'" -ForegroundColor Green
Write-Host "Restart DSH if the host half changed; a client-only change needs only a hard refresh." -ForegroundColor DarkGray
