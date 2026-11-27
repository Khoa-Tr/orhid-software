# ⚡ Quick Start Guide — OrchidSense Pro

Hướng dẫn cài đặt nhanh môi trường, biên dịch và chạy thử hệ thống chỉ trong vài bước đơn giản.

---

## 🛠️ Bước 1: Chuẩn Bị Môi Trường Phát Triển

### 1.1. Cài đặt PlatformIO Core & CLI
Mở PowerShell (Windows) hoặc Terminal (macOS/Linux) và chạy:
```powershell
pip install platformio
```

### 1.2. Mở dự án trong Visual Studio Code
Cài đặt 2 extension chính thức:
- **PlatformIO IDE** (`platformio.platformio-ide`)
- **Wokwi Simulator** (`wokwi.wokwi-simulator`)

---

## ⚙️ Bước 2: Cấu Hình Mạng & MQTT

Thông tin cấu hình được định nghĩa sẵn trong mã nguồn hoặc tệp `include/config.h` (hoặc trực tiếp trong `src/main.cpp`):
- **Wi-Fi SSID mô phỏng:** `Wokwi-GUEST` (không mật khẩu).
- **Wi-Fi mạch thật:** Điền SSID và Password Wi-Fi nhà bạn.
- **MQTT Broker:** `broker.emqx.io` (Cổng TCP `1883`, Cổng WSS Web `8084`).
- **Device ID:** `orchid-01`.
- **Chân GPIO:**
  - DHT22 Data: `GPIO15`
  - LDR Light: `GPIO34` (ADC1)
  - Water Potentiometer: `GPIO35` (ADC1)
  - Relay Bơm: `GPIO25`
  - Relay Quạt: `GPIO26`
  - Relay Đèn: `GPIO27`

---

## 🔨 Bước 3: Biên Dịch Firmware (Build)

Tại thư mục gốc dự án:
```powershell
# Biên dịch cho môi trường mô phỏng Wokwi tiêu chuẩn
pio run -e esp32dev

# Hoặc biên dịch môi trường test lỗi cảm biến (Fault Test)
pio run -e esp32dev_fault_test
```
Khi thấy dòng thông báo chữ xanh **`[SUCCESS]`**, firmware binary `.pio/build/esp32dev/firmware.bin` đã sẵn sàng!

---

## 🌐 Bước 4: Khởi Động Node-RED & Web Dashboard

### 4.1. Khởi động Node-RED Gateway
```powershell
# Trên Windows (PowerShell):
.\nodered\start-node-red.ps1
```
*Node-RED sẽ chạy ngầm tại cổng `1880`, kết nối tới MQTT Broker và phục vụ giao diện Web.*

### Cấu hình Telegram Bot (tùy chọn)
1. Sao chép `.env.example` thành `.env` ở thư mục gốc của project.
2. Điền `TELEGRAM_BOT_TOKEN` và `TELEGRAM_GROUP_CHAT_ID` vào `.env`.
3. Khởi động lại Node-RED để nạp cấu hình. `.env` đã được Git bỏ qua; không chia sẻ hoặc commit file này.

Có thể thay cho `.env`, đặt hai biến môi trường trong cùng cửa sổ PowerShell trước khi chạy script:
```powershell
$env:TELEGRAM_BOT_TOKEN = "token-cua-bot"
$env:TELEGRAM_GROUP_CHAT_ID = "-100xxxxxxxxxx"
.\nodered\start-node-red.ps1
```
Trên macOS/Linux, dùng `export TELEGRAM_BOT_TOKEN=...` và `export TELEGRAM_GROUP_CHAT_ID=...` trước khi chạy `./nodered/start-node-red.sh`.

### 4.2. Mở Giao Diện Giám Sát Web Dashboard
Mở trình duyệt bất kỳ (Chrome / Edge):
- **Web Dashboard OrchidSense Pro:** 👉 **[http://localhost:1880/index.html](http://localhost:1880/index.html)**
- **Node-RED Dashboard Flow:** 👉 **[http://localhost:1880/dashboard/orchid](http://localhost:1880/dashboard/orchid)**
- **Node-RED Flow Editor:** 👉 **[http://localhost:1880](http://localhost:1880)**

---

## 📡 Bước 5: Thử Nghiệm Gửi Lệnh Điều Khiển Bằng Lệnh MQTT (CLI)

Bạn có thể dùng tiện ích `mosquitto_pub` hoặc extension MQTT trên VS Code để thử gửi lệnh tay:

### Bật bơm phun sương trong 60 giây (Chế độ MANUAL):
```bash
mosquitto_pub -h broker.emqx.io -p 1883 -t "garden/orchid/orchid-01/cmd/mist" \
  -m '{"request_id":"test-101","mode":"MANUAL","state":"ON","ttl_s":60}'
```

### Trả bơm về chế độ tự động (AUTO):
```bash
mosquitto_pub -h broker.emqx.io -p 1883 -t "garden/orchid/orchid-01/cmd/mist" \
  -m '{"request_id":"test-102","mode":"AUTO"}'
```
