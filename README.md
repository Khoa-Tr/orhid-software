# 🌸 OrchidSense Pro — Hệ Thống Tự Động Hóa Vi Khí Hậu & Phun Sương Vườn Lan Thông Minh

![Build Status](https://img.shields.io/badge/Build-SUCCESS-emerald?style=for-the-badge&logo=platformio)
![Hardware](https://img.shields.io/badge/Hardware-ESP32%20DevKit%20V1-blue?style=for-the-badge&logo=espressif)
![Protocol](https://img.shields.io/badge/Protocol-MQTT%20%7C%20WSS-purple?style=for-the-badge&logo=mqtt)
![Dashboard](https://img.shields.io/badge/Dashboard-Node--RED%20%2B%20Custom%20Web-orange?style=for-the-badge&logo=node-red)
![Theme](https://img.shields.io/badge/Theme-Dark%20%2F%20Botanical%20Orchid%20Gradient-magenta?style=for-the-badge)

---

## 📋 Mục Lục (Table of Contents)
- [1. Giới thiệu dự án](#1-giới-thiệu-dự-án)
- [2. Kiến trúc tổng thể 4 tầng](#2-kiến-trúc-tổng-thể-4-tầng)
- [3. Phần cứng & Sơ đồ đấu nối](#3-phần-cứng--sơ-đồ-đấu-nối)
- [4. Giải thuật FSM & Luật điều khiển](#4-giải-thuật-fsm--luật-điều-khiển)
- [5. Bảng đặc tả giao thức MQTT](#5-bảng-đặc-tả-giao-thức-mqtt)
- [6. Hướng dẫn cài đặt & Chạy mô phỏng Wokwi](#6-hướng-dẫn-cài-đặt--chạy-mô-phỏng-wokwi)
- [7. Giao diện Web Dashboard độc quyền](#7-giao-diện-web-dashboard-độc-quyền)
- [8. Danh mục tài liệu tham khảo](#8-danh-mục-tài-liệu-tham-khảo)

---

## 🎯 1. Giới Thiệu Dự Án

Phong lan là loài thực vật cảnh có giá trị kinh tế cao nhưng cực kỳ nhạy cảm với vi khí hậu:
- **Độ ẩm không khí** thiếu hụt (< 65%) làm teo giả hành và rụng nụ; độ ẩm quá cao liên tục (> 85%) kết hợp không khí tù đọng gây thối nhũn do nấm khuẩn.
- **Nhiệt độ** quá cao (> 33°C) làm cháy lá và ức chế quang hợp.
- **Ánh sáng** cần duy trì quang kỳ ổn định vào mùa mưa hoặc ban đêm.
- **Bơm nước** nếu chạy lúc cạn bồn sẽ cháy động cơ; nếu phun không kiểm soát sẽ gây ngập úng.

**OrchidSense Pro** giải quyết triệt để các thách thức trên bằng giải pháp IoT công nghiệp:
- Điều khiển tự động **Bơm phun sương, Quạt thông gió đối lưu và Đèn quang hợp**.
- Thuật toán **FSM 5 cấp** kết hợp khóa an toàn chống cạn nước (**Water Lockout**) và cơ chế trễ **Hysteresis**.
- Kết nối hai chiều qua **MQTT**, giám sát và điều khiển thời gian thực trên cả **Node-RED** và **Web Dashboard cao cấp**.

---

## 🏗️ 2. Kiến Trúc Tổng Thể 4 Tầng (System Architecture)

```
┌────────────────────────────────────────────────────────────────────────┐
│                   TẦNG 1: THIẾT BỊ IoT PHẦN CỨNG                       │
│  ESP32 DevKit V1 ──► Cảm biến: DHT22, LDR (GPIO34), Nước bồn (GPIO35)  │
│                   ──► Cơ cấu: Relay Bơm (D25), Quạt (D26), Đèn (D27)   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Wi-Fi / MQTT (JSON Telemetry & State)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   TẦNG 2: TRUNG TÂM BROKER MQTT                        │
│            broker.emqx.io (TCP: 1883 | Secure WebSocket: 8084)          │
│       Topics: garden/orchid/orchid-01/{telemetry, state, cmd, ack}     │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
                    ▼                                ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│       TẦNG 3: GATEWAY NODE-RED       │  │   TẦNG 4: WEB DASHBOARD PRO  │
│  - Xử lý nghiệp vụ & Lịch sử JSONL   │  │  - Web HTML5/Tailwind/WSS    │
│  - Dispatcher cảnh báo Telegram Bot  │  │  - Theme Sáng (Lan) & Tối    │
│  - Watchdog giám sát mất kết nối     │  │  - Biểu đồ Chart.js Realtime │
└──────────────────────────────────────┘  └──────────────────────────────┘
```

---

## 🔌 3. Phần Cứng & Sơ Đồ Đấu Nối

### Bảng phân bổ chân GPIO (ESP32 DevKit V1):
| Tên Linh Kiện | Chân Module | Chân ESP32 | Loại Tín Hiệu | Mục Đích |
| :--- | :--- | :--- | :--- | :--- |
| **DHT22** | DATA | `GPIO15` | Digital I/O (Trở kéo 10k) | Đo nhiệt độ (°C) và độ ẩm (% RH) |
| **LDR Quang Trở** | VOUT | `GPIO34` | Analog (ADC1_CH6) | Đo cường độ sáng (Tối: >2200, Sáng: <1800) |
| **Phao / Chiết Áp Nước**| WIPER | `GPIO35` | Analog (ADC1_CH7) | Đo mực nước bồn (Khóa cạn: <1200, Phục hồi: ≥1500)|
| **Relay 1: Bơm Sương** | IN1 | `GPIO25` | Digital Out (Active LOW) | Đóng ngắt máy bơm phun sương |
| **Relay 2: Quạt Gió** | IN2 | `GPIO26` | Digital Out (Active LOW) | Đóng ngắt quạt thông gió giải nhiệt |
| **Relay 3: Đèn Quang Hợp**| IN3 | `GPIO27` | Digital Out (Active LOW) | Đóng ngắt đèn LED quang hợp ban đêm |

*Chi tiết sơ đồ đấu nối: Xem file [WIRING_DIAGRAM.md](WIRING_DIAGRAM.md).*

---

## ⚙️ 4. Giải Thuật FSM & Luật Điều Khiển

Firmware quản lý máy bơm phun sương qua **Máy Trạng Thái Hữu Hạn FSM 5 trạng thái**:
1. **`IDLE`**: Bơm nghỉ chờ. Độ ẩm < 65% và đủ nước chuyển sang `RUNNING`.
2. **`RUNNING`**: Đang phun sương. Phun tối đa 15s hoặc dừng sớm khi độ ẩm đạt 80%.
3. **`COOLDOWN`**: Hạ nhiệt bắt buộc. Nghỉ tối thiểu 10s trước chu kỳ mới.
4. **`WATER_LOCKOUT`**: Khóa an toàn cạn nước. Kích hoạt khi ADC < 1200; mở khóa khi ADC ≥ 1500.
5. **`SENSOR_FAULT`**: Khóa an toàn khi lỗi đọc DHT22 liên tiếp ≥ 3 lần.

*Chi tiết cấu trúc thuật toán: Xem file [CODE_STRUCTURE.md](CODE_STRUCTURE.md).*

---

## 📡 5. Bảng Đặc Tả Giao Thức MQTT

Tất cả các tin nhắn sử dụng tiền tố: `garden/orchid/orchid-01/`

| Hướng Truyền | Hậu Tố Topic | Định Dạng Dữ Liệu | Ví Dụ Payload |
| :--- | :--- | :--- | :--- |
| **Uplink** | `/telemetry` | JSON định kỳ 5s | `{"temperature_c":28.5,"humidity_pct":72.0,"light_adc":1650,"water_adc":2400}` |
| **Uplink** | `/state` | JSON trạng thái | `{"mist":"OFF","fan":"OFF","light":"OFF","mist_state":"IDLE","mode":"AUTO"}` |
| **Uplink** | `/availability` | Chuỗi ký tự (LWT) | `online` hoặc `offline` |
| **Uplink** | `/ack` | JSON phản hồi lệnh | `{"request_id":"req-123","result":"APPLIED","reason":""}` |
| **Downlink** | `/cmd/mist` | Lệnh điều khiển bơm | `{"request_id":"cmd-1","mode":"MANUAL","state":"ON","ttl_s":60}` |
| **Downlink** | `/cmd/fan` | Lệnh điều khiển quạt | `{"request_id":"cmd-2","mode":"MANUAL","state":"ON","ttl_s":300}` |
| **Downlink** | `/cmd/light` | Lệnh điều khiển đèn | `{"request_id":"cmd-3","mode":"AUTO"}` |

---

## 🚀 6. Hướng Dẫn Cài Đặt & Chạy Mô Phỏng Wokwi

### Bước 1: Biên dịch Firmware
```bash
pio run -e esp32dev
```

### Bước 2: Khởi động mô phỏng trong VS Code
1. Mở file `diagram.json`.
2. Nhấn `Ctrl + Shift + P` → chọn **`Wokwi: Start Simulator`**.
3. ESP32 sẽ tự động kết nối Wi-Fi `Wokwi-GUEST` và đồng bộ dữ liệu lên Broker.

*Chi tiết kịch bản test: Xem file [WOKWI_GUIDE.md](WOKWI_GUIDE.md).*

---

## 🎨 7. Giao Diện Web Dashboard Độc Quyền (OrchidSense Pro)

Truy cập: 👉 **[http://localhost:1880/index.html](http://localhost:1880/index.html)**

- **Nút chuyển đổi Sáng / Tối:**
  - **Chế độ Sáng (Botanical Orchid Gradient):** Phối hợp tinh tế sắc xanh lá phong lan mát mắt (`#10b981`), vàng nhụy hoa (`#facc15`) và tím trắng cánh hoa lan (`#f3e8ff`), nền kính mờ sinh thái cực kỳ sang trọng khi trình chiếu ban ngày.
  - **Chế độ Tối (Cyber Glass):** Tối ưu cho quan sát đêm với các khối phát sáng neon hiển thị trực quan.
- **Biểu đồ thời gian thực (Chart.js):** Theo dõi diễn biến biến thiên nhiệt độ & độ ẩm tự động thích ứng màu sáng/tối.
- **Bảng trực quan hóa FSM:** Hiển thị vị trí trạng thái hiện tại của giải thuật FSM trong firmware ESP32.
- **Nút dừng khẩn cấp E-STOP:** Ngắt cưỡng bức mọi relay phụ tải về vùng an toàn.

---

## 📚 8. Danh Mục Tài Liệu Dự Án

- 🚀 [START_HERE.md](START_HERE.md): Bắt đầu nhanh trong 5 phút.
- ⚡ [QUICKSTART.md](QUICKSTART.md): Hướng dẫn thiết lập môi trường chi tiết.
- 📋 [WIRING_DIAGRAM.md](WIRING_DIAGRAM.md): Sơ đồ nối chân phần cứng.
- 📐 [CODE_STRUCTURE.md](CODE_STRUCTURE.md): Chi tiết cấu trúc code & FSM.
- 🌿 [WOKWI_GUIDE.md](WOKWI_GUIDE.md): Cẩm nang mô phỏng Wokwi.
- 🔄 [DIAGRAM_UPDATE.md](DIAGRAM_UPDATE.md): Nhật ký nâng cấp sơ đồ mạch.
- 🎉 [BUILD_SUMMARY.md](BUILD_SUMMARY.md): Báo cáo biên dịch firmware.
- 🔄 [RELOAD_INSTRUCTIONS.md](RELOAD_INSTRUCTIONS.md): Hướng dẫn nạp lại code & khắc phục sự cố.
- ✅ [FINAL_CHECKLIST.md](FINAL_CHECKLIST.md): Bảng kiểm tra tổng duyệt bảo vệ đồ án.
- 📖 [INDEX.md](INDEX.md): Mục lục toàn bộ file trong kho mã nguồn.
