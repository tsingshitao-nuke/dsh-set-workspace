# dsh-set-workspace — one-click installer (Windows PowerShell 5.1+ / pwsh)
#
#   irm https://raw.githubusercontent.com/tsingshitao-nuke/dsh-set-workspace/main/scripts/install.ps1 | iex
#
# Idempotent: safe to run again. Installs the bundle into every existing DSH
# profile (the official Desktop app uses "desktop", `dsh web` uses "web"), then
# registers the Explorer right-click menu once for the machine.
$ErrorActionPreference = 'Stop'

$repo = 'github:tsingshitao-nuke/dsh-set-workspace'
$profilesDir = Join-Path $env:USERPROFILE '.dsh\profiles'

$profiles = @()
if (Test-Path $profilesDir) {
  $profiles = Get-ChildItem $profilesDir -Directory |
    Where-Object { Test-Path (Join-Path $_.FullName 'package.json') } |
    Select-Object -ExpandProperty Name
}
if (-not $profiles -or $profiles.Count -eq 0) { $profiles = @('web') }

$installed = @()
foreach ($profile in $profiles) {
  $pkg = Join-Path $profilesDir "$profile\node_modules\dsh-set-workspace"
  if (Test-Path (Join-Path $pkg 'package.json')) {
    Write-Host "==> profile `"$profile`": already installed" -ForegroundColor DarkGray
    $installed += $profile
    continue
  }
  Write-Host "==> installing into profile `"$profile`"" -ForegroundColor Cyan
  dsh plugin --profile $profile add $repo
  if (Test-Path (Join-Path $pkg 'package.json')) { $installed += $profile }
}

if ($installed.Count -eq 0) {
  Write-Error "bundle not installed in any profile — try manually: dsh plugin --profile desktop add $repo"
  exit 1
}

$menu = Join-Path $profilesDir "$($installed[0])\node_modules\dsh-set-workspace\bin\install-context-menu.cjs"
Write-Host '==> Registering Explorer context menu' -ForegroundColor Cyan
node $menu

Write-Host ''
Write-Host 'Done. Right-click a folder in File Explorer ->' -ForegroundColor Green
Write-Host "  '在此处打开 DSH 工作区' / 'Open DSH Workspace Here'" -ForegroundColor Green
Write-Host "Profiles with the bundle: $($installed -join ', ')" -ForegroundColor Green
Write-Host 'Restart DSH (Desktop: quit from the tray, then relaunch) so the host half publishes its port.' -ForegroundColor DarkGray
