param(
  [switch]$SyncFlow
)

$ErrorActionPreference = "Stop"

$installRoot = Join-Path $env:LOCALAPPDATA "OrchidNodeRED"
$userDir = Join-Path $installRoot "data"
$nodeRedEntry = Join-Path $installRoot "node_modules\node-red\red.js"
$dashboardPackage = Join-Path $installRoot "node_modules\@flowfuse\node-red-dashboard\package.json"
$settingsFile = Join-Path $PSScriptRoot "settings.js"
$flowSource = Join-Path $PSScriptRoot "orchid-flow.json"
$flowFile = Join-Path $userDir "flows.json"
$authFile = Join-Path $userDir "orchid-auth.json"
$passwordTool = Join-Path $PSScriptRoot "set-dashboard-password.cjs"

if (-not (Test-Path -LiteralPath $nodeRedEntry)) {
  throw "Node-RED is not installed. Run: npm install --prefix `"$installRoot`" --no-save node-red @flowfuse/node-red-dashboard"
}

if (-not (Test-Path -LiteralPath $dashboardPackage)) {
  throw "FlowFuse Dashboard 2 is not installed. Run: npm install --prefix `"$installRoot`" --no-save node-red @flowfuse/node-red-dashboard"
}

New-Item -ItemType Directory -Force -Path $userDir | Out-Null
if (-not (Test-Path -LiteralPath $authFile)) {
  throw "Dashboard login is not configured. Create an admin account first: node `"$passwordTool`" `"$authFile`" --user admin --role admin"
}
$env:ORCHID_AUTH_FILE = $authFile

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
