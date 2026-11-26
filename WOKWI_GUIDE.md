# 🌿 Hướng Dẫn Mô Phỏng Wokwi Simulator — OrchidSense Pro

## 🎯 1. Tổng Quan Mô Phỏng

Dự án **OrchidSense Pro** được cấu hình hoàn chỉnh để mô phỏng trọn vẹn 100% phần cứng và tính năng mạng mà **không cần kit vật lý**:
- **ESP32 DevKit V1**: Chạy firmware PlatformIO với kết nối Wi-Fi ảo `Wokwi-GUEST`.
- **Cảm biến DHT22**: Cho phép điều chỉnh độ ẩm (0 – 100%) và nhiệt độ (-40°C đến +80°C).
- **Quang trở LDR**: Cho phép kéo mức chiếu sáng từ tối mịt đến nắng gắt.
- **Biến trở Potentiometer**: Mô phỏng phao đo mực nước bồn tưới (0 – 4095 ADC).
- **3 Đèn LED / Relay**: Hiển thị trực quan trạng thái BẬT/TẮT của Bơm, Quạt và Đèn quang hợp.
- **MQTT Broker thật (`broker.emqx.io:1883`)**: Kết nối Internet thật, đồng bộ hai chiều với Web Dashboard và Node-RED.

---

## 🚀 2. Cách Khởi Chạy Mô Phỏng Trong VS Code

### Bước 1: Chuẩn bị môi trường
1. Cài đặt extension **Wokwi Simulator** trên VS Code:
   ```
   Ctrl + Shift + X  → Tìm "Wokwi Simulator" → Install
   ```
2. Đăng ký/kích hoạt license Wokwi cá nhân (miễn phí) theo hướng dẫn trên màn hình.

### Bước 2: Biên dịch Firmware trước khi chạy
Mở Terminal tại thư mục gốc dự án và chạy lệnh:
```powershell
pio run -e esp32dev
```
*Đảm bảo kết quả in ra: `[SUCCESS] in ...s` và file `.pio/build/esp32dev/firmware.bin` được tạo thành công.*

### Bước 3: Khởi động Simulator
1. Mở file `diagram.json` trong VS Code.
2. Nhấn tổ hợp phím: `Ctrl + Shift + P` (hoặc `F1`).
3. Gõ tìm kiếm: **`Wokwi: Start Simulator`** và nhấn **Enter**.
4. Cửa sổ mô phỏng trực quan sẽ hiện ra và mạch bắt đầu chạy.

---

## 🎮 3. Kịch Bản Test Tương Tác Trực Tiếp Trên Wokwi

### Kịch bản 1: Kiểm tra Bơm tự động kích hoạt khi khô hạn
1. Click vào cảm biến **DHT22** trên màn hình Wokwi.
2. Kéo thanh trượt **Humidity** xuống dưới **65%** (ví dụ 55%).
3. **Quan sát:**
   - Đèn LED Bơm Phun Sương (GPIO25) sáng lên (chuyển sang `RUNNING`).
   - Sau thời gian tối đa 15s, bơm tự ngắt chuyển sang `COOLDOWN` (nghỉ 10s) rồi về `IDLE`.

### Kịch bản 2: Kiểm tra Khóa bảo vệ Cạn Nước (Water Lockout)
1. Click vào **Biến trở Potentiometer** (mô phỏng mực nước).
2. Xoay núm vặn về phía trái sao cho giá trị ADC < **1200**.
3. **Quan sát:**
   - Trạng thái FSM trên Web Dashboard chuyển sang màu đỏ: `WATER_LOCKOUT`.
   - Bơm bị khóa cưỡng bức, không thể bật dù độ ẩm xuống thấp.
4. Xoay núm vặn tăng trở lại vượt ngưỡng **≥ 1500** ADC (vùng trễ Hysteresis phục hồi).
5. **Quan sát:** Hệ thống tự động xóa cờ khóa cạn và bơm sẵn sàng hoạt động trở lại.

### Kịch bản 3: Kiểm tra Quạt Thông Gió giải nhiệt
1. Click vào cảm biến **DHT22**.
2. Kéo thanh trượt **Temperature** vượt quá **33.0°C** (ví dụ 35°C).
3. **Quan sát:**
   - Đèn LED Quạt Gió (GPIO26) lập tức BẬT sáng.
   - Kéo nhiệt độ giảm xuống dưới **31.0°C**, quạt tự động TẮT.

### Kịch bản 4: Kiểm tra Đèn Quang Hợp theo ánh sáng mặt trời
1. Click vào cảm biến **LDR**.
2. Kéo mức sáng sang tối (ADC > **2200**).
3. **Quan sát:** Đèn quang hợp (GPIO27) tự động kích hoạt BẬT. Kéo sáng trở lại (ADC < **1800**), đèn tự động TẮT.

---

## 🔍 4. Xem Serial Monitor Để Debug
Trong cửa sổ Terminal của VS Code, tab Wokwi Serial Monitor sẽ in ra nhật ký hoạt động thời gian thực:
```
Connecting to WiFi: Wokwi-GUEST ......
WiFi connected! IP address: 10.0.1.15
Connecting to MQTT Broker: broker.emqx.io:1883 ... connected!
[MQTT] Subscribed to downlink topics.
[TELEMETRY] Temp: 28.5 C, Hum: 72.0 %, LDR: 1650, Water: 2400
[FSM] State: IDLE -> RUNNING
[RELAY] Mist Pump ON (GPIO25)
[ACK] Command applied successfully.
```
