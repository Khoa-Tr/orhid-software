# 🚀 START HERE — Hướng Dẫn 5 Phút Bắt Đầu Dự Án OrchidSense Pro

## 👋 Chào mừng bạn đến với dự án OrchidSense Pro!

Bạn đang có trong tay mã nguồn hoàn chỉnh của **Hệ Thống Tự Động Hóa Vi Khí Hậu & Phun Sương Vườn Lan Thông Minh**. Dự án bao gồm đầy đủ Firmware ESP32 (FSM 5 cấp), Wokwi Simulator, Node-RED Backend và Giao diện Web Dashboard độc quyền (Dark / Light Botanical Gradient).

**Trạng thái hiện tại:** ✅ **Build SUCCESS**, Sẵn sàng chạy mô phỏng hoặc nạp mạch thật!

---

## 📚 Chọn Con Đường Của Bạn (Choose Your Path)

### 🏃 Con đường 1: "Tôi muốn xem hệ thống chạy ngay trên mô phỏng" (3 phút)
Không cần mua linh kiện hay cắm dây, chạy trực tiếp trên máy tính:
1. Mở thư mục dự án trong VS Code: `code .`
2. Nhấn `Ctrl + Shift + P` → chọn **`Wokwi: Start Simulator`**.
3. Mạch ảo ESP32 + DHT22 + LDR + Biến trở + 3 Relay sẽ tự động tải lên và kết nối Internet Wi-Fi `Wokwi-GUEST`.
4. Mở trình duyệt web truy cập:
   👉 **[http://localhost:1880/index.html](http://localhost:1880/index.html)**
5. Bạn sẽ thấy các đồng hồ cảm biến nhảy số theo thời gian thực và có thể bấm các nút Bật/Tắt bơm ngay trên web!
📖 *Xem chi tiết tại:* `WOKWI_GUIDE.md`

---

### 🎓 Con đường 2: "Tôi muốn tìm hiểu cấu trúc code và thuật toán FSM" (15 phút)
Dành cho việc ôn tập và chuẩn bị câu trả lời khi bảo vệ đề tài:
1. Đọc **`WIRING_DIAGRAM.md`**: Hiểu rõ từng chân GPIO, mạch phân áp LDR, cách tránh xung đột Wi-Fi với ADC1.
2. Đọc **`CODE_STRUCTURE.md`**: Nắm vững chu trình 5 trạng thái FSM của bơm (`IDLE` → `RUNNING` → `COOLDOWN` → `WATER_LOCKOUT` → `SENSOR_FAULT`), cơ chế vùng trễ Hysteresis và hàng rào bảo vệ thời gian can thiệp tay TTL.
3. Đọc **`FINAL_CHECKLIST.md`**: Rà soát lại tất cả các kịch bản kiểm thử có thể được thầy cô hỏi trong buổi thuyết trình.

---

### 🔨 Con đường 3: "Tôi muốn nạp code vào board mạch ESP32 thật" (10 phút)
1. Cắm cáp Micro-USB/Type-C nối ESP32 với máy tính.
2. Mở file `platformio.ini`, kiểm tra cổng COM (ví dụ `upload_port = COM3`).
3. Chạy lệnh nạp firmware:
   ```powershell
   pio run -e esp32dev -t upload
   ```
4. Mở Serial Monitor để quan sát: `pio device monitor -b 115200`.

---

## 📂 Sơ Đồ Định Hướng Tài Liệu

```
START_HERE.md (Bạn đang ở đây)
  │
  ├──► QUICKSTART.md          → Hướng dẫn cài đặt môi trường PlatformIO từ A-Z
  ├──► WIRING_DIAGRAM.md      → Sơ đồ đi chân mạch phần cứng và relay
  ├──► CODE_STRUCTURE.md      → Giải thích chi tiết thuật toán FSM & MQTT
  ├──► WOKWI_GUIDE.md         → Hướng dẫn test kịch bản trên Simulator
  ├──► FINAL_CHECKLIST.md     → Bảng kiểm tra tổng duyệt trước khi thuyết trình
  └──► INDEX.md               → Danh mục tra cứu toàn bộ file trong kho mã nguồn
```
