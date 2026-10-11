# Chay tu dong bang test tuan 3 bang Wokwi CLI.
# Cach dung (PowerShell, dang o thu muc orhid):
#   $env:WOKWI_CLI_TOKEN = "<token lay tu https://wokwi.com/dashboard/ci>"
#   .\run-tests.ps1
# Ket qua: in PASS/FAIL tren man hinh, log Serial luu o test-results\serial.log

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not $env:WOKWI_CLI_TOKEN) {
  Write-Host "Chua co WOKWI_CLI_TOKEN. Lay token tai https://wokwi.com/dashboard/ci roi chay:" -ForegroundColor Yellow
  Write-Host '  $env:WOKWI_CLI_TOKEN = "<token>"' -ForegroundColor Yellow
  exit 2
}

$cli = Get-Command wokwi-cli -ErrorAction SilentlyContinue
if (-not $cli) {
  $local = Join-Path $env:USERPROFILE ".wokwi\bin\wokwi-cli.exe"
  if (Test-Path $local) { $cli = $local } else {
    Write-Host "Chua cai wokwi-cli. Xem huong dan: https://docs.wokwi.com/wokwi-ci/getting-started" -ForegroundColor Yellow
    exit 2
  }
} else { $cli = $cli.Source }

Write-Host "== Build firmware ==" -ForegroundColor Cyan
py -m platformio run
if ($LASTEXITCODE -ne 0) { Write-Host "Build loi" -ForegroundColor Red; exit 1 }

New-Item -ItemType Directory -Force -Path "test-results" | Out-Null

$scenarios = @(
  "scenarios/mist-water.test.yaml",
  "scenarios/fan-light.test.yaml",
  "scenarios/sensor-filter.test.yaml"
)

foreach ($scenario in $scenarios) {
  $name = [System.IO.Path]::GetFileNameWithoutExtension($scenario)
  $log = "test-results/$name.serial.log"
  Write-Host "== Chay $scenario ==" -ForegroundColor Cyan
  & $cli . --scenario $scenario --timeout 270000 --serial-log-file $log
  if ($LASTEXITCODE -ne 0) {
    Write-Host "FAIL: $scenario (xem $log)" -ForegroundColor Red
    Get-ChildItem "test-results/*.serial.log" -ErrorAction SilentlyContinue |
      ForEach-Object { Get-Content $_.FullName } |
      Set-Content "test-results/serial.log"
    exit $LASTEXITCODE
  }
  Write-Host "PASS: $scenario" -ForegroundColor Green
}

$timerScenario = "scenarios/mist-timer.test.yaml"
$timerLog = "test-results/mist-timer.serial.log"
$wokwiConfigPath = Join-Path $PSScriptRoot "wokwi.toml"
$originalWokwiConfig = [System.IO.File]::ReadAllText($wokwiConfigPath)

Write-Host "== Build firmware timer-test (timer accelerated only for test) ==" -ForegroundColor Cyan
py -m platformio run -e esp32dev_timer_test
if ($LASTEXITCODE -ne 0) { Write-Host "Build timer-test loi" -ForegroundColor Red; exit 1 }

try {
  $timerWokwiConfig = $originalWokwiConfig.Replace(
    ".pio/build/esp32dev/firmware.bin", ".pio/build/esp32dev_timer_test/firmware.bin").Replace(
    ".pio/build/esp32dev/firmware.elf", ".pio/build/esp32dev_timer_test/firmware.elf")
  [System.IO.File]::WriteAllText($wokwiConfigPath, $timerWokwiConfig, [System.Text.UTF8Encoding]::new($false))

  Write-Host "== Chay $timerScenario voi timer test 15s/10s ==" -ForegroundColor Cyan
  & $cli . --scenario $timerScenario --timeout 240000 --serial-log-file $timerLog
  if ($LASTEXITCODE -ne 0) {
    Write-Host "FAIL: $timerScenario (xem $timerLog)" -ForegroundColor Red
    exit $LASTEXITCODE
  }
  Write-Host "PASS: $timerScenario (timer accelerated build)" -ForegroundColor Green
} finally {
  [System.IO.File]::WriteAllText($wokwiConfigPath, $originalWokwiConfig, [System.Text.UTF8Encoding]::new($false))
}

Get-ChildItem "test-results/*.serial.log" -ErrorAction SilentlyContinue |
  ForEach-Object { Get-Content $_.FullName } |
  Set-Content "test-results/serial.log"
Write-Host "TAT CA SCENARIO PASS; log tong hop: test-results\serial.log" -ForegroundColor Green
exit 0
