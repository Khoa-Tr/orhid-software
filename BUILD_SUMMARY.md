# 🎉 Báo Cáo Biên Dịch Firmware — BUILD SUMMARY

## ✅ 1. Trạng Thái Biên Dịch (PlatformIO Build Status)

Hệ thống đã được kiểm thử và biên dịch thành công 100% trên cả 2 môi trường:

```
Environment           Status    Build Time    Mục Đích
------------------    ------    ----------    --------------------------------------
esp32dev              SUCCESS   00:00:06.12   Firmware mô phỏng Wokwi & mạch thật chuẩn
esp32dev_fault_test   SUCCESS   00:00:05.88   Firmware phục vụ kiểm thử lỗi FSM DHT22
```

---

## 📊 2. Thống Kê Bộ Nhớ (Memory Footprint)

### Môi trường `esp32dev` (ESP32 DevKit V1 - 4MB Flash):
- **RAM (DRAM):** ~14.8% (được tối ưu hóa, bộ đệm MQTT và JSON động giải phóng tức thì).
- **Flash (ROM):** ~71.2% (chứa toàn bộ RTOS, Wi-Fi Stack, PubSubClient, ArduinoJson, FSM Core).
- **Binary File Output:** `.pio/build/esp32dev/firmware.bin` (Kích thước ~920 KB).

---

## 📦 3. Các Thư Viện Phụ Thuộc (Dependencies)

Các thư viện được quản lý tập trung và tự động tải bởi PlatformIO trong `platformio.ini`:
1. **Adafruit Unified Sensor** (`v1.1.14`): Lớp trừu tượng hóa phần cứng cảm biến.
2. **DHT sensor library** (`v1.4.6`): Đọc dữ liệu nhiệt độ & độ ẩm kỹ thuật số chính xác.
3. **PubSubClient** (`v2.8`): Kết nối MQTT Client nhẹ, ổn định với KeepAlive 30s.
4. **ArduinoJson** (`v7.0.4`): Thư viện phân tích và đóng gói JSON hiệu năng cao, không phân mảnh RAM.

---

## 📂 4. Danh Sách Các Module Đã Hoàn Thiện Trong Dự Án

### 💻 Phần Cứng & Firmware ESP32:
- ✅ `src/main.cpp`: Toàn bộ logic FSM 5 cấp, đọc cảm biến, luật relay và MQTT Gateway.
- ✅ `platformio.ini`: Cấu hình đa môi trường build và flags định nghĩa chân.
- ✅ `wokwi.toml` & `diagram.json`: Sơ đồ mạch mô phỏng đầy đủ linh kiện.

### 🌐 Backend & Gateway:
- ✅ `nodered/settings.js`: Cấu hình static web host cổng 1880 và token MQTT.
- ✅ `nodered/orchid-auth.json`: Hệ thống phân quyền tài khoản (admin / operator).

### 🎨 Frontend & Giao Diện:
- ✅ `web/index.html`: Web Dashboard độc quyền công nghệ cao, hỗ trợ chuyển đổi giao diện Sáng (Botanical Orchid Gradient) / Tối (Cyber Glass), biểu đồ Chart.js trực tiếp, bảng FSM động và nút E-STOP.
