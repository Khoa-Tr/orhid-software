# 🔄 Hướng Dẫn Tải Lại & Khắc Phục Sự Cố — RELOAD INSTRUCTIONS

## 🎯 1. Khi Nào Cần Reload Hệ Thống?
- Bạn vừa chỉnh sửa mã nguồn C++ trong `src/main.cpp`.
- Bộ đếm thời gian hoặc kết nối mạng của Wokwi Simulator bị đứng (do bị che tab trình duyệt).
- Thông báo lỗi Wokwi hết token hoặc mất kết nối tới MQTT Broker.

---

## ⚡ 2. Quy Trình 3 Bước Reload Simulator

### Bước 1: Dừng Simulator đang chạy
Trong VS Code:
- Nhấn tổ hợp phím `Ctrl + Shift + P`
- Gõ tìm kiếm: **`Wokwi: Stop Simulator`** và nhấn Enter.

### Bước 2: Biên dịch lại Firmware mới nhất
Mở Terminal tại thư mục gốc dự án và chạy:
```powershell
pio run -e esp32dev
```
*Đảm bảo kết quả hiện `[SUCCESS]` để chắc chắn các thay đổi code mới nhất đã được ghi vào file `.bin`.*

### Bước 3: Khởi động lại Simulator
- Mở file `diagram.json`
- Nhấn `Ctrl + Shift + P` → chọn **`Wokwi: Start Simulator`**
- Đợi 3-5 giây để ESP32 kết nối lại Wi-Fi và MQTT Broker.

---

## 🛠️ 3. Khắc Phục Các Lỗi Thường Gặp (Troubleshooting)

### ❌ Lỗi 1: Wokwi báo "License/Token Expired"
- **Nguyên nhân:** Token Wokwi cá nhân miễn phí hết hạn chu kỳ.
- **Cách xử lý:**
  1. Nhấn `Ctrl + Shift + P` → gõ **`Wokwi: Request Free Trial / Renew License`**.
  2. VS Code sẽ mở trình duyệt để bạn bấm xác nhận qua tài khoản Google/GitHub.
  3. Sau khi xác nhận thành công, nhấn lại `Wokwi: Start Simulator`.

### ❌ Lỗi 2: Web Dashboard báo "Mất kết nối MQTT Broker"
- **Nguyên nhân:** Mạng Internet chập chờn hoặc Broker công cộng bị giới hạn tạm thời.
- **Cách xử lý:**
  - Kiểm tra xem máy tính có kết nối mạng hay không.
  - Dashboard có cơ chế tự động kết nối lại (auto-reconnect) sau mỗi 5 giây, chỉ cần đợi vài giây là pill trạng thái sẽ xanh trở lại `BROKER ONLINE`.

### ❌ Lỗi 3: Node-RED không mở được tại cổng 1880
- **Nguyên nhân:** Có tiến trình khác đang chiếm dụng cổng 1880.
- **Cách xử lý:**
  ```powershell
  # Tìm tiến trình đang chiếm cổng 1880 và khởi động lại
  Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
  .\nodered\start-node-red.ps1
  ```
