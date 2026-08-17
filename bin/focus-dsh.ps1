param(
  [int]$TargetPid = 0,
  [string]$ProcessName = '',
  [string]$Url = ''
)
$ErrorActionPreference = 'SilentlyContinue'

function Restore-And-Foreground([IntPtr]$hWnd) {
  if ($hWnd -eq [IntPtr]::Zero) { return }
  if (-not ('Win32.Native' -as [type])) {
    Add-Type -Namespace Win32 -Name Native -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
[DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
[DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
'@
  }
  # SW_RESTORE (9) restores a minimized window.
  [Win32.Native]::ShowWindow($hWnd, 9) | Out-Null
  [Win32.Native]::BringWindowToTop($hWnd) | Out-Null
  # Attach the calling thread to the foreground thread, then take foreground.
  # This bypasses the Windows foreground lock for a user-initiated action.
  $fg = [Win32.Native]::GetForegroundWindow()
  $fgTid = [uint32]0
  [Win32.Native]::GetWindowThreadProcessId($fg, [ref]$fgTid) | Out-Null
  $curTid = [Win32.Native]::GetCurrentThreadId()
  [Win32.Native]::AttachThreadInput($curTid, $fgTid, $true) | Out-Null
  [Win32.Native]::SetForegroundWindow($hWnd) | Out-Null
  [Win32.Native]::AttachThreadInput($curTid, $fgTid, $false) | Out-Null
}

$hWnd = [IntPtr]::Zero
if ($TargetPid -gt 0) {
  $p = Get-Process -Id $TargetPid -ErrorAction SilentlyContinue
  if ($p) { $hWnd = $p.MainWindowHandle }
} elseif ($ProcessName) {
  $p = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    Select-Object -First 1
  if ($p) { $hWnd = $p.MainWindowHandle }
}

if ($hWnd -ne [IntPtr]::Zero) {
  Restore-And-Foreground $hWnd
} elseif ($Url) {
  Start-Process $Url
}
