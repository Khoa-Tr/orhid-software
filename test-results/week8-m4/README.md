# Bằng chứng tuần 8 (M4): chạy end-to-end với firmware thật trên Wokwi

Chạy ngày 2026-10-22 trên một máy: Wokwi (VS Code) + `broker.emqx.io` + Node-RED + dashboard.

| File | Nội dung |
| --- | --- |
| `tuan8-uplink-nguoi1.md` | Người 1: uplink 12 phút, đối chiếu Serial ↔ MQTT ↔ dashboard (199/199 gói, 144/144 mẫu dashboard khớp) |
| `tuan8-downlink-nguoi2.md` | Người 2: 10 ca downlink (AUTO/MANUAL, TTL, LOCKOUT, lệnh lặp, lệnh trùng, mất lệnh, mất kết nối), log từng lệnh, lỗi tìm được và cách sửa |
| `img/` | Ảnh dashboard `w8-01` … `w8-09` |
| `logs/serial.log` | Serial ESP32 trên Wokwi, kèm thời điểm UTC (gồm cả các lượt bị Wokwi tạm dừng) |
| `logs/mqtt-wire.log` | Mọi gói `garden/orchid/orchid-01/#` trên broker |
| `logs/node-red-history.jsonl` | Lịch sử Node-RED: lệnh gửi, kết quả ACK, sự kiện an toàn/automation |
| `logs/dashboard-samples.jsonl` | Chữ trên dashboard đọc 5 s/lần trong lúc uplink |
| `logs/driver.log` | Nhật ký script điều khiển (mọi lượt chạy, kể cả lượt hỏng do Wokwi dừng) |
| `logs/uplink-serial-vs-mqtt.csv`, `logs/downlink-commands.csv` | Bảng đối chiếu đầy đủ |
| `before-fix/` | Log lượt chạy đầu, trước khi sửa lỗi lệnh tay hết hạn ngay (xem mục 3.1 báo cáo downlink) |
| `scripts/` | Script ghi log và đối chiếu |

## Chạy lại

1. Build firmware có lệnh giả lập lỗi: `pio run -e esp32dev_fault_test`. Trỏ `firmware`/`elf` trong `wokwi.toml` sang `.pio/build/esp32dev_fault_test/…` (nhớ đổi lại sau khi thử), rồi mở `diagram.json` và bấm chạy Wokwi. **Để tab Wokwi luôn hiển thị**: Wokwi dừng mô phỏng khi tab bị che.
2. Chạy Node-RED với `nodered/settings.js` và file người dùng thử nghiệm (`ORCHID_AUTH_FILE`), import `nodered/orchid-flow.json` (xem README gốc).
3. Mở ba bộ ghi trong một thư mục làm việc `W8_DIR` (có `out/`, `data/` là thư mục chạy Node-RED, `pass.txt` là mật khẩu thử nghiệm):
   - `python scripts/serial_logger.py $W8_DIR/out/serial.log $W8_DIR/out/serial-tx.txt` (cần `pyserial`; đọc Serial qua RFC2217 `localhost:4000`)
   - `node scripts/wire_logger.cjs $W8_DIR/out/mqtt-wire.log` (cần gói `mqtt`)
   - `W8_DIR=… node scripts/driver-w8.cjs` (cần `puppeteer-core` và Chrome; `SKIP_UPLINK=1` để chỉ chạy downlink)
4. Đối chiếu:
   - `W8_OUT=test-results/week8-m4/logs node test-results/week8-m4/scripts/analyze-uplink.cjs`
   - `W8_OUT=test-results/week8-m4/logs W8_HISTORY=test-results/week8-m4/logs/node-red-history.jsonl node test-results/week8-m4/scripts/analyze-downlink.cjs`

   Hai lệnh này chạy được ngay trên log đã lưu.
