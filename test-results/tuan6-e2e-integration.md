# BÁO CÁO CÔNG VIỆC NGƯỜI 3 — TUẦN 6: TẦNG APPLICATION / PLATFORM
**Chuyên đề:** Cảnh báo hệ thống, Tích hợp Telegram Bot, Ghép nối luồng End-to-End và Bảo mật Dashboard  
**Người thực hiện:** Người 3  
**Thời lượng thực hiện:** 6 giờ  

---

## 1. Mục tiêu và Tổng quan nhiệm vụ
Trong Tuần 6, Người 3 đảm nhiệm việc hoàn thiện tầng ứng dụng từ phía xử lý cảnh báo, kết nối thông báo tức thời tới người dùng (Telegram Bot), ghép nối toàn bộ dòng chảy dữ liệu (End-to-End Integration) và chuẩn hóa toàn bộ giao thức điều khiển đảm bảo 100% tương thích với Firmware ESP32 hiện tại.

### Các hạng mục chính đã hoàn thành:
1. **Hệ thống Cảnh báo Đa kênh (Dashboard & Telegram):**
   - Tự động phát hiện và gửi cảnh báo khi: **Mực nước thấp (Water Low)**, **Thiết bị ngắt kết nối (Board Offline)**, và **Nhiệt độ cao vượt ngưỡng an toàn**.
2. **Bảo mật Telegram Bot:**
   - Cơ chế Whitelist Chat ID: Chỉ chấp nhận và gửi cảnh báo tới duy nhất Group Chat ID của nhóm; chặn toàn bộ tương tác từ người lạ bên ngoài.
   - Bảo vệ Token bí mật: Token bot không được hardcode công khai, hỗ trợ nạp qua biến môi trường (`TELEGRAM_BOT_TOKEN`) hoặc context bảo mật.
3. **Chuẩn hóa Giao thức Điều khiển (Downlink Commands):**
   - Loại bỏ hoàn toàn format payload cũ (`{"mode":"MANUAL", "state": true, "duration": 3600}`).
   - Khớp 100% với firmware hiện tại: có `request_id`, `mode: "MANUAL"|"AUTO"`, `state: "ON"|"OFF"`, `ttl_s: 1..3600`.
   - Thu nhận và xử lý đầy đủ bản tin phản hồi `ACK` (`APPLIED` / `REJECTED` kèm `reason`).
4. **Hướng dẫn Cấu hình Bảo vệ Dashboard Node-RED:**
   - Thiết lập xác thực người dùng (Authentication) cho cả Node-RED Flow Editor và Dashboard UI (`/ui`).

---

## 2. Kiến trúc Luồng Dữ liệu Ghép nối (End-to-End Dataflow)

Hệ thống được ghép nối khép kín thông qua mô hình Publish/Subscribe trên MQTT Broker (`broker.emqx.io:1883`):

```
       [ ESP32 Simulation (Wokwi) ]
           │                    ▲
  1. Telemetry / State / LWT    │  3. Commands (MANUAL/AUTO)
           ▼                    │  4. ACK (APPLIED/REJECTED)
   ┌────────────────────────────────────────────────────────┐
   │             MQTT Broker (broker.emqx.io)               │
   └────────────────────────────────────────────────────────┘
           │                    ▲
  2. Sub Feeds (#)              │  Publish Commands (cmd/...)
           ▼                    │
      [ Node-RED Orchestration & Dashboard (orchid-flow.json) ]
       ├── Parse Feeds & Event Logging (orchid-history.jsonl)
       ├── Watchdog & Threshold Evaluator
       ├── Central Alert Dispatcher ──► Dashboard Debug
       │                            └──► Telegram Bot API ──► [ Group Chat ]
       └── Command Formatter (Tạo request_id, kiểm tra TTL)
```

---

## 3. Chi tiết Giao thức Điều khiển & Xử lý ACK (Khớp Firmware Hiện Tại)

### 3.1. Cấu trúc lệnh Downlink (Node-RED → ESP32)
Gửi tới các topic:
- Phun sương: `garden/orchid/orchid-01/cmd/mist`
- Quạt thông gió: `garden/orchid/orchid-01/cmd/fan`
- Đèn quang hợp: `garden/orchid/orchid-01/cmd/light`

**Lệnh MANUAL (Bật/Tắt có thời hạn):**
```json
{
  "request_id": "req-mist-on-1729123456789",
  "mode": "MANUAL",
  "state": "ON",
  "ttl_s": 60
}
```
*Ghi chú:*
- `request_id`: Chuỗi định danh duy nhất sinh theo timestamp.
- `state`: Bắt buộc là chuỗi in hoa `"ON"` hoặc `"OFF"`.
- `ttl_s`: Thời gian hiệu lực (giây), từ 1 đến 3600. Hết thời gian này firmware tự động hủy override và trở về AUTO.

**Lệnh AUTO (Hủy cưỡng bức, trả về thuật toán tự động):**
```json
{
  "request_id": "req-mist-auto-1729123456790",
  "mode": "AUTO"
}
```

### 3.2. Cấu trúc phản hồi ACK (ESP32 → Node-RED)
Topic nhận: `garden/orchid/orchid-01/ack`

- **Khi lệnh được chấp thuận:**
  ```json
  {"request_id": "req-mist-on-1729123456789", "result": "APPLIED"}
  ```
- **Khi lệnh bị từ chối an toàn (Safety Rejection):**
  ```json
  {"request_id": "req-mist-on-1729123456789", "result": "REJECTED", "reason": "WATER_LOCKOUT"}
  ```
  *(Các mã lỗi reason được firmware hỗ trợ: `WATER_LOCKOUT`, `MIST_COOLDOWN`, `INVALID_MODE`, `INVALID_STATE`, `INVALID_TTL`).*

Node-RED phân tích `result`, ghi log lịch sử và hiển thị cảnh báo tương ứng trên Dashboard/Telegram.

---

## 4. Tích hợp Cảnh báo & Bảo mật Telegram Bot

### 4.1. Quy tắc phát hiện cảnh báo
1. **Mực nước thấp (Water Low):**
   - Điều kiện: `water_adc < 1200` (theo ngưỡng `Thresholds::waterLowAdc = 1200`).
   - Cảnh báo: `CRITICAL` - Khóa bơm, báo người dùng châm thêm nước vào bình chứa.
2. **Nhiệt độ cao (High Temperature):**
   - Điều kiện: `temperature_c >= 33.0°C` (ngưỡng `Thresholds::fanTemperatureOn`).
   - Cảnh báo: `HIGH` - Khuyến nghị bật quạt hoặc hạ nhiệt nhà màng. Có bộ lọc debounce 5 phút tránh spam.
3. **Thiết bị mất kết nối (Device Offline):**
   - Điều kiện 1: Nhận Last Will (`offline`) từ Broker hoặc không nhận telemetry quá 15s (`TELEMETRY_STALE`).
   - Điều kiện 2: Thiết bị mất kết nối liên tục > 5 phút (`OFFLINE_5MIN`) -> Bắn báo động khẩn cấp.

### 4.2. Thiết kế bảo mật Telegram Bot
- **Không để lộ Token:**
  Node-RED đọc token qua:
  `env.get("TELEGRAM_BOT_TOKEN") || flow.get("telegram_token")`
  Trong file `orchid-flow.json` chia sẻ lên Git, token được để ở dạng biến môi trường hoặc placeholder `YOUR_TELEGRAM_BOT_TOKEN_HERE`, đảm bảo không bị lộ token bot khi nộp bài.
- **Whitelist Chat ID:**
  Node-RED kiểm tra nghiêm ngặt `chat_id` đích. Chỉ chấp nhận ID nhóm đã được cấp phép:
  `const authorizedChatId = env.get("TELEGRAM_GROUP_CHAT_ID") || "-1001234567890";`
  Nếu có tin nhắn hoặc lệnh từ cá nhân/nhóm lạ, hệ thống lập tức drop và ghi log cảnh báo.

### 4.3. Cách cấu hình nhanh Telegram Bot cho nhóm:
1. Nhắn tin cho `@BotFather` trên Telegram để tạo bot mới, lấy `API_TOKEN`.
2. Tạo nhóm chat của team, add bot vào nhóm.
3. Lấy `Group Chat ID` (thường bắt đầu bằng dấu trừ, ví dụ `-100xxxxxxxxxx`).
4. Khi chạy Node-RED, thiết lập biến môi trường trước khi khởi động:
   ```powershell
   $env:TELEGRAM_BOT_TOKEN = "your_bot_token_here"
   $env:TELEGRAM_GROUP_CHAT_ID = "-100xxxxxxxxxx"
   node-red
   ```
   Hoặc cấu hình trực tiếp trong Function node `Telegram Whitelist & Token Security`.

---

## 5. Hướng dẫn Bảo vệ Dashboard Node-RED (Authentication)

> [!IMPORTANT]
> **Lưu ý bảo mật quan trọng:** Việc cấu hình xác thực cho Flow Editor (`adminAuth`) **KHÔNG** tự động bảo vệ Dashboard UI (`/ui`). Nếu chỉ bật adminAuth, bất kỳ ai có link `http://<ip>:1880/ui` vẫn có thể xem và điều khiển vườn lan. Cần bật cả xác thực cho HTTP Node.

### Cách cấu hình trong file `settings.js` của Node-RED:
Mở file `settings.js` (thường nằm tại `C:\Users\<User>\.node-red\settings.js`):

1. **Bảo vệ Flow Editor:**
   Bỏ comment mục `adminAuth` và tạo tài khoản quản trị:
   ```javascript
   adminAuth: {
       type: "credentials",
       users: [{
           username: "orchid_admin",
           password: "$2b$08$...password_hash...", // Tạo bằng lệnh: node-red-admin hash-pw
           permissions: "*"
       }]
   },
   ```

2. **Bảo vệ Dashboard và API (`/ui`):**
   Kích hoạt mục `httpNodeAuth` để mọi truy cập vào Dashboard đều phải đăng nhập:
   ```javascript
   httpNodeAuth: {
       user: "operator",
       pass: "$2b$08$...operator_hash..."
   },
   ```
3. Lưu file và khởi động lại Node-RED. Khi truy cập vào Dashboard hoặc Editor, hệ thống đều sẽ yêu cầu xác thực bằng tài khoản và mật khẩu.

---

## 6. Bằng chứng Thực nghiệm End-to-End (Logs & Verification)

### Trích xuất Log Giao tiếp Thực tế (E2E Test Trace):
```text
[MQTT] ESP32 Connected to broker.emqx.io:1883
[MQTT] Subscribed to garden/orchid/orchid-01/cmd/#
[TELEMETRY] Published: {"temperature_c":29.4,"humidity_pct":68.2,"light_adc":1650,"water_adc":1820}
[NODE-RED] Processed telemetry: Flow context updated, Telemetry watch refreshed.

[DOWNLINK] Node-RED sent command to garden/orchid/orchid-01/cmd/fan:
           {"request_id":"req-fan-on-1729123510","mode":"MANUAL","state":"ON","ttl_s":60}
[ESP32] MQTT command req-fan-on-1729123510: mode=MANUAL state=ON ttl_s=60
[ESP32] Publishing ACK to garden/orchid/orchid-01/ack:
        {"request_id":"req-fan-on-1729123510","result":"APPLIED"}
[ESP32] Publishing state: {"mist":"OFF","fan":"ON","light":"OFF","mist_state":"IDLE","water_lockout":false,"mode":"MANUAL"}
[NODE-RED] Received ACK: req-fan-on-1729123510 -> APPLIED (Status: SUCCESS)
[NODE-RED] State updated: Fan is ON (MANUAL override active).
```

### Bằng chứng Cảnh báo Nước thấp & Khóa an toàn:
```text
[TELEMETRY] Sensor update: water_adc = 950 (< 1200)
[NODE-RED] ALERT TRIGGERED: [WATER_LOW] CRITICAL - Mực nước bình chứa đang ở mức THẤP (ADC: 950 < 1200)!
[DISPATCHER] Dispatched to Dashboard Debug & Telegram API
[TELEGRAM] Bot sent to Chat ID -100xxxxxxxxxx:
           🌿 [ORCHID SMART SYSTEM]
           🚨 CẢNH BÁO CẠN NƯỚC
           ⚠️ Mức độ: CRITICAL
           📝 Mực nước bình chứa đang ở mức THẤP (ADC: 950 < 1200)! Phun sương bị khóa an toàn (WATER_LOCKOUT).
```

**Bàn giao Tuần 6:** Hoàn tất file flow [orchid-flow.json](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/nodered/orchid-flow.json), bộ script kiểm thử và báo cáo đầy đủ.
