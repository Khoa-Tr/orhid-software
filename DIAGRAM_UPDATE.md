# 🔄 Nhật Ký Cập Nhật Sơ Đồ Mạch — DIAGRAM UPDATE

## 🎯 1. Các Cải Tiến Quan Trọng Trong Sơ Đồ Đấu Dây

Trong quá trình phát triển và kiểm thử thực tế từ Tuần 1 đến Tuần 10, sơ đồ mạch của hệ thống đã trải qua các đợt tối ưu quan trọng:

---

### 1.1. Khắc phục xung đột ADC2 với Wi-Fi (Hardware Fix)
- **Vấn đề ban đầu:** Một số thiết kế cũ sử dụng chân GPIO4 hoặc GPIO2 để đọc cảm biến analog. Tuy nhiên trên ESP32, khối **ADC2** chia sẻ phần cứng với bộ phát Wi-Fi. Khi Wi-Fi phát sóng gửi gói MQTT, việc đọc ADC2 sẽ trả về giá trị rác hoặc làm treo vi điều khiển.
- **Giải pháp chuẩn hóa:**
  - Chuyển toàn bộ chân đọc analog sang khối **ADC1**:
    - **GPIO34 (ADC1_CH6):** Dành riêng cho cảm biến ánh sáng LDR.
    - **GPIO35 (ADC1_CH7):** Dành riêng cho cảm biến mực nước bồn tưới.
  - Kết quả: Đọc cảm biến liên tục 100% mượt mà ngay cả khi Wi-Fi đang truyền tải dữ liệu nặng.

---

### 1.2. Chuẩn hóa Logic Relay Active LOW
- **Vấn đề:** Các board relay quang (Optocoupler Relay Module) trên thị trường phổ biến đều kích mở bằng mức logic **LOW (0V)**. Nếu không xử lý kỹ lúc bật nguồn, rơ-le sẽ bị đóng ngắt giật cục làm hỏng máy bơm.
- **Giải pháp:**
  - Cấu hình trong `setup()`: Ngay khi thiết lập `pinMode(PIN, OUTPUT)`, lập tức xuất mức `HIGH` (`digitalWrite(PIN, HIGH)`) để giữ relay luôn TẮT an toàn trong suốt quá trình ESP32 kết nối Wi-Fi.
  - Ánh xạ rõ ràng:
    - BẬT THIẾT BỊ = `digitalWrite(PIN, LOW)`
    - TẮT THIẾT BỊ = `digitalWrite(PIN, HIGH)`

---

### 1.3. Cải tiến Mạch Phân Áp LDR & Trở Kéo Lên DHT22
- **Cảm biến DHT22:** Bổ sung điện trở kéo lên Pull-up 10kΩ giữa chân DATA (GPIO15) và nguồn 3.3V, loại bỏ hoàn toàn hiện tượng timeout cảm biến khi dây tín hiệu dài.
- **Cảm biến LDR:** Ghép nối tiếp với trở 10kΩ tạo thành cầu phân áp tuyến tính, cho dải ADC rộng từ ~300 (nắng gắt) đến ~3800 (tối mịt), ngưỡng phân định bật đèn > 2200 cực kỳ tin cậy.
