# DÀN Ý SLIDE THUYẾT TRÌNH BẢO VỆ ĐỒ ÁN (TUẦN 9)
**Đề tài:** HỆ THỐNG GIÁM SÁT VÀ TỰ ĐỘNG CHĂM SÓC VƯỜN LAN THÔNG MINH QUA GIAO THỨC MQTT VÀ NODE-RED  
**Thời lượng báo cáo dự kiến:** 10 – 12 phút (kèm 2-3 phút demo)  

---

### SLIDE 1: TRANG TIÊU ĐỀ (TITLE SLIDE)
- **Tên đề tài:** Hệ Thống Giám Sát & Tự Động Chăm Sóc Vườn Lan Thông Minh (Orchid-01 Smart Garden)
- **Giảng viên hướng dẫn:** [Tên Giảng Viên]
- **Nhóm sinh viên thực hiện:**
  - Người 1: Firmware ESP32, Lọc tín hiệu, Calibration, Kết nối Wi-Fi & MQTT Uplink
  - Người 2: Node-RED Dashboard, Lưu trữ lịch sử, Điều khiển Downlink & Giao diện
  - Người 3: Cảnh báo Telegram Bot, Ghép luồng End-to-End, Kiểm thử tích hợp & Báo cáo
- **Học kỳ / Năm học:** 2026

---

### SLIDE 2: ĐẶT VẤN ĐỀ & TÍNH CẤP THIẾT
- **Đặc thù cây phong lan:**
  - Rất nhạy cảm với vi khí hậu: đọng nước ban đêm gây thối ngọn, nhiệt độ >33°C gây sốc nhiệt, thiếu ẩm gây teo rễ.
  - Cần pha tối bắt buộc ban đêm để hô hấp (không được chiếu sáng liên tục).
- **Vấn đề của hệ thống truyền thống:**
  - Bật tắt thủ công hoặc hẹn giờ mù (Timer) không quan tâm thời tiết thực tế.
  - Máy bơm dễ cháy khi bồn cạn nước.
- **Giải pháp của đề tài:**
  - Ứng dụng IoT: Kết hợp cảm biến chính xác, cơ chế an toàn phần cứng và tự động hóa thông minh qua Node-RED.

---

### SLIDE 3: KIẾN TRÚC TỔNG THỂ 4 TẦNG (4-LAYER ARCHITECTURE)
*(Chèn sơ đồ khối 4 tầng)*
1. **Tầng 1 (Sensor/Actuator):** ESP32, DHT22, LDR, Mực nước, 3 Relay (Mist, Fan, Light).
2. **Tầng 2 (Truyền thông):** MQTT Broker `broker.emqx.io:1883`, kênh truyền bảo đảm QoS 1.
3. **Tầng 3 (Xử lý & Điều phối):** Node-RED Engine, lưu trữ `orchid-history.jsonl`, Business Rules.
4. **Tầng 4 (Giao diện & Cảnh báo):** Dashboard giám sát thời gian thực & Telegram Bot API.

---

### SLIDE 4: THIẾT KẾ FIRMWARE ESP32 & XỬ LÝ TÍN HIỆU
- **Lọc nhiễu cảm biến:**
  - Bộ lọc trung bình động 5 mẫu (Running Average).
  - Thuật toán loại bỏ xung nhiễu đột biến (Spike Reject).
- **Máy trạng thái hữu hạn cho Bơm (Finite State Machine - FSM):**
  - `IDLE` ➔ `RUNNING` ➔ `COOLDOWN` (Nghỉ làm nguội) ➔ `WATER_LOCKOUT` (Khóa an toàn).
- **Đặc tính kỹ thuật:** Lập trình Non-blocking hoàn toàn, không sử dụng hàm `delay()`.

---

### SLIDE 5: GIAO THỨC TRUYỀN THÔNG MQTT (FROZEN TOPIC MAP)
- **Kênh Uplink (ESP32 ➔ Node-RED):**
  - `/telemetry`: Cảm biến đẩy đều đặn mỗi 2.5s.
  - `/state`: Trạng thái thực tế của 3 relay (Retained).
  - `/availability`: `"online"` & Last Will (LWT) `"offline"`.
- **Kênh Downlink (Node-RED ➔ ESP32):**
  - `/cmd/mist`, `/cmd/fan`, `/cmd/light`: Lệnh điều khiển chuẩn JSON (`request_id`, `mode`, `state`, `ttl_s`).
  - `/ack`: Phản hồi 2 chiều (`APPLIED` / `REJECTED`).

---

### SLIDE 6: GIAO DIỆN NODE-RED DASHBOARD & TELEGRAM BOT
- **Node-RED Dashboard:**
  - Đồng hồ đo (Gauges) nhiệt độ, độ ẩm, độ rọi, mực nước.
  - Biểu đồ lịch sử (Charts) theo dõi biến động môi trường.
  - Cụm nút bấm điều khiển MANUAL có thời hạn và nút chuyển AUTO.
- **Telegram Bot Cảnh báo Tức thời:**
  - Cảnh báo cạn nước khẩn cấp (`WATER_LOW`).
  - Cảnh báo mất kết nối trạm quá 5 phút (`OFFLINE_5MIN`).
  - Bảo mật: Whitelist Chat ID nhóm (chặn 100% người ngoài), ẩn token qua biến môi trường.

---

### SLIDE 7: CƠ CHẾ AN TOÀN CỐT LÕI (FIRMWARE SAFETY INTERLOCKS)
- **Quy tắc vàng:** Firmware nắm quyền an toàn cuối cùng, không tin tưởng mù quáng vào phần mềm cấp cao.
- **Khóa cạn nước (Water Lockout):** ADC < 1200 lập tức cắt bơm, từ chối mọi lệnh bật từ xa với mã `REJECTED: WATER_LOCKOUT`.
- **Hạn giờ lệnh (Command TTL):** Lệnh bật thủ công luôn có thời hạn (`ttl_s: 60`), hết giờ tự động ngắt về AUTO, chống quên hoặc mất mạng.
- **Bảo vệ chống quá nhiệt động cơ:** Giới hạn phun liên tục tối đa 120s, bắt buộc vào Cooldown 60s.

---

### SLIDE 8: CÁC QUY TẮC TỰ ĐỘNG HÓA THÔNG MINH (BUSINESS RULES)
- **Rule 1 — Đèn quang chu kỳ:**
  - Cấm bật đèn ban đêm (21:00 đến 06:00) để đảm bảo pha tối cho lan.
  - Ban ngày chỉ bù sáng khi trời âm u (`light_adc >= 2200`), tự ngắt sau 300s.
- **Rule 2 — Quạt thông gió hỗ trợ sau chu kỳ phun sương (Post-Mist):**
  - Tự động kích hoạt quạt chạy 60 giây ngay khi sương vừa ngắt.
  - Giúp làm ráo các giọt nước đọng trên nõn lá, triệt tiêu nguy cơ nấm khuẩn và thối lá.

---

### SLIDE 9: KIỂM THỬ TÍCH HỢP CỘT MỐC M4 (REPEATABILITY & RECOVERY)
- **Độ ổn định lặp lại (M4 Repeatability):**
  - Chạy lặp lại 5 chu kỳ liên tiếp luồng 2 chiều (Lệnh ➔ ESP32 bật relay ➔ ACK phản hồi).
  - Kết quả: **5/5 chu kỳ thành công 100%**, thời gian phản hồi trung bình 0.74s.
- **Khả năng chịu lỗi & Tự phục hồi (Fault Injection & Recovery):**
  - Cắt mạng đột ngột: Broker phát hiện và phát LWT `offline`.
  - Phục hồi mạng: ESP32 kết nối lại non-blocking, tự động đồng bộ lại `state` và `telemetry`.

---

### SLIDE 10: TỔNG HỢP KẾT QUẢ KIỂM ĐỊNH (SYSTEM TEST RESULTS)
*(Chèn bảng tổng kết M1 -> M4)*
- **M1 (Cảm biến & Bộ lọc):** [PASS] Lọc trơn 5 mẫu, Spike reject hoạt động tốt.
- **M2 (MQTT Uplink):** [PASS] Chu kỳ 2.5s ổn định, đúng định dạng JSON.
- **M3 (MQTT Downlink & ACK):** [PASS] Nhận lệnh, bật relay, phản hồi ACK chuẩn.
- **M4 (E2E & Tự phục hồi):** [PASS] Đạt độ lặp lại và đồng bộ trạng thái sau đứt mạng.

---

### SLIDE 11: ĐÁNH GIÁ, HẠN CHẾ & HƯỚNG PHÁT TRIỂN
- **Ưu điểm nổi bật:**
  - Hoạt động ổn định, bảo vệ phần cứng đa tầng.
  - Giao diện thân thiện, cảnh báo thời gian thực về điện thoại qua Telegram.
- **Hạn chế:** Broker công cộng EMQX có độ trễ dao động phụ thuộc đường truyền Internet.
- **Hướng phát triển:** Triển khai Mosquitto Broker nội bộ kèm SSL/TLS; tích hợp camera AI nhận diện bệnh hại lan.

---

### SLIDE 12: VIDEO DEMO & HỎI ĐÁP (Q&A)
- **Trình chiếu video demo 2–3 phút:** Minh họa trọn vẹn luồng 2 chiều, tình huống cạn nước và tự động hóa quạt sau phun sương.
- **Hội đồng hỏi đáp (Q&A):** Nhóm sẵn sàng lắng nghe và giải đáp các câu hỏi từ Thầy/Cô.
- **Lời cảm ơn:** Chân thành cảm ơn Quý Thầy/Cô và các bạn đã theo dõi!
