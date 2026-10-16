# Kế hoạch Kiểm thử (Test Plan) - MQTT Uplink & Downlink

## 1. Mục đích
Xác nhận hệ thống ESP32 và Node-RED giao tiếp 2 chiều thành công qua MQTT broker, hỗ trợ đầy đủ các bản tin telemetry, state, availability và command.

## 2. Rà soát Topic & Payload (Cùng Người 1)

### 2.1 Uplink (ESP32 -> Broker -> Node-RED)
- **Telemetry:** `garden/orchid/orchid-01/telemetry`
  - Payload: `{"temperature": 28.5, "humidity": 65.0, "soilMoisture": 45.0, "waterLevel": 80.0, "lux": 15000}`
- **State:** `garden/orchid/orchid-01/state`
  - Payload: `{"mist": true, "fan": false, "light": false}`
- **Availability:** `garden/orchid/orchid-01/availability`
  - Payload: `"online"` hoặc `"offline"` (LWT)
- **ACK:** `garden/orchid/orchid-01/ack`
  - Payload: `{"cmd": "mist", "status": "success", "mode": "MANUAL", "msg": "..."}`

### 2.2 Downlink (Node-RED -> Broker -> ESP32)
- **Commands:** `garden/orchid/orchid-01/cmd/mist` (và `fan`, `light`)
  - Payload (AUTO): `{"mode": "AUTO"}`
  - Payload (MANUAL): `{"mode": "MANUAL", "state": true, "duration": 3600}` (Bật 3600 giây)

## 3. Các kịch bản kiểm thử (Test Scenarios)

### Kịch bản 1: Uplink Telemetry & State
- **Thao tác:** Khởi động ESP32, thay đổi giá trị cảm biến trên Wokwi.
- **Kỳ vọng:** Node-RED nhận được message telemetry và state cập nhật, dashboard/debug in ra log lịch sử bình thường.

### Kịch bản 2: Downlink Command - Bật/Tắt Relay
- **Thao tác:** Từ Node-RED, gửi lệnh MANUAL (bật `mist` 3600s).
- **Kỳ vọng:** ESP32 nhận lệnh, relay mist chuyển sang ON, ESP32 gửi lại bản tin `ack` là success, topic `state` cập nhật `"mist": true`.

### Kịch bản 3: Hết hạn lệnh (Command Expiration)
- **Thao tác:** Gửi lệnh MANUAL cho `fan` với `duration: 10` (10 giây).
- **Kỳ vọng:** Fan bật lên. Sau 10 giây, Fan tự động tắt và ESP32 gửi `state` cập nhật.

### Kịch bản 4: Chuyển về chế độ AUTO
- **Thao tác:** Đang ở chế độ MANUAL (Fan ON), gửi lệnh `{"mode": "AUTO"}` cho `fan`.
- **Kỳ vọng:** ESP32 tiếp nhận, ACK success, và hệ thống tự động đánh giá lại cảm biến để quyết định trạng thái Fan.

### Kịch bản 5: Water Lockout
- **Thao tác:** Kéo mức nước (Water Level) xuống 0%. Gửi lệnh MANUAL bật `mist`.
- **Kỳ vọng:** ESP32 từ chối thực hiện lệnh (không bật relay), gửi `ack` với `status: "error"` và lý do "water empty".

### Kịch bản 6: Tính năng Availability & Automation Alert
- **Thao tác:** Tắt ESP32 (Stop simulation). Đợi 5 phút.
- **Kỳ vọng:** Broker publish Last Will `offline`. Node-RED ghi nhận `offline`, và sau 5 phút gửi ra cảnh báo "WARNING: Device has been offline for over 5 minutes!".

