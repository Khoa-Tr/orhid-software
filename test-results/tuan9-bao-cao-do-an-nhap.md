# BÁO CÁO TỔNG KẾT ĐỒ ÁN (BẢN NHÁP HOÀN THIỆN - TUẦN 9)
**Đề tài:** HỆ THỐNG GIÁM SÁT VÀ TỰ ĐỘNG CHĂM SÓC VƯỜN LAN THÔNG MINH QUA GIAO THỨC MQTT VÀ NODE-RED  
**Mã dự án:** Orchid-01 Smart Garden  
**Nhóm sinh viên thực hiện:**
- **Người 1:** Firmware ESP32, Bộ lọc tín hiệu, Calibration, Kết nối Wi-Fi/MQTT Uplink.
- **Người 2:** Node-RED Dashboard, Lưu lịch sử sự kiện, Điều khiển Downlink & Giao diện.
- **Người 3:** Cảnh báo đa kênh (Telegram Bot), Ghép luồng End-to-End, Kiểm thử tích hợp (M1-M4) & Báo cáo.

---

## MỤC LỤC
1. GIỚI THIỆU ĐỀ TÀI & TÍNH CẤP THIẾT
2. KIẾN TRÚC TỔNG THỂ HỆ THỐNG 4 TẦNG
3. THIẾT KẾ TẦNG THIẾT BỊ (FIRMWARE ESP32 & FSM)
4. THIẾT KẾ TẦNG TRUYỀN THÔNG (MQTT TOPIC & PAYLOAD MAP)
5. THIẾT KẾ TẦNG ĐIỀU KHIỂN & ỨNG DỤNG (NODE-RED & TELEGRAM BOT)
6. CÁC QUY TẮC TỰ ĐỘNG HÓA (BUSINESS RULES) & KHÓA AN TOÀN (INTERLOCKS)
7. TỔNG HỢP KẾT QUẢ KIỂM THỬ HỆ THỐNG (SYSTEM TEST RESULTS M1 – M4)
8. ĐÁNH GIÁ, HẠN CHẾ & HƯỚNG PHÁT TRIỂN
9. KẾT LUẬN & TÀI LIỆU THAM KHẢO

---

## 1. GIỚI THIỆU ĐỀ TÀI & TÍNH CẤP THIẾT
Hoa lan là nhóm cây cảnh có giá trị kinh tế cao nhưng đòi hỏi điều kiện vi khí hậu cực kỳ khắt khe:
- **Độ ẩm và nước:** Lan cần độ ẩm từ 65% - 80%. Tuy nhiên, nếu đọng nước trên kẽ lá qua đêm trong điều kiện nhiệt độ thấp sẽ dẫn đến thối nõn (Crown Rot) và nấm khuẩn tàn phá cây.
- **Ánh sáng:** Lan cần quang chu kỳ có khoảng tối sinh học bắt buộc (8-10 tiếng) để hô hấp và tích lũy chất hữu cơ; không được bật đèn xuyên đêm.
- **Nhiệt độ:** Khi nhiệt độ vượt quá 33°C, cây rơi vào trạng thái sốc nhiệt, thoát hơi nước nhanh gây teo giả hành.
- **Bảo vệ máy bơm:** Khi bồn chứa hết nước, nếu tiếp tục kích hoạt máy bơm sẽ dẫn đến cháy động cơ.

Đề tài nhằm giải quyết triệt để các vấn đề trên thông qua việc ứng dụng công nghệ IoT: Giám sát liên tục các thông số môi trường, tự động hóa chăm sóc thông minh và bảo vệ an toàn phần cứng ở mức cao nhất.

---

## 2. KIẾN TRÚC TỔNG THỂ HỆ THỐNG 4 TẦNG

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │ TẦNG 4: GIAO DIỆN & CẢNH BÁO (APPLICATION & NOTIFICATION LAYER)        │
 │ • Node-RED Dashboard: Đồng hồ đo, biểu đồ lịch sử, nút bấm điều khiển  │
 │ • Telegram Bot API: Bắn cảnh báo khẩn cấp (Cạn nước, Sốt nhiệt, Offline)│
 └───────────────────────────────────▲────────────────────────────────────┘
                                     │
 ┌───────────────────────────────────▼────────────────────────────────────┐
 │ TẦNG 3: ĐIỀU PHỐI & LOGIC DỮ LIỆU (ORCHESTRATION & LOGIC LAYER)        │
 │ • Node-RED Engine: Parse telemetry, lưu orchid-history.jsonl           │
 │ • Business Rules Engine: Lịch chiếu sáng, Quạt sau phun sương          │
 │ • Watchdog Timer: Phát hiện mất kết nối quá 5 phút                     │
 └───────────────────────────────────▲────────────────────────────────────┘
                                     │
 ┌───────────────────────────────────▼────────────────────────────────────┐
 │ TẦNG 2: TRUYỀN THÔNG MẠNG (COMMUNICATION / BROKER LAYER)               │
 │ • Broker MQTT: broker.emqx.io:1883 (QoS 1, Non-blocking, Retain state) │
 │ • Topic Uplink: telemetry, state, availability, ack                    │
 │ • Topic Downlink: cmd/mist, cmd/fan, cmd/light, config                 │
 └───────────────────────────────────▲────────────────────────────────────┘
                                     │
 ┌───────────────────────────────────▼────────────────────────────────────┐
 │ TẦNG 1: THIẾT BỊ ĐO & CHẤP HÀNH (PHYSICAL & FIRMWARE LAYER)            │
 │ • ESP32 DevKit: Lọc trung bình động (5 mẫu), Spike Reject, Hysteresis  │
 │ • Cảm biến: DHT22 (GPIO15), LDR (GPIO34), Mực nước (GPIO35)           │
 │ • Relay Chấp hành: Máy phun sương (GPIO25), Quạt (GPIO26), Đèn (GPIO27) │
 │ • Máy trạng thái an toàn FSM: IDLE ➔ RUNNING ➔ COOLDOWN ➔ LOCKOUT      │
 └────────────────────────────────────────────────────────────────────────┘
```

---

## 3. THIẾT KẾ TẦNG THIẾT BỊ (FIRMWARE ESP32 & FSM)

### 3.1. Thuật toán lọc tín hiệu cảm biến (Tuần 2 & 3)
1. **Loại bỏ bước nhảy đột biến (Spike Rejection):**
   Nếu giá trị đo lệch quá ngưỡng (`maxJump`) so với mẫu trước đó, giá trị sẽ bị từ chối tối đa 3 lần (`maxConsecutiveRejects = 3`) nhằm tránh nhiễu xung điện từ hoặc sốc tín hiệu.
2. **Bộ lọc trung bình động (Running Average):**
   Áp dụng cửa sổ trượt 5 mẫu (`windowSize = 5`) cho nhiệt độ, độ ẩm, độ rọi LDR và mực nước ADC.

### 3.2. Máy trạng thái hữu hạn cho Bơm Phun sương (Mist State Machine)
- `IDLE`: Chờ điều kiện kích hoạt.
- `RUNNING`: Bơm đang hoạt động. Giới hạn thời gian phun tối đa 120s (mô phỏng: 15s).
- `COOLDOWN`: Bắt buộc nghỉ làm nguội động cơ 60s (mô phỏng: 10s) trước khi cho phép phun tiếp.
- `WATER_LOCKOUT`: Khi mực nước ADC < 1200, lập tức cắt bơm và khóa mọi thao tác điều khiển.

---

## 4. THIẾT KẾ TẦNG TRUYỀN THÔNG (MQTT TOPIC & PAYLOAD MAP)

Toàn bộ payload được thống nhất và chốt cứng (Frozen API Contract):

| Tên Topic | Hướng | Format Payload Mẫu | Ý nghĩa |
| :--- | :---: | :--- | :--- |
| `garden/orchid/orchid-01/telemetry` | ESP32 ➔ Broker | `{"temperature_c": 29.5, "humidity_pct": 68.0, "light_adc": 1500, "water_adc": 1800}` | Đo đạc cảm biến định kỳ mỗi 2.5s |
| `garden/orchid/orchid-01/state` | ESP32 ➔ Broker | `{"mist":"OFF", "fan":"ON", "light":"OFF", "mist_state":"IDLE", "water_lockout":false, "mode":"MANUAL"}` | Trạng thái thực tế relay (Retained) |
| `garden/orchid/orchid-01/availability` | ESP32 ➔ Broker | `"online"` hoặc Last Will `"offline"` | Giám sát trạng thái sống của trạm |
| `garden/orchid/orchid-01/cmd/<relay>` | Broker ➔ ESP32 | `{"request_id":"req-01", "mode":"MANUAL", "state":"ON", "ttl_s":60}` hoặc `{"request_id":"req-02", "mode":"AUTO"}` | Lệnh điều khiển từ Node-RED |
| `garden/orchid/orchid-01/ack` | ESP32 ➔ Broker | `{"request_id":"req-01", "result":"APPLIED"}` hoặc `{"request_id":"req-01", "result":"REJECTED", "reason":"WATER_LOCKOUT"}` | Phản hồi xác nhận lệnh hai chiều |

---

## 5. THIẾT KẾ TẦNG ĐIỀU KHIỂN & ỨNG DỤNG (NODE-RED & TELEGRAM BOT)

### 5.1. Cấu trúc Flow Node-RED 6 Tab hoàn chỉnh
- **Tab 1 (Monitor & History):** Nhận feed, parse JSON, ghi file `orchid-history.jsonl`.
- **Tab 2 (Climate & Light):** Logic tự động hóa môi trường.
- **Tab 3 (Water & Mist Rules):** Điều khiển bơm theo ngưỡng độ ẩm.
- **Tab 4 (Dashboard):** Hiển thị trực quan cho người dùng cuối.
- **Tab 5 (Business Rules):** Các quy tắc chăm sóc nâng cao.
- **Tab 6 (Người 3 - Cảnh báo Telegram & Ghép luồng E2E):** Khối lọc bảo mật token, whitelist Group Chat ID và sinh lệnh chuẩn firmware.

### 5.2. Bảo mật Telegram Bot
- Token bot được đọc từ biến môi trường `process.env.TELEGRAM_BOT_TOKEN`, không để lộ trong file flow công khai.
- Whitelist Chat ID: Chỉ tiếp nhận và phản hồi tới duy nhất Chat ID nhóm được cấp phép, loại bỏ 100% người ngoài.

---

## 6. CÁC QUY TẮC TỰ ĐỘNG HÓA (BUSINESS RULES) & KHÓA AN TOÀN

1. **Quy tắc đèn quang chu kỳ (Không xuyên đêm):** Cấm bật đèn từ 21:00 đến 06:00 sáng. Ban ngày chỉ bù sáng khi `light_adc >= 2200` và tự ngắt sau 300s.
2. **Quy tắc quạt sau chu kỳ phun (Post-Mist Ventilation):** Tự động bật quạt 60 giây ngay khi sương vừa ngắt để hong ráo nõn lá.
3. **Khóa liên động cạn nước (Water Lockout):** Firmware là chốt chặn cuối cùng, từ chối mọi lệnh bật bơm khi cạn nước.
4. **Hết hạn lệnh điều khiển (TTL Timeout):** Lệnh MANUAL tự động hoàn nguyên về AUTO sau khi hết thời hạn `ttl_s`.

---

## 7. TỔNG HỢP KẾT QUẢ KIỂM THỬ HỆ THỐNG (M1 – M4)

| Cột mốc | Nội dung kiểm thử | Môi trường | Tiêu chuẩn Đánh giá | Kết quả |
| :---: | :--- | :---: | :--- | :---: |
| **M1** | Đọc cảm biến, bộ lọc trung bình động, Spike Reject | Simulation Wokwi | Dữ liệu mượt mà, triệt tiêu xung nhiễu | **PASS** |
| **M2** | Kết nối Wi-Fi, MQTT Uplink chu kỳ 2.5s | Simulation EMQX | Telemetry & State đẩy đều đặn | **PASS** |
| **M3** | Downlink điều khiển 2 chiều, Phản hồi ACK, Khóa cạn nước | Simulation Wokwi + Node-RED | Nhận đủ ACK APPLIED/REJECTED | **PASS** |
| **M4** | Kiểm thử tích hợp E2E 4 tầng, Độ lặp lại 5 chu kỳ, Mất mạng LWT & Reconnect | Simulation E2E | 5/5 chu kỳ ổn định; LWT & State resync thành công | **PASS** |

---

## 8. ĐÁNH GIÁ, HẠN CHẾ & HƯỚNG PHÁT TRIỂN
- **Ưu điểm:** Hệ thống hoạt động tin cậy, phân định rõ ràng giữa bảo vệ phần cứng (Firmware) và điều phối cấp cao (Node-RED).
- **Hạn chế:** Broker công cộng EMQX đôi khi bị trễ mạng do nghẽn băng thông quốc tế.
- **Hướng phát triển:** Triển khai Mosquitto Broker nội bộ có chứng chỉ SSL/TLS, tích hợp camera AI nhận diện bệnh lá lan.

---

## 9. KẾT LUẬN
Đồ án đã hoàn thành xuất sắc tất cả các mục tiêu đề ra từ Tuần 1 đến Tuần 9, thỏa mãn toàn bộ tiêu chí nghiệm thu của 4 cột mốc (M1 -> M4). Hệ thống sẵn sàng cho buổi bảo vệ cuối khóa.
