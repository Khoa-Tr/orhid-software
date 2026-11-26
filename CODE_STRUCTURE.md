# 📐 Kiến Trúc Code & Giải Thuật Firmware — OrchidSense Pro

## 🎯 1. Sơ Đồ Kiến Trúc Hệ Thống (Software Architecture)

Firmware của hệ thống được lập trình theo mô hình **Non-blocking Event-driven + Finite State Machine (FSM)** kết hợp bộ hẹn giờ đa nhiệm phần mềm `millis()`, đảm bảo ESP32 xử lý song song đọc cảm biến, tính toán luật điều khiển, duy trì kết nối mạng MQTT và nhận lệnh điều khiển thời gian thực mà không bao giờ bị nghẽn (zero `delay()`).

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MAIN EXECUTION LOOP (loop())                    │
├────────────────────────────────────────────────────────────────────────┤
│  1. mqttClient.loop()        ← Duy trì kết nối MQTT, nhận Downlink CMD │
│  2. checkWifiAndMqtt()       ← Tự động tái kết nối nếu rớt mạng      │
│  3. readSensors() (2000ms)   ← Đọc DHT22, LDR, Mực nước (ADC1)         │
│  4. updateFSM_Mist()         ← Máy trạng thái FSM 5 cấp điều khiển bơm │
│  5. updateLogic_Fan()        ← Kiểm tra Hysteresis nhiệt/ẩm cho quạt  │
│  6. updateLogic_Light()      ← Kiểm tra ngưỡng quang kỳ cho đèn       │
│  7. checkManualTTL()         ← Đếm lùi thời gian can thiệp tay (TTL)   │
│  8. publishTelemetry() (5s)  ← Đóng gói JSON gửi dữ liệu lên Broker   │
│  9. publishStateIfChanged()  ← Báo cáo trạng thái Relay ngay lập tức   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## ⚙️ 2. Máy Trạng Thái Hữu Hạn FSM (Finite State Machine) — Bơm Phun Sương

Bơm phun sương là cơ cấu chấp hành quan trọng nhất trong vườn lan, đòi hỏi quy trình khắt khe để vừa duy trì độ ẩm tối ưu (65% – 80%), vừa bảo vệ tuổi thọ động cơ bơm và tránh thối rễ lan do úng nước.

```
       ┌───────────────────────────────┐
       │   WATER_LOCKOUT (Khóa Cạn)    │
       │     (Mực nước ADC < 1200)     │
       └──────────────┬────────────────┘
          ▲ Mực nước  │ Nước đầy lại
            cạn kiệt  ▼ (ADC ≥ 1500)
       ┌───────────────────────────────┐  Lỗi DHT22 ≥ 3 lần  ┌───────────────────────────────┐
       │          IDLE                 ├────────────────────>│    SENSOR_FAULT (Lỗi DHT)     │
       │   (Nghỉ chờ độ ẩm < 65%)     │<────────────────────┤     (Khóa bơm an toàn)        │
       └──────────────┬────────────────┘    DHT đọc lại OK   └───────────────────────────────┘
                      │ Độ ẩm < 65%
                      ▼ & Đủ nước (ADC ≥ 1500)
       ┌───────────────────────────────┐
       │         RUNNING               │
       │ (Phun sương tối đa 15s/120s)  │
       └──────────────┬────────────────┘
                      │ Hết thời gian phun
                      ▼ hoặc Độ ẩm ≥ 80%
       ┌───────────────────────────────┐
       │         COOLDOWN              │
       │   (Hạ nhiệt nghỉ 10s/60s)     │
       └──────────────┬────────────────┘
                      │ Hết thời gian hạ nhiệt
                      └───────> Quay lại IDLE
```

### Chi tiết 5 trạng thái:
1. **`IDLE` (Nghỉ chờ):** Bơm tắt. ESP32 liên tục giám sát độ ẩm. Nếu độ ẩm giảm xuống dưới 65% và bồn nước an toàn, hệ thống chuyển sang `RUNNING`.
2. **`RUNNING` (Đang phun):** Bơm bật. Thời gian phun được giới hạn an toàn (tối đa 15s ở chế độ tự động, hoặc theo thời lượng TTL khi can thiệp tay). Nếu độ ẩm đạt mức bão hòa 80%, bơm dừng sớm để tiết kiệm nước.
3. **`COOLDOWN` (Nghỉ bắt buộc / Hạ nhiệt):** Bơm tắt tối thiểu 10s để nước thẩm thấu vào giá thể và động cơ bơm không bị quá nhiệt trước khi cho phép chu kỳ mới.
4. **`WATER_LOCKOUT` (Khóa cạn nước an toàn):** Khi cảm biến bồn báo ADC < 1200, FSM cưỡng bức chuyển sang trạng thái này ngay lập tức, ngắt bơm và phát cảnh báo Telegram/Web. Bơm chỉ được mở khóa khi bồn được châm nước đầy đạt ngưỡng phục hồi ADC ≥ 1500 (Cơ chế Hysteresis chống rung chu kỳ).
5. **`SENSOR_FAULT` (Bảo vệ lỗi cảm biến):** Nếu đọc cảm biến DHT22 thất bại liên tiếp ≥ 3 chu kỳ (`dht_fail_streak >= 3`), FSM khóa bơm để tránh trường hợp mất tín hiệu cảm biến dẫn đến việc bơm phun tràn ngập vườn.

---

## 🌬️ 3. Giải Thuật Điều Khiển Quạt Gió & Đèn Quang Hợp

### 3.1. Quạt Thông Gió (Fan Assist)
- **Kích hoạt tự động theo nhiệt độ (Hysteresis):**
  - **BẬT QUẠT:** Khi nhiệt độ môi trường vượt quá **33.0°C**.
  - **TẮT QUẠT:** Khi nhiệt độ hạ xuống dưới **31.0°C** (khoảng trễ 2°C chống bật/tắt liên tục làm hỏng rơ-le).
- **Kích hoạt phòng nấm mốc (Post-Mist Ventilate):** Sau khi máy phun sương hoàn tất chu kỳ phun, quạt được tự động bật trong 60 giây để tạo luồng đối lưu nhẹ, làm ráo đọng giọt trên kẽ lá lan, triệt tiêu nguy cơ úng nhũn lá.

### 3.2. Đèn Quang Hợp (Grow Light)
- **Kích hoạt theo cường độ sáng (LDR):**
  - **BẬT ĐÈN:** Khi trời tối (ADC quang trở **> 2200**).
  - **TẮT ĐÈN:** Khi bình minh hoặc đủ sáng tự nhiên (ADC **< 1800**).
- **Giới hạn an toàn:** Không chiếu sáng liên tục quá 4 giờ mỗi đêm để cây lan có chu kỳ hô hấp tự nhiên ban đêm.

---

## 📨 4. Cơ Chế Xử Lý Lệnh Điều Khiển Downlink (Command Gateway)

Hệ thống hỗ trợ 3 chế độ vận hành: **`AUTO` (Tự động)**, **`MANUAL` (Thủ công có thời hạn)**, và **`E-STOP` (Dừng khẩn cấp)**.

### Định dạng gói lệnh JSON Downlink:
```json
{
  "request_id": "req-17928",
  "mode": "MANUAL",
  "state": "ON",
  "ttl_s": 60
}
```

### Quy trình tiếp nhận lệnh trong `handleMqttCommand()`:
```
Nhận tin nhắn MQTT Downlink
         │
         ▼
Deserialize JSON bằng ArduinoJson
         │
         ├─► Kiểm tra "mode":
         │     ├─► "AUTO": Hủy bỏ cờ can thiệp tay, trả quyền điều khiển cho FSM
         │     │
         │     └─► "MANUAL":
         │           ├─► Gán trạng thái relay (ON / OFF)
         │           ├─► Gán thời gian hiệu lực: expireTime = millis() + (ttl_s * 1000)
         │           └─► Đặt cờ override đang hoạt động
         │
         ▼
Gửi gói ACK xác nhận về Topic ".../ack"
{
  "request_id": "req-17928",
  "result": "APPLIED",
  "device_id": "orchid-01"
}
```
*Cơ chế Safety Watchdog (TTL Expiry):* Trong `loop()`, hàm `checkManualTTL()` liên tục kiểm tra thời gian. Khi hết số giây `ttl_s` quy định, firmware **tự động thu hồi quyền thủ công và trả relay về chế độ `AUTO`**, ngăn chặn hoàn toàn việc người dùng quên tắt thiết bị.
