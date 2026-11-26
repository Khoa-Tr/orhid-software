# ✅ Bảng Kiểm Tra Tổng Duyệt Bảo Vệ Đồ Án — FINAL CHECKLIST

## 🏆 Sẵn Sàng Cho Buổi Báo Cáo Tuần 10

Bảng kiểm tra toàn diện các hạng mục kỹ thuật cần chuẩn bị trước khi bước vào buổi thuyết trình trước hội đồng/giảng viên hướng dẫn:

---

## 📋 1. Danh Sách Kiểm Tra Kỹ Thuật (Technical Checklist)

| STT | Hạng Mục Kiểm Tra | Tiêu Chí Đạt Chuẩn | Trạng Thái | Ghi Chú |
| :---: | :--- | :--- | :---: | :--- |
| **1** | **Biên dịch Firmware** | Lệnh `pio run` cho kết quả `[SUCCESS]` không lỗi cú pháp | ✅ **ĐẠT** | Binary 920KB, RAM 14.8% |
| **2** | **Kết nối Wokwi Wi-Fi** | Serial Monitor in `WiFi connected!` với mạng `Wokwi-GUEST` | ✅ **ĐẠT** | Cấp IP ảo 10.0.1.x |
| **3** | **Kết nối MQTT Broker** | Trạng thái `MQTT connected`, subscribe thành công các downlink topic | ✅ **ĐẠT** | Broker `broker.emqx.io` |
| **4** | **Đọc Cảm biến DHT22** | Nhiệt độ và độ ẩm hiển thị chính xác theo thanh trượt Wokwi | ✅ **ĐẠT** | Đọc chu kỳ mỗi 2000ms |
| **5** | **Đọc Cảm biến LDR** | ADC thay đổi khi kéo thanh độ sáng, bật đèn khi > 2200 | ✅ **ĐẠT** | Chân GPIO34 (ADC1) |
| **6** | **Mực Nước Bồn Tưới** | Khóa bơm khi ADC < 1200, phục hồi khi ADC ≥ 1500 | ✅ **ĐẠT** | Chân GPIO35 (ADC1) |
| **7** | **Chu trình FSM Bơm Sương**| Chuyển trạng thái nhịp nhàng `IDLE` → `RUNNING` → `COOLDOWN` | ✅ **ĐẠT** | Không dùng `delay()` |
| **8** | **Bảo vệ Lỗi Cảm Biến** | Khóa chuyển `SENSOR_FAULT` khi lỗi DHT22 liên tiếp ≥ 3 lần | ✅ **ĐẠT** | Đã test với `esp32dev_fault_test` |
| **9** | **Điều Khiển Quạt Gió** | Bật khi > 33°C, tắt khi < 31°C, bật 60s sau khi phun sương | ✅ **ĐẠT** | GPIO26 Active LOW |
| **10**| **Lệnh Thủ Công & TTL** | Nhận lệnh `MANUAL`, tự động quay về `AUTO` khi hết TTL | ✅ **ĐẠT** | Bộ đếm `checkManualTTL()` |
| **11**| **Dừng Khẩn Cấp E-STOP** | Bấm nút E-STOP ngắt toàn bộ 3 relay ngay tức thì | ✅ **ĐẠT** | An toàn tuyệt đối |
| **12**| **Giao Diện Web Độc Quyền**| Chuyển đổi mượt mà 2 chế độ Sáng (Vườn Lan) / Tối (Cyber Glass) | ✅ **ĐẠT** | `http://localhost:1880/index.html` |
| **13**| **Cảnh Báo Telegram** | Gửi tin nhắn tức thì về bot khi cạn nước hoặc mất kết nối | ✅ **ĐẠT** | Node-RED Telegram Flow |
| **14**| **Tài Liệu Markdown** | Đầy đủ 11 file hướng dẫn theo đúng chuẩn mẫu của giảng viên | ✅ **ĐẠT** | 11 file hoàn chỉnh |

---

## 🎤 2. Các Kịch Bản Demo Trực Tiếp Khi Thuyết Trình

### 🎯 Kịch bản 1: Giới thiệu hệ thống & Khởi động
1. Mở song song màn hình: **Wokwi Simulator** bên trái, **Web Dashboard** bên phải.
2. Giới thiệu: Hệ thống tự động hóa vi khí hậu vườn lan 4 tầng (Thiết bị IoT → MQTT Broker → Node-RED → Web Dashboard/Telegram).
3. Bấm chuyển chế độ **Sáng / Tối** trên Dashboard để gây ấn tượng với giảng viên về thiết kế giao diện mang màu sắc hoa lan đặc trưng.

### 🎯 Kịch bản 2: Demo tính năng Bơm tự động & FSM
1. Kéo độ ẩm trên DHT22 xuống 50% (< 65%).
2. Chỉ vào Web Dashboard: Node `RUNNING` sáng rực rỡ, Relay bơm trên Wokwi đóng mạch.
3. Giải thích FSM: Sau 15s bơm tự ngắt sang `COOLDOWN` nghỉ hạ nhiệt tránh cháy động cơ, sau đó trở lại `IDLE`.

### 🎯 Kịch bản 3: Demo tính năng An toàn Cạn Nước (Điểm cộng lớn)
1. Kéo núm biến trở nước về 1000 (< 1200 ADC).
2. Hệ thống lập tức nhảy vào `WATER_LOCKOUT`, khóa bơm cưỡng bức và hiện banner cảnh báo đỏ rực.
3. Thử bấm nút BẬT TAY trên web: Hệ thống từ chối đóng relay để bảo vệ máy bơm.
4. Kéo nước lên lại 1600 (≥ 1500 ADC): Khóa an toàn tự động giải phóng!
