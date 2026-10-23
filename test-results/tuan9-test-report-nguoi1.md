# Tuần 9 – Người 1: Test report (chạy lại test tuần 3, 7, 8) và sửa lỗi độ bền

Chạy lại ngày 2026-10-22 trên firmware đã sửa lỗi tràn `millis()` của tuần 8 (commit `a58d86d`). Mỗi dòng trong bảng có bằng chứng là log Serial hoặc log màn hình của Wokwi CLI. Log màn hình có dòng `Expected text matched: "…"` cho từng bước của scenario.

Ký hiệu cột Kết quả:

- **Đạt**: chạy lại sạch và đạt. Firmware không nhận lệnh MQTT nào từ bên ngoài trong lúc chạy.
- **Đạt\***: đạt, nhưng lúc chạy có lệnh MQTT từ một Node-RED khác chen vào (xem mục 1.2). Các lệnh đó không chạm tới phần đang kiểm tra (ghi rõ ở cột bằng chứng). Vẫn nên chạy lại sạch khi còn quota CI.
- **Cần chạy lại**: lệnh chen vào chạm đúng phần đang kiểm tra nên kết quả chưa dùng được. Kèm kết quả của lượt gần nhất để tham khảo.

## 1. Cách chạy và những điều cần biết

### 1.1. Lệnh chạy lại

| Nhóm test | Lệnh | Môi trường |
| --- | --- | --- |
| Firmware tuần 3 và 7 (10 scenario trong `scenarios/`) | `export WOKWI_CLI_TOKEN=…` rồi `./run-tests.sh` (macOS/Linux) hoặc `.\run-tests.ps1` (Windows) | Wokwi CI (cloud), firmware thật |
| Node-RED tuần 6 và 7 (rule, gateway, giám sát lỗi) | `node nodered/test-flow.cjs` | Máy cục bộ, không cần Wokwi |
| End-to-end tuần 8 | Xem `test-results/week8-m4/README.md` | Wokwi VS Code + `broker.emqx.io` + Node-RED + dashboard |

### 1.2. Vấn đề gặp khi chạy lại và cách đã xử lý

1. **Gói Wokwi CI miễn phí ngắt mỗi phiên sau 5 phút.** Hôm chạy, mô phỏng trên cloud chỉ đạt khoảng 30–40 % tốc độ thật, nên 2 scenario dài cũ (`mist-water`, `fan-light`) và `safety-faults` bị ngắt giữa chừng. Đã tách thành các phiên ngắn, giữ nguyên từng bước kiểm tra: `mist` + `water`, `fan-temp` + `fan-humidity` + `light`, `safety-faults` (S1–S4) + `light-cap` (S5).
2. **Lệnh MQTT từ ngoài làm sai kết quả test.** Firmware trong scenario kết nối thật tới `broker.emqx.io` với device `orchid-01`. Ở 3 lượt đầu, một Node-RED thử nghiệm vẫn chạy nền, và rule tự động của nó gửi 23 lệnh (giữ đèn, quạt hỗ trợ sau phun) xuống firmware đang test. Các lệnh này được phát hiện qua dòng `CMD rx` trong log. Đã xử lý:
   - `run-tests.sh` và `run-tests.ps1` giờ coi scenario là **FAIL** nếu firmware nhận bất kỳ lệnh nào, vì scenario không gửi lệnh MQTT.
   - README ghi rõ phải tắt Node-RED trước khi chạy test.
   - Log của các lượt bị chen lệnh vẫn được giữ trong `week9-rerun/co-node-red-chen-lenh/` để đối chiếu.
3. **Hết quota CI tháng của tài khoản đang dùng.** Lượt chạy sạch chỉ kịp chạy `fan-temp` (đạt) và `mist-water` (bản gộp cũ, khớp 8 bước đầu rồi hết 5 phút; sau đó đã tách thành `mist` + `water`). Các ca còn "Cần chạy lại" ở dưới cần token CI của một tài khoản khác trong nhóm.

## 2. Tóm tắt

| Nhóm | Số ca | Đạt | Đạt\* | Cần chạy lại | Không đạt |
| --- | --- | --- | --- | --- | --- |
| Tuần 3 – firmware (Wokwi CI) | 13 | 5 | 7 | 1 | 0 |
| Tuần 7 – firmware (Wokwi CI) | 6 | 0 | 5 | 1 | 0 |
| Tuần 7 – Node-RED (`test-flow.cjs`, 200 assert) | 6 | 6 | 0 | 0 | 0 |
| Tuần 8 – end-to-end (Wokwi VS Code) | 15 | 15 | 0 | 0 | 0 |
| Tuần 9 – chạy lặp M4 và BUG-02 (Wokwi VS Code) | 7 | 7 | 0 | 0 | 0 |

Không có ca nào ra kết quả sai so với mong đợi. Mọi ca "Cần chạy lại" đều do môi trường thử (lệnh chen vào, hết quota), không phải do firmware.

## 3. Tuần 3 – Input / Processing / Output (firmware, Wokwi CI)

Điều kiện đầu của mọi scenario: 28 °C, 72 %RH, 1000 lux (ADC ≈ 700), biến trở nước 0,6 (ADC ≈ 2450), chờ 15 s cho bộ lọc ổn định. Thư mục bằng chứng: `test-results/week9-rerun/` (viết tắt `w9/`).

| ID | Input | Expected | Actual | Kết quả | Bằng chứng |
| --- | --- | --- | --- | --- | --- |
| T3-01 | Điều kiện đầu | `Mist: IDLE \| Fan: OFF \| Grow light: OFF` | Dòng khớp ở mọi scenario | Đạt | `w9/sach/mist-water.test.console.log` (dòng 46) |
| T3-02 | RH 72 → 60 % | `STATE mist IDLE -> RUNNING`, relay phun bật | Khớp, `OUTPUT mist=ON` | Đạt | `w9/sach/mist-water.test.console.log` (dòng 56–59) |
| T3-03 | Đang phun, RH lên 72 % (vùng trễ 65–80) | Vẫn `RUNNING` sau 15 s | `Mist: RUNNING` sau 15 s | Đạt | như trên (dòng 82) |
| T3-04 | RH 82 % rồi về 72 % | `RUNNING -> IDLE`, giữ `IDLE` ở 72 % | Khớp cả hai bước | Đạt | như trên (dòng 95, 117) |
| T3-05 | Đang phun, nước 0,1 (ADC ≈ 410) | `RUNNING -> WATER_LOCKOUT`, relay phun tắt | Khớp | Đạt\* | `w9/co-node-red-chen-lenh/luot1-console.log` (phần `mist-water`) |
| T3-06 | Nước 0,33 (ADC ≈ 1350, vùng trễ 1200–1500), chờ 25 s | Giữ `WATER_LOCKOUT` | Giữ `WATER_LOCKOUT` | Đạt\* | như trên |
| T3-07 | Nước 0,6 | `WATER_LOCKOUT -> IDLE` rồi phun lại `IDLE -> RUNNING` | Khớp | Đạt\* | như trên |
| T3-08 | Nhiệt độ 34 → 32 → 30 °C | Quạt bật ở 34, giữ ở 32 (vùng trễ 31–33), tắt ở 30 | `STATE fan -> ON`, `Fan: ON`, `STATE fan -> OFF` | Đạt | `w9/sach/fan-temp.test.console.log` |
| T3-09 | RH 93 → 87 → 80 % | Quạt bật ở 93, giữ ở 87 (vùng trễ 85–90), tắt ở 80 | Khớp 3 bước | Đạt\* | `w9/co-node-red-chen-lenh/luot3-console.log` (phần `fan-humidity`; chỉ có lệnh giữ đèn chen vào) |
| T3-10 | Ánh sáng 10 → 110 → 1000 lux | Đèn bật khi tối, giữ ở vùng trễ, tắt khi sáng | Lượt gần nhất khớp cả 3 bước, nhưng Node-RED đã gửi `light MANUAL ON/OFF` trong lúc kiểm tra | **Cần chạy lại** | `w9/co-node-red-chen-lenh/luot2-console.log` (phần `light`) |
| T3-11 | RH nhảy 72 → 99 % | Mẫu đầu bị loại (`filtered 72.0`), mẫu lệch thứ 3 được nhận, trung bình trượt lên dần 77.4 → 99.0 | `raw 99.0 filtered 72.0` → `77.4` → `82.8` … → `99.0` | Đạt\* | `w9/co-node-red-chen-lenh/luot1-console.log` (phần `sensor-filter`; chỉ có lệnh giữ đèn) |
| T3-12 | RH tụt 99 → 50 % | Mẫu đầu bị loại (`filtered 99.0`), sau đó giảm dần (89.2 …) | Khớp | Đạt\* | như trên |
| T3-13 | Build `esp32dev_timer_test`, RH 60 % | `IDLE -> RUNNING -> COOLDOWN` (phun tối đa 15 s) `-> IDLE -> RUNNING` (nghỉ 10 s) | Khớp 4 chuyển trạng thái | Đạt\* | `w9/co-node-red-chen-lenh/luot1-console.log` (phần `mist-timer`; lệnh quạt chen vào không đổi FSM phun) |

T3-02 đến T3-04 trong lượt sạch là cùng một phiên `mist-water`. Phiên này hết 5 phút ngay sau bước `IDLE -> RUNNING` của phần khóa nước, nên phần khóa nước (T3-05 đến T3-07) lấy từ lượt 1.

## 4. Tuần 7 – Tình huống bất thường (firmware, Wokwi CI, build `esp32dev_fault_test`)

| ID | Input | Expected | Actual | Kết quả | Bằng chứng |
| --- | --- | --- | --- | --- | --- |
| T7-01 | Đang phun AUTO, gõ `FAULT DHT ON` | 3 lần đọc lỗi liên tiếp → `RUNNING -> SENSOR_FAULT`, relay phun tắt ngay | `DHT22 read failed (1..3 consecutive)`, `STATE mist RUNNING -> SENSOR_FAULT`, `OUTPUT mist=OFF` | Đạt\* | `w9/co-node-red-chen-lenh/luot2-console.log` (phần `safety-faults`; chỉ có lệnh giữ đèn chen vào trước bước 8, lệnh quạt đến sau bước 8) |
| T7-02 | Giữ DHT lỗi 10 s | Không tự phun lại dù RH cuối thấp | `Mist: SENSOR_FAULT` suốt thời gian chờ | Đạt\* | như trên. Dòng `Fan: OFF` chỉ khớp sau khi lệnh quạt hỗ trợ 60 s của Node-RED hết hạn |
| T7-03 | Đang DHT lỗi, nước 0,1 rồi 0,6 | `SENSOR_FAULT -> WATER_LOCKOUT` (khóa nước ưu tiên); đổ nước lại → `IDLE -> SENSOR_FAULT` | Khớp | Đạt\* | như trên |
| T7-04 | `FAULT DHT OFF` | `RECOVERED` → `SENSOR_FAULT -> COOLDOWN -> IDLE -> RUNNING` | Khớp | Đạt\* | như trên |
| T7-05 | Trời tối liên tục (10 lux) | Đèn AUTO bật, tối đa 20 s thì `SAFETY light AUTO on-time limit reached` và tắt. Chỉ bật lại sau khi đã thấy trời sáng | Lượt gần nhất khớp cả 7 bước, nhưng có `light MANUAL ON/OFF` từ Node-RED chen vào | **Cần chạy lại** | `w9/co-node-red-chen-lenh/luot3-console.log` (phần `light-cap`) |
| T7-06 | `FAULT MQTT DROP` (đóng TCP đột ngột) | `SAFETY MQTT link lost; manual overrides cleared -> AUTO`, tự kết nối lại, về `IDLE/OFF/OFF` | Khớp. Lệnh giữ đèn của Node-RED đang có cũng bị xóa đúng như thiết kế | Đạt\* | `w9/co-node-red-chen-lenh/luot1-console.log` (phần `link-loss`) |

## 5. Tuần 7 – Rule và gateway Node-RED (`node nodered/test-flow.cjs`)

Test chạy flow thật (`nodered/orchid-flow.json`) với đồng hồ giả lập. Kết quả: `PASS`, 200 assert (`w9/nodered-test-flow.log`).

| ID | Nội dung kiểm tra | Expected | Kết quả |
| --- | --- | --- | --- |
| N7-01 | Rule đèn | Tối trong khung 06:00–21:00 thì bật; vùng trễ ADC 1800–2200 giữ nguyên; đủ sáng thì tắt; tối đa 240 phút/ngày, qua ngày mới thì reset; 21:00 tắt; lệnh giữ được làm mới ở nửa TTL và không ghi thành hành động mới | Đạt |
| N7-02 | Quạt hỗ trợ sau phun | Bật quạt 60 s (TTL firmware) khi phun kết thúc, không tắt sớm | Đạt |
| N7-03 | Chính sách ban đêm | Không phun AUTO ban đêm khi chưa có xác nhận của nhóm; cấu hình sai bị từ chối và giữ cấu hình hợp lệ cũ | Đạt |
| N7-04 | Giám sát lỗi và kết nối | `STALE` sau 15 s; `online` retained mà chưa có telemetry mới thì là `WAITING`; DHT `null` không vẽ thành 0 | Đạt |
| N7-05 | Gateway lệnh | Đúng định dạng firmware; khóa nút khi chờ ACK; mỗi relay một lệnh đang chờ; `NO_ACK` đúng 6 s; chặn Mist ON khi LOCKOUT kể cả khi bỏ qua nút; viewer không đổi được chế độ; MANUAL thì tạm dừng automation | Đạt |
| N7-06 | Lùi khi mất quyền giữ (thêm ở tuần 8) | Firmware liên tục bỏ lệnh giữ thì chờ 30 s mới gửi lại | Đạt |

## 6. Tuần 8 – End-to-end (Wokwi VS Code + broker công khai + Node-RED + dashboard)

Chi tiết và log từng lệnh: `test-results/week8-m4/tuan8-uplink-nguoi1.md` và `tuan8-downlink-nguoi2.md`.

| ID | Input | Expected | Actual | Kết quả | Bằng chứng |
| --- | --- | --- | --- | --- | --- |
| U1 | Uplink liên tục 12,1 phút | Mỗi dòng `T:` trên Serial có gói `telemetry` cùng giá trị | 199/199 khớp, trễ trung vị 157 ms | Đạt | `week8-m4/logs/uplink-serial-vs-mqtt.csv` |
| U2 | Đọc dashboard 5 s/lần | Đúng số và đơn vị của gói mới nhất | 144/144 khớp, có `°C` và `%` | Đạt | `week8-m4/logs/dashboard-samples.jsonl`, ảnh `w8-01…03` |
| U3 | `FAULT WATER LOW` / `OFF` | Water ADC và `WATER_LOCKOUT` hiện đúng trên dashboard | 3282 → … → 600, `WATER_LOCKOUT`; đổ lại → `IDLE` | Đạt | ảnh `w8-02-uplink-4min.jpg` |
| U4 | `FAULT DHT ON` / `OFF` | Dashboard hiện `DHT fault`, không giữ số cũ | `DHT fault`, `SENSOR_FAULT` → `COOLDOWN` → `IDLE` | Đạt | `tuan8-uplink-nguoi1.md` mục 3 |
| U5 | Ngừng telemetry (Wokwi tạm dừng) | Sau 15 s dashboard báo `STALE`, khóa nút | `STALE` 05:54:28–43, tự về `ONLINE` | Đạt | `dashboard-samples.jsonl` |
| D1–D10 | 10 ca downlink (MANUAL/AUTO, TTL, LOCKOUT, lệnh lặp, lệnh trùng, mất lệnh, mất kết nối) | Xem báo cáo downlink | 10/10 đạt | Đạt (10 ca) | `week8-m4/logs/downlink-commands.csv`, ảnh `w8-04…09` |

## 7. Tuần 9 – Chạy lặp M4 và kiểm tra BUG-02

Chạy ngày 2026-10-22, 08:22 → 08:31 UTC, trên Wokwi VS Code với firmware đã sửa BUG-02 (build `esp32dev_fault_test`), broker `broker.emqx.io`, Node-RED và dashboard thật. Ba vòng D1→D10 chạy liên tiếp, không nghỉ, không chạy lại ca nào, và Wokwi không bị tạm dừng lần nào (`PASS … 0 s paused`). Bằng chứng nằm trong `test-results/week9-rerun/m4-lap-lai/`: `serial.log`, `mqtt-wire.log`, `node-red-history.jsonl`, `driver.log`, bảng lệnh `vong1…3-downlink-table.md`, ảnh `img/`.

| ID | Input | Expected | Actual | Kết quả | Bằng chứng |
| --- | --- | --- | --- | --- | --- |
| M4-1 | Vòng 1: D1→D10 (08:22:09–08:24:52) | Mọi ca đạt như tuần 8 | 23 lệnh: 20 `APPLIED`, 2 `REJECTED` đúng lý do (`WATER_LOCKOUT`, `MIST_COOLDOWN`), 1 `NO_ACK` (cố ý làm mất lệnh), 3 bị gateway chặn `BUSY`. Firmware nhận lệnh sau trung vị 426 ms, ACK về dashboard trung vị 603 ms | Đạt | `vong1-downlink-table.md` |
| M4-2 | Vòng 2 (08:25:03–08:27:49) | Như vòng 1 | Giống hệt vòng 1: 23 lệnh, 20/2/1/3. Nhận 489 ms, ACK 681 ms | Đạt | `vong2-downlink-table.md` |
| M4-3 | Vòng 3 (08:27:56–08:30:35) | Như vòng 1 | Giống hệt vòng 1. Nhận 437 ms, ACK 590 ms | Đạt | `vong3-downlink-table.md` |
| B2-1 | Lệnh `cmd/fan` dài 300 byte (gửi thẳng lên broker) | Trước đây bị bỏ không ACK; nay `APPLIED` | `APPLIED` sau 805 ms | Đạt | `bug02-check.log` |
| B2-2 | Gói `config` đủ 8 ngưỡng, JSON thụt dòng, 297 byte (giá trị mặc định) | `APPLIED CONFIG`, ngưỡng không đổi | `APPLIED`, `reason: CONFIG` | Đạt | như trên |
| B2-3 | Lệnh `cmd/fan` dài 420 byte (vượt 384) | `REJECTED PAYLOAD_TOO_LARGE`, relay không đổi | `REJECTED PAYLOAD_TOO_LARGE`; Serial in `payload too large length=420 (max 383)` | Đạt | như trên, `serial.log` 08:24:55 |
| B2-4 | Trả quạt về `AUTO` | `APPLIED AUTO` | `APPLIED AUTO` | Đạt | như trên |

Mỗi vòng cũng lặp lại các tình huống độ bền: TTL 60 s tự hết hạn (`override expired`), giới hạn phun 15 s (`safety limit reached`), và mất MQTT rồi tự nối lại (vòng 1: 0,8 s; vòng 2: 6,0 s; vòng 3: 1,0 s). Cả ba vòng đều đúng như nhau. Cùng với 5/6 lượt D1–D4 đạt trong buổi chạy tuần 8, kết quả này đáp ứng điều kiện M4 "chạy lặp lại nhiều lần đều ổn".

Script dùng lại được: `test-results/week8-m4/scripts/driver-w8.cjs` (thêm `CASES=D1,D2,…` để chọn ca) và `check-bug02.cjs`.

## 8. Lỗi trong danh sách tuần 8 và trạng thái

| Mã | Lỗi | Người sửa | Trạng thái | Cách sửa và bằng chứng |
| --- | --- | --- | --- | --- |
| BUG-01 | Lệnh `state` dạng boolean thay vì `"ON"/"OFF"` | Người 2 | Đã sửa (tuần 8) | Gateway sinh đúng định dạng; assert "Payload must match the firmware format" trong `test-flow.cjs` |
| BUG-02 | Payload lệnh/config ≥ 256 byte bị firmware bỏ, không ACK (dashboard chỉ thấy `NO_ACK`) | Người 1 | **Đã sửa (tuần 9)** | `commandBufferSize` 256 → 384. Payload dài hơn → ACK `REJECTED` `PAYLOAD_TOO_LARGE` (đọc riêng `request_id` bằng bộ lọc ArduinoJson). S3 thêm bộ đệm gói MQTT 512 byte. Kiểm tra end-to-end ở mục 7 |
| BUG-03 | ACK chậm trên broker công khai gây timeout giả | Người 2 | Đã sửa | Gateway chờ ACK 6 s; assert "NO_ACK must not fire before 6 s" |
| BUG-04 | Bấm liên tục khi chưa có ACK | Người 2 | Đã sửa | Khóa nút tới khi có ACK, mỗi relay một lệnh chờ; ca D8 (`BUSY`) |
| BUG-05 | Build lỗi trên Windows khi đường dẫn có dấu tiếng Việt | Người 1 | Đã ghi hướng dẫn | README mục "Lấy code": đặt project ở đường dẫn không dấu, hoặc tạo junction `mklink /J C:\orchid "…"`. Chưa thử được trên máy Windows |
| (mới) | Lệnh tay hết hạn ngay khi vừa áp dụng (tràn `millis()`) | Người 1 | Đã sửa (tuần 8) | `elapsedMs()` trong `main.cpp` và `s3_physical.cpp`; ca D5 hết hạn đúng 60 s |
| (mới) | Rule gửi lệnh dồn khi firmware bỏ lệnh giữ | Người 1 | Đã sửa (tuần 8) | Lùi 30 s; ca N7-06 |
| (mới) | Test firmware bị Node-RED đang chạy chen lệnh | Người 1 | Đã sửa (tuần 9) | `run-tests.sh/.ps1` báo FAIL khi có `CMD rx`; README ghi phải tắt Node-RED |

**Độ bền khi mất kết nối** (yêu cầu tuần 9): đã kiểm tra ở T7-06 (đóng TCP), D10 (mất MQTT có chủ đích) và 7 lần Wokwi tạm dừng 30 s – 3 phút trong lượt tuần 8. Lần nào firmware cũng xóa lệnh tay về AUTO, tự kết nối lại trong vòng 1–7 s và không phải khởi động lại. Lệnh gửi trong lúc thiết bị mất kết nối không bị áp dụng sai: dashboard báo `NO_ACK`, và nếu lệnh đến muộn thì firmware vẫn kiểm tra an toàn đầy đủ (ví dụ `REJECTED WATER_LOCKOUT` lúc 06:04:57).

## 9. Việc còn lại

1. Chạy lại sạch T3-10 (`light`), T7-05 (`light-cap`) và các ca Đạt\* khi có token CI của tài khoản khác: `./run-tests.sh` (khoảng 35 phút quota cho cả 10 scenario).
2. Thử hướng dẫn junction của BUG-05 trên một máy Windows có đường dẫn tiếng Việt.
