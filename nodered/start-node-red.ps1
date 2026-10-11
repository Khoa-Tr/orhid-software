param(
  [switch]$SyncFlow
)

$ErrorActionPreference = "Stop"

$installRoot = Join-Path $env:LOCALAPPDATA "OrchidNodeRED"
$userDir = Join-Path $installRoot "data"
$nodeRedEntry = Join-Path $installRoot "node_modules\node-red\red.js"
$settingsFile = Join-Path $PSScriptRoot "settings.js"
$flowSource = Join-Path $PSScriptRoot "orchid-flow.json"
$flowFile = Join-Path $userDir "flows.json"

if (-not (Test-Path -LiteralPath $nodeRedEntry)) {
  throw "Node-RED is not installed. Run: npm install --prefix `"$installRoot`" --no-save node-red"
}

New-Item -ItemType Directory -Force -Path $userDir | Out-Null
if (-not (Test-Path -LiteralPath $flowFile)) {
  Copy-Item -LiteralPath $flowSource -Destination $flowFile
} elseif ($SyncFlow) {
  $backupName = "flows.backup.$(Get-Date -Format 'yyyyMMdd-HHmmss-fff').json"
  Copy-Item -LiteralPath $flowFile -Destination (Join-Path $userDir $backupName)
  Copy-Item -LiteralPath $flowSource -Destination $flowFile -Force
}

Set-Location $userDir
& node $nodeRedEntry --userDir $userDir --settings $settingsFile
exit $LASTEXITCODE
