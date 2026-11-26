# 📖 Mục Lục & Danh Mục Tài Liệu — INDEX

## 🗂️ Cấu Trúc Toàn Bộ Dự Án OrchidSense Pro

```
orhid/
│
├── 📚 TÀI LIỆU HƯỚNG DẪN CHI TIẾT (MARKDOWN DOCUMENTATION)
│   ├── START_HERE.md               ← [ĐỌC ĐẦU TIÊN] Bắt đầu nhanh trong 5 phút
│   ├── QUICKSTART.md               ← Hướng dẫn cài đặt môi trường PlatformIO & Node-RED
│   ├── WIRING_DIAGRAM.md           ← Sơ đồ nối chân phần cứng, phân áp LDR và relay
│   ├── CODE_STRUCTURE.md           ← Giải thích cấu trúc code C++, FSM và xử lý MQTT
│   ├── WOKWI_GUIDE.md              ← Hướng dẫn chạy và tương tác mô phỏng trên Wokwi
│   ├── DIAGRAM_UPDATE.md           ← Nhật ký cải tiến sơ đồ mạch và sửa lỗi phần cứng
│   ├── BUILD_SUMMARY.md            ← Báo cáo biên dịch firmware và thông số RAM/Flash
│   ├── RELOAD_INSTRUCTIONS.md      ← Hướng dẫn nạp lại code và xử lý sự cố thường gặp
│   ├── FINAL_CHECKLIST.md          ← Bảng kiểm tra tổng duyệt trước khi thuyết trình
│   ├── INDEX.md                    ← [FILE NÀY] Mục lục tra cứu toàn bộ dự án
│   └── README.md                   ← Trang tổng quan chính của kho mã nguồn
│
├── 📂 src/
│   ├── main.cpp                    ← Mã nguồn C++ chính (FSM, cảm biến, MQTT, Relay)
│   ├── s3_physical.cpp             ← Phiên bản firmware cho kit vật lý ESP32-S3
│   └── ...                         ← Các chương trình test màn hình và chân GPIO
│
├── 📂 nodered/
│   ├── settings.js                 ← Cấu hình máy chủ Node-RED và cổng web 1880
│   ├── start-node-red.ps1          ← Script khởi động Node-RED tự động trên Windows
│   └── orchid-auth.json            ← Danh sách tài khoản phân quyền bảo mật
│
├── 📂 web/
│   └── index.html                  ← Giao diện Web Dashboard OrchidSense Pro
│                                     (Hỗ trợ Dark / Light Botanical Orchid Gradient)
│
├── 📋 platformio.ini               ← Cấu hình PlatformIO, thư viện và môi trường nạp
├── 📋 diagram.json                 ← Sơ đồ đấu nối linh kiện ảo trên Wokwi Simulator
├── 📋 wokwi.toml                   ← File liên kết Wokwi Simulator với file firmware.bin
└── 📋 orchid-history.jsonl          ← Nhật ký lưu trữ telemetry cảm biến theo thời gian
```

---

## 🎯 Hướng Dẫn Sử Dụng Nhanh Các File

1. **Nếu bạn muốn chạy thử mô phỏng ngay:**
   👉 Mở [START_HERE.md](file:///c:/Users/ACER/OneDrive/Documents/PlatformIO/Projects/orhid/START_HERE.md) hoặc [WOKWI_GUIDE.md](file:///c:/Users/ACER/OneDrive/Documents/PlatformIO/Projects/orhid/WOKWI_GUIDE.md).

2. **Nếu bạn cần xem cách đấu dây phần cứng:**
   👉 Mở [WIRING_DIAGRAM.md](file:///c:/Users/ACER/OneDrive/Documents/PlatformIO/Projects/orhid/WIRING_DIAGRAM.md).

3. **Nếu bạn cần ôn lại thuật toán FSM để trả lời câu hỏi của thầy:**
   👉 Mở [CODE_STRUCTURE.md](file:///c:/Users/ACER/OneDrive/Documents/PlatformIO/Projects/orhid/CODE_STRUCTURE.md).

4. **Nếu bạn chuẩn bị lên báo cáo thuyết trình:**
   👉 Mở [FINAL_CHECKLIST.md](file:///c:/Users/ACER/OneDrive/Documents/PlatformIO/Projects/orhid/FINAL_CHECKLIST.md).
