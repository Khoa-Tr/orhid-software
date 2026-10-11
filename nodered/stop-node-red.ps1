$installRoot = Join-Path $env:LOCALAPPDATA "OrchidNodeRED"
$entryPoint = Join-Path $installRoot "node_modules\node-red\red.js"
$escapedEntryPoint = [regex]::Escape($entryPoint)

$processes = Get-CimInstance Win32_Process |
  Where-Object {
    $_.ExecutablePath -match '\\node\.exe$' -and
    $_.CommandLine -match $escapedEntryPoint
  }

if (-not $processes) {
  Write-Output "No Orchid Node-RED process is running."
  exit 0
}

foreach ($process in $processes) {
  Stop-Process -Id $process.ProcessId -ErrorAction Stop
  Write-Output "Stopped Orchid Node-RED process $($process.ProcessId)."
}
