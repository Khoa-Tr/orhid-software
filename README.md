# Orchid Garden Misting Controller

Bộ điều khiển vườn lan dùng ESP32. Chương trình đọc cảm biến DHT22, cảm biến ánh sáng và biến trở mô phỏng mực nước, sau đó điều khiển ba relay cho máy phun sương, quạt thông gió và đèn trồng cây.

## Yêu cầu

- Python 3
- Visual Studio Code
- Extension PlatformIO cho VS Code hoặc PlatformIO được cài bằng pip
- Wokwi Simulator cho VS Code nếu muốn mô phỏng mạch
- Một mạch ESP32 Dev Module nếu muốn thử phần cứng thật

## Cài PlatformIO

Mở terminal tại thư mục project này rồi chạy:

```powershell
py -m pip install -r requirements.txt
```

Các thư viện Arduino sẽ được PlatformIO tự động cài theo file `platformio.ini`:

- DHT sensor library
- Adafruit Unified Sensor
- PubSubClient
- ArduinoJson

## Biên dịch firmware

Mở thư mục này trong VS Code rồi chạy:

```powershell
py -m platformio run
```

Nếu thành công, kết quả cuối sẽ có chữ `SUCCESS`. Firmware được tạo trong thư mục `.pio/build/esp32dev/`.

## Mô phỏng Wokwi trong VS Code

1. Cài extension **Wokwi Simulator for VS Code**.
2. Mở đúng thư mục project này, không mở thư mục cha:

   `C:\Users\ACER\OneDrive\Documents\PlatformIO\Projects\orhid`

3. Biên dịch project bằng lệnh `py -m platformio run`.
4. Mở Command Palette bằng `Ctrl+Shift+P`.
5. Chạy lệnh **Wokwi: Start Simulator**.

Mô phỏng sử dụng sơ đồ trong `diagram.json` và firmware được chỉ định trong `wokwi.toml`. Sau mỗi lần sửa code, hãy build lại trước khi khởi động mô phỏng.

## Chạy test tự động tuần 3

Wokwi CI có thể ngắt một phiên mô phỏng kéo dài quá khoảng 5 phút. Vì vậy `run-tests.ps1` chia kiểm thử thành các phiên riêng: phun/nước, quạt/đèn, lọc spike và timer/cooldown. Test timer dùng riêng build `esp32dev_timer_test` với thời gian tăng tốc (phun 15 giây, cooldown 10 giây) để kiểm tra các chuyển state trong giới hạn phiên CI. Firmware thường vẫn giữ thời gian phun 120 giây và cooldown 60 giây; build timer-test chỉ phục vụ kiểm tra chuyển trạng thái, không dùng để nạp vào ESP32 thật.

1. Cài Wokwi CLI theo hướng dẫn Windows tại <https://docs.wokwi.com/wokwi-ci/cli-installation>.
2. Tạo CI token tại <https://wokwi.com/dashboard/ci>.
3. Mở PowerShell ở thư mục project, đặt token trực tiếp trong terminal rồi chạy:

```powershell
$env:WOKWI_CLI_TOKEN = "token-cua-ban"
.\run-tests.ps1
```

Không chia sẻ token hoặc ghi token vào file project. Kết quả từng phiên nằm trong `test-results/*.serial.log`; log tổng hợp nằm ở `test-results/serial.log`.

## Nạp chương trình vào ESP32 thật

Cắm ESP32 qua USB rồi chạy:

```powershell
py -m platformio run --target upload
py -m platformio device monitor
```

Serial Monitor sử dụng tốc độ `115200` baud.

## Tuần 4 - MQTT uplink/downlink

Firmware kết nối Wi-Fi và broker MQTT public `broker.emqx.io:1883`. Mặc định SSID là `Wokwi-GUEST`, mật khẩu rỗng. Để dùng Wi-Fi riêng, copy `include/orchid_secrets.example.h` thành `include/orchid_secrets.h` rồi sửa SSID, mật khẩu và `ORCHID_DEVICE_ID`; file chứa mật khẩu được `.gitignore` loại khỏi Git.

Topic mặc định với device ID `orchid-01`:

| Topic | Hướng | Nội dung |
| --- | --- | --- |
| `garden/orchid/orchid-01/telemetry` | ESP32 → broker | JSON cảm biến: `temperature_c`, `humidity_pct`, `light_adc`, `water_adc`, mỗi 2,5 giây |
| `garden/orchid/orchid-01/state` | ESP32 → broker | JSON relay thực tế, `mist_state`, `water_lockout`, `mode`; trạng thái được retain |
| `garden/orchid/orchid-01/availability` | ESP32 → broker | `online` và MQTT Last Will `offline` |
| `garden/orchid/orchid-01/cmd/mist` | broker → ESP32 | Lệnh điều khiển phun sương |
| `garden/orchid/orchid-01/cmd/fan` | broker → ESP32 | Lệnh điều khiển quạt |
| `garden/orchid/orchid-01/cmd/light` | broker → ESP32 | Lệnh điều khiển đèn |
| `garden/orchid/orchid-01/ack` | ESP32 → broker | Kết quả lệnh theo `request_id` |

Gửi lệnh MANUAL dưới dạng JSON, ví dụ tới `garden/orchid/orchid-01/cmd/fan`:

```json
{"request_id":"req-001","mode":"MANUAL","state":"ON","ttl_s":60}
```

Lệnh MANUAL yêu cầu `state` là `ON`/`OFF` và `ttl_s` từ 1 đến 3600. Hết TTL firmware tự trở về AUTO. Gửi `{"request_id":"req-002","mode":"AUTO"}` để xóa override sớm. ESP32 gửi ACK `APPLIED` hoặc `REJECTED`; lệnh bật phun sương bị từ chối khi thiếu nước, đang lockout hoặc cooldown. Interlock mực nước, thời gian phun tối đa và cooldown vẫn do firmware bảo vệ.

Trong MQTTX subscribe `garden/orchid/orchid-01/#` để xem dữ liệu, rồi publish lệnh lên topic `cmd/...`. Mỗi board cần ID riêng nếu cùng dùng broker public. Broker public không có xác thực cho các topic này: chỉ dùng mô phỏng/demo, không dùng điều khiển relay hoặc tải thật. Firmware thử kết nối lại theo chu kỳ và không dùng `delay()` trong loop; mỗi lần gọi kết nối MQTT được giới hạn timeout ngắn.

Có thể kiểm tra kết nối mạng tới broker, subscribe, publish/echo và kết nối lại bằng Node.js, không cần cài package bổ sung:

```powershell
node nodered/test-mqtt-broker.cjs
```

Script dùng topic kiểm tra ngẫu nhiên riêng dưới `garden/orchid/week45-validation/...`, không publish vào topic lệnh của thiết bị. Đây chỉ là kiểm tra broker/client MQTT trên máy tính; để nghiệm thu firmware tuần 4, cần thêm bằng chứng ESP32 thật hoặc Wokwi kết nối Wi-Fi, publish telemetry, nhận lệnh/ACK và reconnect.

Lần kiểm tra broker gần nhất đạt connect, subscribe, publish/echo và reconnect/resubscribe; log nằm trong `nodered/test-results/week4-mqtt-broker.log`. Đây là bằng chứng đường truyền broker hoạt động, không phải kiểm thử firmware ESP32.

## Tuần 5-7 - Node-RED middleware, dashboard và automation

**MQTT** là giao thức nhắn tin nhẹ giữa thiết bị và ứng dụng. **Broker** là máy chủ trung gian nhận/chuyển tiếp các tin nhắn MQTT; demo này dùng broker công khai `broker.emqx.io:1883`. **Node-RED** là ứng dụng middleware chạy trên laptop: nó subscribe topic từ broker, xử lý luật và hiển thị/ghi lại event. Ba thứ này khác nhau; MQTT là giao thức nên không cần cài riêng, broker demo đã có trên Internet, còn Node-RED cần chạy trên laptop.

Flow export nằm ở `nodered/orchid-flow.json`. Ba tab đầu là middleware và rule tuần 5:

1. **Monitor and history**: nhận MQTT feed, hiển thị dữ liệu trong Debug sidebar, ghi thay đổi relay/availability; báo ngay khi thiết bị offline, đồng thời ghi thêm cảnh báo một lần nếu offline liên tục trên 5 phút. Telemetry cũ hơn 15 giây cũng có cảnh báo riêng.
2. **Climate and light threshold automation**: phát event khi nhiệt độ vượt 33°C, độ ẩm vượt 90%, hoặc LDR vượt 2200 ADC; ghi event clear khi nhiệt độ xuống dưới 31°C, độ ẩm xuống dưới 85%, hoặc LDR xuống dưới 1800 ADC.
3. **Water and mist rules**: ghi event khóa nước khi ADC <1200, phục hồi khi ADC đạt >=1500; theo dõi điều kiện nhu cầu phun khi RH <65% và nước không khóa, giữ trạng thái đến khi RH đạt >=80% hoặc nước thấp.

Các ngưỡng bám theo logic firmware của `orhid` (LDR tối làm ADC tăng). Automation chỉ tạo event/debug và ghi lịch sử `orchid-history.jsonl`; chúng **không publish lệnh điều khiển relay**. Broker demo là công khai, vì vậy flow giữ quyền điều khiển trong firmware và không đưa lệnh tải thật qua MQTT.

### Tuần 6 - Dashboard giám sát

Flow có thêm tab **Orchid - Week 6 dashboard** dùng FlowFuse Dashboard 2. Trang chỉ đọc hiển thị nhiệt độ, độ ẩm, ADC ánh sáng/nước, trạng thái phun/quạt/đèn, mode AUTO/MANUAL, trạng thái kết nối và biểu đồ lịch sử ngắn. Thiết bị được đánh dấu `STALE` nếu quá 15 giây không có telemetry. Mở dashboard tại <http://127.0.0.1:1880/dashboard/orchid> sau khi cài package và Deploy flow.

Tab này không có nút điều khiển, đăng nhập/phân quyền, Telegram hay MQTT Out; các phần đó không thuộc vai trò dashboard giám sát đang triển khai.

### Tuần 7 - Business rules dạng đề xuất

Tab **Orchid - Week 7 business rules** tạo event đề xuất, không tự tác động relay:

- Lịch đèn demo 08:00–20:00: chỉ đề xuất bật trong khung giờ khi `light_adc > 2200`; ngoài giờ đề xuất tắt. Giờ và ngưỡng chỉ là mặc định để mô phỏng/test, không phải khuyến nghị trồng lan; cần nhóm hiệu chỉnh theo cảm biến và điều kiện thực tế.
- Sau khi `mist_state` chuyển từ `RUNNING` sang `IDLE`/`COOLDOWN`, đề xuất bật quạt 180 giây rồi đề xuất tắt. Event chỉ ghi vào Debug và `orchid-history.jsonl`.

Các đề xuất được phát khi trạng thái thay đổi, tránh ghi lặp cùng một khuyến nghị cho lịch đèn. Mọi automation vẫn ở chế độ monitor-only; không có MQTT Out và không tự động bật/tắt tải.

### Cài/chạy Node-RED trên Windows

Node.js đã cài trên máy thì mở PowerShell và chạy từ thư mục `orhid`:

```powershell
npm install --prefix "$env:LOCALAPPDATA\OrchidNodeRED" --no-save node-red @flowfuse/node-red-dashboard
.\nodered\start-node-red.ps1
```

Lệnh npm cần cài cả Node-RED và FlowFuse Dashboard 2. Khi terminal báo server đã chạy, mở <http://127.0.0.1:1880>. Script nạp flow lần đầu vào user data riêng bên ngoài project, nên không đụng firmware hoặc project phần cứng. Khi muốn đồng bộ bản flow trong project vào Node-RED đã cài, chạy `.\nodered\start-node-red.ps1 -SyncFlow`; script sẽ sao lưu flow đang dùng thành `flows.backup.<timestamp>.json` trước khi thay. Nếu không muốn thay file đang dùng, có thể nhập `nodered/orchid-flow.json` thủ công qua **Menu → Import → select a file**, rồi Deploy.

Node-RED chạy trong terminal của người dùng sẽ tiếp tục chạy khi chat bị ngắt, miễn là terminal và laptop vẫn hoạt động. Để dừng, nhấn `Ctrl+C` trong terminal chạy server hoặc chạy `.\nodered\stop-node-red.ps1`. Không cần để assistant giữ một tiến trình nền.

Broker mặc định là `broker.emqx.io:1883`, topic dùng device ID `orchid-01`; nếu đổi `ORCHID_DEVICE_ID` thì cập nhật các MQTT input trong các tab. Mở Debug sidebar để xem dữ liệu và sự kiện. File `orchid-history.jsonl` được tạo trong thư mục data của Node-RED, không trong project phần cứng.

Có thể chạy kiểm tra cấu trúc và logic Function node (dashboard, lịch đèn, quạt sau phun, ngưỡng đúng 5 phút, không báo sớm và không lặp) mà không cần board:

```powershell
node nodered/test-flow.cjs
```

Để kiểm tra tích hợp sau khi deploy, publish payload JSON vào `garden/orchid/orchid-01/telemetry`. Ví dụ, đặt `temperature_c` lần lượt là 34, 32, 30 để thấy trạng thái nhiệt độ bật, giữ trong hysteresis, rồi clear; đặt `humidity_pct` lần lượt là 92, 87, 84 để kiểm tra rule độ ẩm. Với LDR, dùng `light_adc` 2400 rồi 1700 để tạo event bật/clear; với nước/phun, dùng `water_adc` 1100 rồi 1550 và `humidity_pct` 60 rồi 82. Xác nhận sự kiện xuất hiện trong Debug sidebar và file lịch sử sau từng chuyển trạng thái.

Broker công khai không có xác thực và các topic có thể bị người khác publish; chỉ dùng flow này cho mô phỏng/demo. MQTT Out và nút điều khiển từ ZIP của Người 3 chưa được tích hợp: payload cần khớp giao thức firmware, đồng thời broker công khai không phù hợp để điều khiển tải thật. Dashboard và automation tuần 6-7 ở đây chỉ giám sát/phát đề xuất.

Các test tự động chạy Function node với payload tổng hợp, không phải số đo từ cảm biến/board thật. Sau khi Deploy flow, có thể kiểm tra giao diện bằng telemetry từ Wokwi/ESP32 hoặc publish dữ liệu thử, rồi chụp Dashboard và giữ event history làm bằng chứng. Chưa xác nhận một lượt kiểm thử end-to-end trên board thật.

## Sơ đồ chân

| Thiết bị | Chân ESP32 |
| --- | ---: |
| Dữ liệu DHT22 | GPIO 15 |
| Ngõ ra analog cảm biến ánh sáng | GPIO 34 |
| Tín hiệu cảm biến nước | GPIO 35 |
| Relay máy phun sương | GPIO 25 |
| Relay quạt | GPIO 26 |
| Relay đèn trồng cây | GPIO 27 |

Trong sơ đồ Wokwi [`diagram.json`](./diagram.json), ba relay được xếp từ trên xuống: **bơm/phun sương (GPIO25)**, **quạt (GPIO26)**, **đèn trồng cây (GPIO27)**. Đây là pinout của project phần mềm/mô phỏng `orhid`; project phần cứng riêng có pinout khác, nên hãy đối chiếu đúng project trước khi đấu dây.

## Tuần 3 - Calibration và lọc tín hiệu

Hàm `readFilteredSensors()` trong `src/main.cpp` đọc cảm biến và trả về:

- Nhiệt độ, độ ẩm DHT22 đã lọc bằng running average 5 mẫu.
- LDR và water level đã lọc bằng running average 5 mẫu.
- Giá trị ADC thô và ADC đã lọc để đối chiếu.
- Bước nhảy bất thường bị loại bỏ trước khi đưa vào bộ lọc.

Mở Serial Monitor ở `115200` baud. Mỗi chu kỳ sẽ có một dòng dạng:

```text
CAL raw_light=... filtered_light=... raw_water=... filtered_water=... raw_temp=... filtered_temp=... raw_humidity=... filtered_humidity=...
```

Ghi các dòng này vào `calibration-log.csv`. Để calibration trong Wokwi:

1. Chạy mô phỏng và ghi ít nhất 10 mẫu ở trạng thái sáng và tối của LDR.
2. Ghi ít nhất 10 mẫu khi water potentiometer ở mức đủ nước và mức thấp.
3. Tính trung bình các giá trị `filtered` cho từng trạng thái.
4. Đặt `lightOnAdc` và `lightOffAdc` ở hai mức có khoảng trễ giữa sáng/tối.
5. Đặt `waterLowAdc` thấp hơn giá trị filtered khi đủ nước và cao hơn giá trị filtered khi cạn nước, theo chiều tăng/giảm thực tế của cảm biến.
6. Ghi lại các giá trị đã chọn và điều kiện test vào cột `notes` của `calibration-log.csv`.

Không nên dùng trực tiếp các ngưỡng cũ nếu chưa có bảng số đo. Các hằng số ngưỡng nằm trong namespace `Thresholds` của `src/main.cpp`.

## Các file cần gửi

Hãy gửi các file và thư mục sau:

```text
platformio.ini
requirements.txt
README.md
src/main.cpp
diagram.json
wokwi.toml
calibration-log.csv
```

Không cần gửi thư mục `.pio`; PlatformIO sẽ tự tạo thư mục này trong lần build đầu tiên.

## Lỗi thường gặp

### `Not a PlatformIO project`

Terminal đang ở sai thư mục. Hãy chuyển đến thư mục có file `platformio.ini` trước khi chạy PlatformIO.

### Wokwi không tìm thấy `firmware.bin`

Hãy build project trước và đảm bảo VS Code đang mở đúng thư mục có file `wokwi.toml`.

### Wokwi báo `timeout: busy`

Dừng phiên mô phỏng cũ rồi chạy lại script. Test runner chia scenario thành các phiên nhỏ để tránh giới hạn kết nối của Wokwi CI; nếu vẫn timeout, kiểm tra kết nối mạng/Wokwi CI và log riêng của scenario bị ngắt.

---

## Người 3 - Tuần 6 & Tuần 7: Cảnh báo, Telegram Bot, Business Rules & Kiểm thử

Flow Node-RED tại `nodered/orchid-flow.json` đã tích hợp thêm tab riêng cho Người 3 (`Orchid - Người 3: Cảnh báo Telegram & Ghép luồng E2E`):

1. **Chuẩn hóa Lệnh Downlink và Xử lý ACK (Tuần 6):**
   - Payload lệnh khớp 100% với firmware hiện tại: có `request_id`, `mode` (`MANUAL`/`AUTO`), `state` (`ON`/`OFF`), `ttl_s` (1 đến 3600 giây).
   - Xử lý ACK từ firmware: phân loại `APPLIED` và `REJECTED` (lý do an toàn: `WATER_LOCKOUT`, `MIST_COOLDOWN`,...).

2. **Cảnh báo Đa kênh & Bảo mật Telegram Bot (Tuần 6):**
   - Tự động phát hiện và gửi cảnh báo khi: Nước thấp (`water_adc < 1200`), Board offline (LWT & Watchdog 5 phút), Nhiệt độ cao (>= 33°C), Lỗi cảm biến DHT22.
   - Bảo mật Telegram: Whitelist chat ID nhóm (chặn toàn bộ người lạ), nạp bot token qua biến môi trường `TELEGRAM_BOT_TOKEN` (không hardcode lộ token).

3. **Business Rules Tuần 7:**
   - **Rule 1 (Đèn theo quang chu kỳ):** Khung giờ chiếu sáng có khoảng tối sinh học bắt buộc; cấm bật xuyên đêm (21h-6h cưỡng bức tắt); ban ngày bù sáng khi thiếu sáng (`light_adc >= 2200`) và tự tắt khi đủ sáng.
   - **Rule 2 (Quạt sau chu kỳ phun sương):** Khi sương vừa ngắt, quạt tự động bật 60 giây để hong ráo lá lan, chống úng đọng và nấm khuẩn.
   - **Bảo vệ an toàn cuối cùng:** Firmware ESP32 giữ các interlock cạn nước, cooldown và timeout lệnh.

4. **Kiểm thử và Bàn giao:**
   - Script test tự động toàn bộ 10 kịch bản: `py test-results/run_e2e_test_suite.py` (đạt 10/10 PASS).
   - Script test MQTT trực tiếp: `py test-results/run_mqtt_test.py`.
   - Báo cáo nghiệm thu và ma trận hồi quy: `test-results/tuan6-e2e-integration.md`, `test-results/tuan7-test-matrix.md`, và kịch bản demo `test-results/demo-guide-video.md`.


---

## Người 3 - Tuần 8 & Tuần 9: End-to-End Integration (M4), Báo cáo & Tài liệu nghiệm thu

1. **Tuần 8 — Demo E2E và Thử nghiệm Mất kết nối (Cột mốc M4, 15%):**
   - **Luồng 2 chiều 4 tầng:** Sensor (ESP32) ➔ MQTT Broker (`broker.emqx.io`) ➔ Node-RED ➔ Dashboard & Telegram Bot.
   - **Độ lặp lại M4 (Repeatability):** Chạy 5 chu kỳ liên tiếp luồng 2 chiều bằng script tự động `test-results/run_m4_reconnection_test.py` (đạt 5/5 chu kỳ PASS 100%, thời gian phản hồi trung bình 0.74s).
   - **Kiểm thử mất mạng (LWT) & Tự phục hồi:** Broker phát Last Will `offline` khi cắt kết nối; sau khi nối lại, ESP32 tự động reconnect non-blocking, đồng bộ lại trạng thái `state` (retained) mà không bị treo vòng lặp.
   - **Danh sách lỗi tích hợp (Integration Bug Tracker):** Đã lập bảng theo dõi và phân công 5 lỗi tích hợp (BUG-01 đến BUG-05) cho Người 1 (Firmware/Uplink) và Người 2 (Downlink/Dashboard). Chi tiết tại `test-results/tuan8-e2e-integration-m4.md`.

2. **Tuần 9 — System Test, Báo cáo Tổng kết & Checklist:**
   - **Kịch bản Video Demo chính thức:** `test-results/demo-guide-video.md` (timeline 2-3 phút, kịch bản thao tác 4 tầng, lời thuyết minh chuẩn).
   - **Bản nháp Báo cáo đồ án tổng kết:** `test-results/tuan9-bao-cao-do-an-nhap.md` (cấu trúc bài bản 9 phần, phân tích kiến trúc, máy trạng thái FSM, bản đồ topic và bảng tổng hợp M1-M4).
   - **Dàn ý Slide thuyết trình bảo vệ đồ án:** `test-results/tuan9-slide-thuyet-trinh.md` (12 slide súc tích, mạch lạc phục vụ báo cáo trước hội đồng).
   - **Checklist nghiệm thu toàn nhóm:** `test-results/checklist-deliverables.md` (rà soát đầy đủ deliverables của Người 1, Người 2, Người 3 từ Tuần 1 đến Tuần 9).
   - **Kiểm thử tái hiện trên môi trường sạch:** Script `test-results/verify_clean_install.py` (kiểm tra toàn bộ cấu trúc file, cú pháp JSON, kết nối broker và thư viện Python, đạt chuẩn 100%).
