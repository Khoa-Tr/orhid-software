# Orchid Garden Misting Controller

Bộ điều khiển vườn lan dùng ESP32. Chương trình đọc cảm biến DHT22, cảm biến ánh sáng và biến trở mô phỏng mực nước, sau đó điều khiển ba relay cho máy phun sương, quạt thông gió và đèn trồng cây.

Tài liệu kỹ thuật bản cuối (kiến trúc 4 tầng, sơ đồ đấu dây, bảng topic và payload MQTT, flow Node-RED, GPIO và ngưỡng): [`docs/tai-lieu-ky-thuat.md`](docs/tai-lieu-ky-thuat.md).

## Chạy lại từ đầu trên máy sạch

Các bước dưới đây dựng lại toàn bộ hệ thống (firmware trên Wokwi, MQTT, Node-RED, dashboard) trên một máy chưa cài gì. Đã chạy lại theo đúng các bước này trên macOS ngày 2026-10-21. Lệnh Windows (PowerShell) ghi bên cạnh.

**1. Cài phần mềm.** Bản đã thử ghi trong ngoặc.

- Git, Python 3 (3.11), Node.js 18 trở lên (24.14).
- Visual Studio Code với extension **PlatformIO IDE** (3.3) và **Wokwi Simulator** (4.0). Wokwi cần kích hoạt license cá nhân miễn phí khi chạy lần đầu.
- Trình duyệt để mở dashboard.

**2. Lấy code.** Trên Windows, đặt project ở đường dẫn không có dấu tiếng Việt hoặc khoảng trắng (ví dụ `C:\orchid`), vì toolchain ESP32 báo lỗi `Invalid argument` với đường dẫn có dấu.

```bash
git clone https://github.com/Khoa-Tr/orhid-software.git
cd orhid-software
```

**3. Build firmware.**

```bash
python3 -m pip install -r requirements.txt        # Windows: py -m pip install -r requirements.txt
python3 -m platformio run -e esp32dev             # Windows: py -m platformio run -e esp32dev
```

Kết quả phải có `SUCCESS`. Firmware nằm ở `.pio/build/esp32dev/firmware.bin`, đúng file mà `wokwi.toml` trỏ tới.

**4. Cài Node-RED và tạo tài khoản dashboard.** Node-RED được cài vào thư mục riêng ngoài project. Mỗi lệnh `set-dashboard-password` hỏi mật khẩu (tối thiểu 8 ký tự).

```bash
# macOS/Linux
npm install --prefix ~/.orchid-node-red --no-save node-red@5.0.8 @flowfuse/node-red-dashboard@1.33.0
node nodered/set-dashboard-password.cjs ~/.orchid-node-red/data/orchid-auth.json --user admin --role admin
node nodered/set-dashboard-password.cjs ~/.orchid-node-red/data/orchid-auth.json --user op1 --role operator
./nodered/start-node-red.sh
```

```powershell
# Windows
npm install --prefix "$env:LOCALAPPDATA\OrchidNodeRED" --no-save node-red@5.0.8 @flowfuse/node-red-dashboard@1.33.0
node nodered\set-dashboard-password.cjs "$env:LOCALAPPDATA\OrchidNodeRED\data\orchid-auth.json" --user admin --role admin
node nodered\set-dashboard-password.cjs "$env:LOCALAPPDATA\OrchidNodeRED\data\orchid-auth.json" --user op1 --role operator
.\nodered\start-node-red.ps1
```

Giữ terminal này mở. Khi thấy `Connected to broker: mqtt://broker.emqx.io:1883` là Node-RED đã sẵn sàng. Flow đã thử với Node-RED 5.0.8 và 4.0.9, cùng FlowFuse Dashboard 1.33.0.

**5. Chạy firmware trên Wokwi.** Trong VS Code, chọn **File → Open Folder…** và mở đúng thư mục `orhid-software` (không mở thư mục cha). Bấm `Ctrl/Cmd+Shift+P` rồi chọn **Wokwi: Start Simulator**, và để tab mô phỏng luôn hiện trên màn hình (bị che thì mô phỏng tạm dừng). Serial Monitor phải in `MQTT connected; subscriptions=OK`.

**6. Kiểm tra hai chiều.** Mở <http://127.0.0.1:1880/dashboard/orchid> và đăng nhập `op1`.

- Uplink: sau vài giây `Device link` là `ONLINE`, nhiệt độ và độ ẩm hiện 28 °C và 72 % (giá trị đầu trong `diagram.json`). Kéo thanh nhiệt độ của DHT22 trong Wokwi thì số trên dashboard đổi theo.
- Downlink: chọn `MANUAL`, bấm `Fan ON`. `Last command` báo `APPLIED`, relay quạt trong Wokwi bật, và Serial in lần lượt `CMD rx …`, `RELAY fan GPIO26 OFF -> ON`, `ACK … result=APPLIED`. Chọn lại `AUTO` để trả quyền cho firmware.

**7. Test tự động không cần board** (tùy chọn): `node nodered/test-flow.cjs` (logic flow) và `node nodered/test-mqtt-broker.cjs` (kết nối broker). Cả hai phải in `PASS`.

Dừng hệ thống: `Ctrl+C` ở terminal Node-RED và đóng tab Wokwi. Nếu cổng 1880 đã có ứng dụng khác dùng, đặt biến `ORCHID_NODE_RED_PORT` trước khi chạy script khởi động.

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
2. Mở đúng thư mục project này (thư mục chứa `wokwi.toml`), không mở thư mục cha.

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

Từ tuần 7, script chạy thêm hai scenario bất thường trên build `esp32dev_fault_test`. Build này dùng timer rút ngắn và có lệnh Serial `FAULT ...` để giả lập lỗi; không nạp nó vào ESP32 thật.

- `scenarios/safety-faults.test.yaml`: DHT lỗi liên tiếp khi đang phun thì `SENSOR_FAULT` (relay tắt, không tự phun lại). Nước thấp trong lúc lỗi thì `WATER_LOCKOUT` được ưu tiên. DHT hồi phục thì `COOLDOWN` rồi mới phun lại. Kèm kiểm tra đèn AUTO bị giới hạn thời lượng (build test: 20 s).
- `scenarios/link-loss.test.yaml`: đóng TCP đột ngột, firmware xóa override và quay về AUTO, rồi tự kết nối lại.

Khi chạy Wokwi trong VS Code với build này, có thể gõ trực tiếp vào Serial Monitor:

- `FAULT DHT ON` / `FAULT DHT OFF`
- `FAULT CMD DROP ON` / `FAULT CMD DROP OFF` (bỏ lệnh không ACK, để thấy `NO_ACK` trên dashboard)
- `FAULT WATER LOW` / `FAULT WATER OFF` (giả lập nước cạn như kéo biến trở xuống 600 ADC, để thử `WATER_LOCKOUT`)
- `FAULT MQTT DROP`

Muốn chạy build này trong VS Code, đổi hai dòng `firmware`/`elf` trong `wokwi.toml` sang `.pio/build/esp32dev_fault_test/…`, nhớ đổi lại sau khi thử. `wokwi.toml` mở sẵn cổng RFC2217 `4000`, nên script trên máy tính có thể đọc và ghi Serial của mô phỏng (xem `test-results/week8-m4/`).

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
| `garden/orchid/orchid-01/telemetry` | ESP32 → broker | JSON cảm biến: `temperature_c`, `humidity_pct` (`null` khi DHT lỗi liên tiếp), `light_adc`, `water_adc`, `dht_fail_streak`, mỗi 2,5 giây |
| `garden/orchid/orchid-01/state` | ESP32 → broker | JSON relay thực tế, `mist_state`, `water_lockout`, `dht_fault`, `mode` và `mist_mode`/`fan_mode`/`light_mode` (AUTO/MANUAL từng relay); trạng thái được retain |
| `garden/orchid/orchid-01/availability` | ESP32 → broker | `online` và MQTT Last Will `offline` |
| `garden/orchid/orchid-01/cmd/mist` | broker → ESP32 | Lệnh điều khiển phun sương |
| `garden/orchid/orchid-01/cmd/fan` | broker → ESP32 | Lệnh điều khiển quạt |
| `garden/orchid/orchid-01/cmd/light` | broker → ESP32 | Lệnh điều khiển đèn |
| `garden/orchid/orchid-01/ack` | ESP32 → broker | Kết quả lệnh theo `request_id` |
| `garden/orchid/orchid-01/config` | broker → ESP32 | Đổi ngưỡng từ xa, chỉ nhận trong giới hạn an toàn (từ tuần 7) |

Bảng topic và payload bản cuối, đủ từng trường, QoS/retain và mã lỗi ACK: [`docs/tai-lieu-ky-thuat.md` mục 3](docs/tai-lieu-ky-thuat.md#3-topic-map-và-payload-bản-cuối).

Gửi lệnh MANUAL dưới dạng JSON, ví dụ tới `garden/orchid/orchid-01/cmd/fan`:

```json
{"request_id":"req-001","mode":"MANUAL","state":"ON","ttl_s":60}
```

Lệnh MANUAL yêu cầu `state` là `ON`/`OFF` và `ttl_s` từ 1 đến 3600. Hết TTL firmware tự trở về AUTO. Gửi `{"request_id":"req-002","mode":"AUTO"}` để xóa override sớm. ESP32 gửi ACK `APPLIED` hoặc `REJECTED`; lệnh bật phun sương bị từ chối (`WATER_LOCKOUT`, `SENSOR_FAULT`, `MIST_COOLDOWN`) khi thiếu nước, DHT lỗi hoặc đang cooldown. Interlock mực nước, thời gian phun tối đa và cooldown vẫn do firmware bảo vệ; xem thêm phần an toàn tuần 7 bên dưới.

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

Các ngưỡng bám theo logic firmware của `orhid` (LDR tối làm ADC tăng). Ba tab tuần 5 chỉ tạo event/debug và ghi lịch sử `orchid-history.jsonl`; chúng không publish lệnh. Lệnh điều khiển của tuần 6-7 chỉ đi qua **một cổng lệnh duy nhất** (Function `Command gateway + ACK tracker`), mô tả bên dưới.

Phân chia trách nhiệm:

- **Firmware** giữ an toàn thiết bị: khóa nước, giới hạn thời gian phun, cooldown, lỗi cảm biến, mất kết nối. Nó vẫn đúng khi Node-RED hoặc broker không chạy.
- **Node-RED** giữ quyền truy cập (đăng nhập, AUTO/MANUAL, thiết bị online, một lệnh chờ ACK mỗi relay) và business rule theo giờ.
- Mọi lệnh từ Node-RED đều có TTL, nên khi Node-RED dừng thì firmware tự trở về AUTO cục bộ.

### Tuần 6 - Dashboard giám sát và điều khiển

Tab **Orchid - Week 6 dashboard and control** (FlowFuse Dashboard 2) tại <http://127.0.0.1:1880/dashboard/orchid>:

- **Live status / Recent sensor history** (Người 1): nhiệt độ, độ ẩm, ADC ánh sáng/nước, trạng thái phun/quạt/đèn, `Firmware mode` (ghi rõ relay nào đang bị override), kết nối `ONLINE/OFFLINE/STALE` (STALE khi >15 s không có telemetry) và hai biểu đồ lịch sử 1 giờ. DHT lỗi hiển thị `DHT fault`/`—`, không hiện số 0 giả.
- **Remote control** (Người 2): chọn `AUTO`/`MANUAL`, TTL lệnh tay (1–60 phút) và 6 nút Mist/Fan/Light ON/OFF.
  - Ở `AUTO` mọi nút bị khóa. Chuyển về `AUTO` sẽ gửi `{"mode":"AUTO"}` cho cả ba relay để xóa override.
  - Nút cũng bị khóa khi thiết bị không `ONLINE`, khi relay đó đang chờ ACK, và riêng `Mist ON` khi firmware báo `WATER_LOCKOUT`, `COOLDOWN` hoặc `SENSOR_FAULT`. Dòng `Locks` ghi lý do khóa.
- Gateway gửi đúng topic `garden/orchid/orchid-01/cmd/<relay>` (QoS 1, **không retain**), đúng payload firmware `{"request_id","mode","state","ttl_s"}`, rồi chờ ACK theo `request_id`.
  - Kết quả là `APPLIED`, `REJECTED (lý do của firmware)`, `NO_ACK` (quá 6 s) hoặc `BLOCKED (lý do cục bộ)`. Kết quả hiện ở `Last command`, popup cho đúng người bấm và bảng **Command history (ACK)** (nguồn, người dùng, độ trễ). Mọi lệnh và kết quả được ghi vào `orchid-history.jsonl`.
  - Gateway kiểm tra lại quyền/chế độ ở phía server, nên gửi thẳng qua socket để vượt nút bị khóa cũng không có tác dụng.
- **Đăng nhập** (Basic auth cho trang dashboard và socket.io, đăng nhập editor) với 3 vai trò: `admin` (editor + điều khiển), `operator` (điều khiển dashboard), `viewer` (chỉ xem; lệnh bị `BLOCKED FORBIDDEN`). Tài khoản lưu ngoài repo, mật khẩu băm scrypt (`nodered/orchid-auth.cjs`); cách tạo ở mục cài đặt bên dưới.

### Tuần 7 - Business rules và tình huống bất thường

Tab **Orchid - Week 7 business rules and safety** chỉ phát lệnh khi dashboard ở `AUTO` và thiết bị `ONLINE`. Cấu hình nằm trong inject `Rule config` (sửa JSON rồi bấm nút inject). Cấu hình sai bị từ chối và giữ bản cũ.

Automation (Người 1):

1. **Đèn theo khung giờ + ngưỡng sáng**: bật trong `06:00–21:00` khi tối (`light_adc > 2200`, tắt khi `< 1800`). Có giờ tắt `off_time`, và tổng thời lượng bật tối đa `daily_max_on_min` = 240 phút/ngày (tính từ trạng thái relay thật). Ngoài khung giờ, hoặc khi hết ngân sách, rule giữ đèn `OFF`, vì logic LDR của firmware sẽ bật suốt đêm. Lệnh `ON` mang TTL không vượt ngân sách còn lại và giờ tắt.
2. **Quạt hỗ trợ sau chu kỳ phun**: khi relay phun chuyển `ON → OFF`, gửi `fan ON` với TTL 60 s (tối đa 24 lần/ngày). Firmware tự trả quạt về AUTO khi hết TTL, nên quạt không chạy cả đêm.

Chăm sóc ban đêm và lỗi an toàn (Người 2):

- **Chính sách ban đêm (mặc định, chờ nhóm xác nhận)**:
  - Khung giờ chăm sóc là `06:00–18:00`. Ngoài khung này, Node-RED giữ lệnh `mist MANUAL OFF` (TTL 900 s, làm mới định kỳ). Firmware khi đó dừng hẳn chu trình phun AUTO, không chạy ngầm phía sau.
  - Muốn cho phun AUTO ban đêm phải đặt `allow_auto_mist_at_night: true` kèm `team_confirmed: true` và `exception_note` (ngưỡng/ngoại lệ đã thống nhất cho loại lan). Thiếu một trong hai, cấu hình bị từ chối.
  - Phun tay ban đêm của operator vẫn được phép như một ngoại lệ, và luôn được ghi `night_mist_observed`.
  - Giờ và ngưỡng ở đây là mặc định để mô phỏng, không phải khuyến nghị trồng lan.
- **Firmware** (`src/main.cpp`):
  - DHT lỗi 3 lần liên tiếp thì vào `SENSOR_FAULT`: tắt phun ngay, không phun AUTO, từ chối `mist ON`, quạt giữ trạng thái cuối, telemetry gửi `null`. Khi DHT hồi phục, firmware vào `COOLDOWN` một chu kỳ rồi mới phun lại.
  - Khóa nước vẫn ưu tiên cao nhất.
  - Topic `garden/orchid/<id>/config` (đổi ngưỡng từ xa) chỉ nhận số trong phạm vi an toàn và giữ khoảng hysteresis tối thiểu; ngưỡng khóa nước `water_low_adc` chỉ được nâng lên, không được hạ dưới 1200. Một trường sai thì từ chối cả gói (`REJECTED`, `INVALID_CONFIG` hoặc `CONFIG_OUT_OF_RANGE`) và giữ ngưỡng cũ.
  - Mất MQTT/Wi-Fi thì xóa mọi override, quay về AUTO cục bộ.
  - Mỗi lần phun tay kết thúc đều vào cooldown. Thời gian phun tay tính từ lúc relay bật, nên gửi `ON` lặp lại không kéo dài được (trước đây lặp `ON` hoặc chờ hết TTL có thể phun liên tục).
  - Đèn AUTO cục bộ bật liên tục tối đa 4 giờ, rồi chờ thấy trời sáng mới bật lại.
- **Fault monitor**: phát `fault_active`/`fault_cleared` kèm `safe_state` cho các lỗi `dht_fault`, `water_low`, `link_offline`, `telemetry_stale`, `ack_missing` (lệnh `NO_ACK`). Nó cũng kiểm tra từ bên ngoài rằng firmware giữ khóa: báo `violation_*` mức critical nếu thấy phun khi khóa nước, khi DHT lỗi, hoặc quá 130 s. Trạng thái hiện ở nhóm **Safety and automation** và bảng **Automation and safety events**.

Giờ tắt đèn 21:00 và quạt 60 s là giá trị nhóm đã thống nhất trong `test-results/tuan7-test-matrix.md`. Đây là bộ automation duy nhất: hai rule trùng trên tab Người 3 đã tắt, và các nút test lệnh của tab đó giờ cũng đi qua gateway (khóa AUTO/MANUAL, ACK, lịch sử lệnh).

Thử nhanh bằng **lịch rút ngắn**: bấm inject `Demo: compressed clock x60 from 05:50` (hoặc `from 17:55`) để 1 giây thật = 1 phút lịch. Ngân sách đèn demo là 60 phút, nên chạm giới hạn sau khoảng 1 phút. TTL gửi xuống firmware được quy đổi về giây thật. Bấm lại `Rule config (real clock)` để về giờ thật.

### Cài/chạy Node-RED trên Windows

Node.js đã cài trên máy thì mở PowerShell và chạy từ thư mục `orhid`:

```powershell
npm install --prefix "$env:LOCALAPPDATA\OrchidNodeRED" --no-save node-red@5.0.8 @flowfuse/node-red-dashboard@1.33.0
node nodered\set-dashboard-password.cjs "$env:LOCALAPPDATA\OrchidNodeRED\data\orchid-auth.json" --user admin --role admin
node nodered\set-dashboard-password.cjs "$env:LOCALAPPDATA\OrchidNodeRED\data\orchid-auth.json" --user op1 --role operator
.\nodered\start-node-red.ps1
```

Lệnh npm cần cài cả Node-RED và FlowFuse Dashboard 2. Lệnh `set-dashboard-password.cjs` hỏi mật khẩu (ẩn, tối thiểu 8 ký tự) và lưu tài khoản ngoài repo; chạy lại với `--user` khác để thêm `operator`/`viewer`, cùng tên để đổi mật khẩu. Node-RED không khởi động nếu chưa có tài khoản `admin`. Khi terminal báo server đã chạy, mở <http://127.0.0.1:1880> (editor, đăng nhập `admin`) và <http://127.0.0.1:1880/dashboard/orchid> (dashboard).

Trên macOS/Linux dùng cùng các bước với `ORCHID_NODE_RED_HOME` mặc định `~/.orchid-node-red`:

```bash
npm install --prefix ~/.orchid-node-red --no-save node-red@5.0.8 @flowfuse/node-red-dashboard@1.33.0
node nodered/set-dashboard-password.cjs ~/.orchid-node-red/data/orchid-auth.json --user admin --role admin
./nodered/start-node-red.sh            # --sync-flow de nap lai orchid-flow.json (co sao luu)
```

Script nạp flow lần đầu vào user data riêng bên ngoài project, nên không đụng firmware hoặc project phần cứng. Khi muốn đồng bộ bản flow trong project vào Node-RED đã cài, chạy `.\nodered\start-node-red.ps1 -SyncFlow`; script sẽ sao lưu flow đang dùng thành `flows.backup.<timestamp>.json` trước khi thay. Nếu không muốn thay file đang dùng, có thể nhập `nodered/orchid-flow.json` thủ công qua **Menu → Import → select a file**, rồi Deploy.

Node-RED chạy trong terminal của người dùng sẽ tiếp tục chạy khi chat bị ngắt, miễn là terminal và laptop vẫn hoạt động. Để dừng, nhấn `Ctrl+C` trong terminal chạy server hoặc chạy `.\nodered\stop-node-red.ps1`. Không cần để assistant giữ một tiến trình nền.

Broker mặc định là `broker.emqx.io:1883`, topic dùng device ID `orchid-01`; nếu đổi `ORCHID_DEVICE_ID` thì cập nhật các MQTT input trong các tab và hằng `DEVICE_TOPIC` trong Function `Command gateway + ACK tracker`. Mở Debug sidebar để xem dữ liệu và sự kiện. File `orchid-history.jsonl` được tạo trong thư mục data của Node-RED, không trong project phần cứng.

Có thể chạy kiểm tra cấu trúc và logic Function node mà không cần board. Test bao gồm dashboard, gateway/ACK/NO_ACK, khóa nút, phân quyền, lịch đèn và giới hạn ngày, quạt sau phun, chính sách ban đêm, fault monitor, ngưỡng đúng 5 phút, không báo sớm và không lặp:

```powershell
node nodered/test-flow.cjs
```

Để thử dashboard mà không cần Wokwi, chạy thiết bị mô phỏng. Nó nói đúng giao thức MQTT của firmware (telemetry/state/ACK/LWT) và có cùng các khóa an toàn. Đây **không** phải firmware; bằng chứng firmware là các scenario Wokwi ở trên.

```powershell
node nodered/sim-device.cjs --fast                          # broker.emqx.io, device orchid-01
node nodered/sim-device.cjs --fast --scenario fault-demo    # tu chay kich ban loi
```

Khi đang chạy, gõ lệnh vào terminal:

- `rh 60`
- `light dark`
- `water low` / `water ok`
- `dht fault` / `dht ok`
- `drop-cmd on` / `drop-cmd off` (lệnh không ACK)
- `link drop 20` (đóng TCP đột ngột, broker phát LWT offline)

Không chạy simulator cùng lúc với Wokwi khi dùng chung device ID.

Bằng chứng lượt chạy end-to-end ngày 2026-10-16 nằm trong `nodered/test-results/week6-7-e2e/`. Lượt này chạy Node-RED 4.0.9 + Dashboard 2 v1.33.0 thật, với `settings.js` của repo, broker MQTT cục bộ và thiết bị mô phỏng `--fast`; các thao tác được bấm qua Chrome headless.

- Ảnh `01`–`06` (tuần 6): AUTO khóa nút. Lệnh `APPLIED`. Firmware-mô phỏng trả `REJECTED (WATER_LOCKOUT)`. Phun tay hết thời gian thì `COOLDOWN` khóa nút. `NO_ACK` sau 6 s. Tài khoản `viewer` bị `FORBIDDEN`.
- Ảnh `07`–`09` (tuần 7, lịch rút ngắn): đèn bật trong khung giờ rồi tắt khi hết 60 phút/ngày. Quạt hỗ trợ sau chu kỳ phun. Ban đêm giữ mist OFF dù RH 60 %.
- Ảnh `10`–`13`: DHT lỗi khi đang phun, nước thấp được ưu tiên, mất kết nối (LWT), hồi phục; rule tự gửi lại lệnh giữ sau khi firmware bỏ override.
- `node-red-history.jsonl` là event log của Node-RED (sự kiện sau dòng `MARK` trong `e2e-run.log` là lúc dừng simulator). `mqtt-wire.log` là lệnh/ACK trên broker; `sim-device.log` là log thiết bị mô phỏng.

Để kiểm tra tích hợp sau khi deploy, publish payload JSON vào `garden/orchid/orchid-01/telemetry`. Ví dụ, đặt `temperature_c` lần lượt là 34, 32, 30 để thấy trạng thái nhiệt độ bật, giữ trong hysteresis, rồi clear; đặt `humidity_pct` lần lượt là 92, 87, 84 để kiểm tra rule độ ẩm. Với LDR, dùng `light_adc` 2400 rồi 1700 để tạo event bật/clear; với nước/phun, dùng `water_adc` 1100 rồi 1550 và `humidity_pct` 60 rồi 82. Xác nhận sự kiện xuất hiện trong Debug sidebar và file lịch sử sau từng chuyển trạng thái.

Broker công khai `broker.emqx.io` không có xác thực: bất kỳ ai biết topic đều có thể publish lệnh trực tiếp tới `cmd/...`, bỏ qua đăng nhập dashboard. Đăng nhập chỉ bảo vệ dashboard/editor; an toàn thiết bị vẫn dựa vào firmware. Vì vậy chỉ dùng cấu hình này cho mô phỏng/demo, không điều khiển tải thật qua broker công khai (cần broker riêng có user/password + TLS).

Chưa kiểm chứng:

- Thay đổi firmware tuần 7 mới được build thành công (`esp32dev`, `esp32dev_timer_test`, `esp32dev_fault_test`); hai scenario Wokwi mới cần chạy bằng `run-tests.ps1` với `WOKWI_CLI_TOKEN`.
- `src/s3_physical.cpp` (board S3 thật) chưa được cập nhật các khóa an toàn tuần 7. Dashboard vẫn chạy với board đó, nhưng không có `dht_fault` và `*_mode`.
- Chưa có lượt end-to-end trên board thật.

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

Ảnh đấu dây vẽ lại từ `diagram.json` (nguồn, GND, tín hiệu): [`docs/wiring-diagram.svg`](docs/wiring-diagram.svg). Chú thích từng chân và ngưỡng nằm ngay trong `namespace Pins` và `namespace Thresholds` của `src/main.cpp`.

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
   - Hai rule dưới đây đã được gộp vào tab **Week 7 business rules and safety** (đi qua gateway lệnh, dừng khi dashboard ở MANUAL); node gốc trên tab Người 3 được tắt và giữ lại để đối chiếu.
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
