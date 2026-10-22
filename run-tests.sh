#!/usr/bin/env bash
# Chay tu dong cac scenario Wokwi (tuan 3 + tuan 7) bang Wokwi CLI tren macOS/Linux.
# Ban PowerShell tuong ung: run-tests.ps1.
# Cach dung (dang o thu muc project):
#   export WOKWI_CLI_TOKEN=<token lay tu https://wokwi.com/dashboard/ci>
#   (tat Node-RED truoc khi chay: firmware dung chung broker va device orchid-01 voi dashboard)
#   ./run-tests.sh                 # chay tat ca
#   ./run-tests.sh water           # chi chay scenario co ten chua "water"
# Goi Wokwi CI mien phi ngat moi phien sau 5 phut, nen moi scenario duoc giu ngan hon muc nay.
# Ket qua: in PASS/FAIL tung scenario; log Serial o $LOG_DIR/<ten log> (mac dinh LOG_DIR=test-results,
# cung ten file nhu run-tests.ps1), log tong hop o $LOG_DIR/serial.log. Khong sua wokwi.toml cua project.

set -u
cd "$(dirname "$0")"
ROOT="$(pwd)"

if [ -z "${WOKWI_CLI_TOKEN:-}" ]; then
  echo "Chua co WOKWI_CLI_TOKEN. Lay token tai https://wokwi.com/dashboard/ci roi chay:"
  echo "  export WOKWI_CLI_TOKEN=<token>"
  exit 2
fi

CLI="$(command -v wokwi-cli || true)"
[ -z "$CLI" ] && [ -x "$HOME/.wokwi/bin/wokwi-cli" ] && CLI="$HOME/.wokwi/bin/wokwi-cli"
if [ -z "$CLI" ]; then
  echo "Chua cai wokwi-cli. Xem huong dan: https://docs.wokwi.com/wokwi-ci/cli-installation"
  exit 2
fi

PIO="$(command -v pio || command -v platformio || true)"
[ -z "$PIO" ] && PIO="python3 -m platformio"

# Ten scenario | build PlatformIO | timeout mo phong (ms) | file log | ghi chu
SCENARIOS=(
  "mist|esp32dev|270000|mist.test.serial.log|phun suong theo do am"
  "water|esp32dev|270000|water.test.serial.log|khoa nuoc can"
  "fan-temp|esp32dev|270000|fan-temp.test.serial.log|quat theo nhiet do"
  "fan-humidity|esp32dev|270000|fan-humidity.test.serial.log|quat theo do am"
  "light|esp32dev|270000|light.test.serial.log|den theo anh sang"
  "sensor-filter|esp32dev|270000|sensor-filter.test.serial.log|loc spike cam bien"
  "mist-timer|esp32dev_timer_test|240000|mist-timer.serial.log|timer rut ngan 15s/10s"
  "safety-faults|esp32dev_fault_test|240000|safety-faults.serial.log|gia lap loi DHT/nuoc va hoi phuc"
  "light-cap|esp32dev_fault_test|240000|light-cap.serial.log|den AUTO toi da 20s"
  "link-loss|esp32dev_fault_test|240000|link-loss.serial.log|gia lap mat MQTT"
)

FILTER="${1:-}"
LOG_DIR="${LOG_DIR:-test-results}"
case "$LOG_DIR" in /*) ;; *) LOG_DIR="$ROOT/$LOG_DIR" ;; esac
mkdir -p "$LOG_DIR"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
BUILT=" "
FAILED=0

for entry in "${SCENARIOS[@]}"; do
  IFS='|' read -r name env timeout logname label <<<"$entry"
  if [ -n "$FILTER" ] && [[ "$name" != *"$FILTER"* ]]; then continue; fi

  if [[ "$BUILT" != *" $env "* ]]; then
    echo "== Build firmware $env =="
    if ! $PIO run -e "$env" >"$WORK/build-$env.log" 2>&1; then
      tail -20 "$WORK/build-$env.log"
      echo "Build $env loi"
      exit 1
    fi
    BUILT="$BUILT$env "
  fi

  # Moi build chay trong mot thu muc tam co wokwi.toml rieng va ban chep firmware cua build do
  # (wokwi-cli luon tinh duong dan firmware tu thu muc project).
  project="$WORK/$env"
  if [ ! -d "$project" ]; then
    mkdir -p "$project"
    cp diagram.json "$project/diagram.json"
    cp ".pio/build/$env/firmware.bin" ".pio/build/$env/firmware.elf" "$project/"
    printf "[wokwi]\nversion = 1\nfirmware = 'firmware.bin'\nelf = 'firmware.elf'\n" >"$project/wokwi.toml"
  fi

  log="$LOG_DIR/$logname"
  echo "== Chay scenarios/$name.test.yaml voi $env ($label) =="
  start=$(date +%s)
  # Man hinh cua wokwi-cli (Serial + tung buoc "Expected text matched") luu them vao <ten>.console.log.
  "$CLI" "$project" --scenario "$ROOT/scenarios/$name.test.yaml" --timeout "$timeout" --serial-log-file "$log" 2>&1 | tee "${log%.serial.log}.console.log"
  code=${PIPESTATUS[0]}
  seconds=$(( $(date +%s) - start ))
  # Scenario khong gui lenh MQTT nao. Firmware ma nhan "CMD rx" nghia la co Node-RED (cua ai do) dang dieu khien
  # orchid-01 tren broker cong khai -> ket qua khong con tin duoc. Tat Node-RED roi chay lai.
  if [ $code -eq 0 ] && grep -q "CMD rx" "$log"; then
    echo "FAIL: $name - firmware nhan lenh MQTT tu ngoai ($(grep -c "CMD rx" "$log") lenh), tat Node-RED/dashboard dang chay roi chay lai"
    FAILED=$((FAILED + 1))
  elif [ $code -eq 0 ]; then
    echo "PASS: $name (${seconds}s)"
  else
    echo "FAIL: $name (ma loi $code, ${seconds}s) - xem $log"
    FAILED=$((FAILED + 1))
  fi
done

cat "$LOG_DIR"/*.serial.log >"$LOG_DIR/serial.log" 2>/dev/null
if [ $FAILED -eq 0 ]; then
  echo "TAT CA SCENARIO PASS; log tong hop: $LOG_DIR/serial.log"
  exit 0
fi
echo "$FAILED scenario FAIL"
exit 1
