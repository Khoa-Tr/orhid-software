# KỊCH BẢN QUAY VIDEO DEMO NGẮN & HƯỚNG DẪN THUYẾT TRÌNH (TUẦN 6 & 7)
**Dành cho Người 3:** Báo cáo Tầng Application, Cảnh báo Telegram, Ghép nối E2E và Kịch bản Tự động hóa  
**Thời lượng video dự kiến:** 2 đến 3 phút  

---

## 1. Chuẩn bị trước khi quay
1. Mở màn hình chia đôi (Split Screen):
   - **Nửa trái:** Trình duyệt mở giả lập Wokwi (ESP32) với tab **Serial Monitor** mở sẵn.
   - **Nửa phải:** Trình duyệt mở Node-RED flow (`http://localhost:1880`) với tab **Debug** mở sẵn; mở ứng dụng Telegram (nếu có kết nối bot).
2. Kiểm tra flow Node-RED: Đã import file `nodered/orchid-flow.json` mới nhất và nhấn **Deploy**.
3. Bật Wokwi chạy mô phỏng (`Play`). Đảm bảo Wokwi báo kết nối Wi-Fi và MQTT thành công.

---

## 2. Kịch bản Video Demo từng bước (Chi tiết từng giây)

### 🎬 Phân cảnh 1: Giới thiệu & Luồng Telemetry (0:00 - 0:35)
*   **Lời thoại thuyết minh:**
    > *"Xin chào thầy cô và các bạn. Đây là phần demo của Người 3 cho Tuần 6 và Tuần 7 của dự án Vườn Lan Thông Minh Orchid-01. Ở màn hình bên trái là ESP32 chạy trên Wokwi, bên phải là trung tâm điều khiển và giám sát Node-RED."*
*   **Thao tác thực hiện:**
    1. Chỉ vào bảng Serial Monitor của ESP32: Nhấn vào cảm biến DHT22, kéo nhiệt độ lên 30°C, độ ẩm 70%.
    2. Quay sang màn hình Node-RED tab Debug: Chỉ cho thấy gói tin `telemetry` JSON đang được cập nhật thời gian thực mỗi 2.5 giây (`temperature_c`, `humidity_pct`, `water_adc`, `light_adc`).

---

### 🎬 Phân cảnh 2: Điều khiển 2 chiều & Phản hồi ACK (0:35 - 1:15)
*   **Lời thoại thuyết minh:**
    > *"Tiếp theo là phần điều khiển downlink. Lưu ý quan trọng của Tuần 6: Toàn bộ lệnh gửi xuống đều tuân thủ 100% chuẩn firmware mới, bao gồm `request_id`, trạng thái chuỗi 'ON'/'OFF', thời gian hiệu lực `ttl_s` và xử lý ACK từ ESP32."*
*   **Thao tác thực hiện:**
    1. Nhấn nút **"ON fan (60s)"** trên Node-RED.
    2. Chỉ vào Serial Monitor Wokwi: ESP32 in log nhận lệnh `mode=MANUAL state=ON ttl_s=60`. Relay quạt đóng (GPIO26 bật).
    3. Chỉ vào Debug Node-RED: Hiện bản tin `ack` trả về `result: "APPLIED"`, và bản tin `state` cập nhật quạt là `"ON"`.
    4. Nhấn nút **"AUTO fan"**: ESP32 nhận lệnh, xóa override và trả về chế độ tự động.

---

### 🎬 Phân cảnh 3: Tình huống bất thường - Khóa cạn nước (Water Lockout) & Cảnh báo (1:15 - 1:55)
*   **Lời thoại thuyết minh:**
    > *"Bây giờ là tình huống bất thường: Bình chứa bị cạn nước. Chúng ta kiểm tra cơ chế bảo vệ chống cháy bơm của firmware và cảnh báo đa kênh của Node-RED."*
*   **Thao tác thực hiện:**
    1. Trên Wokwi, kéo thanh trượt biến trở nước về **0%** (ADC = 0 < 1200).
    2. Ngay lập tức:
       - Node-RED nổ cảnh báo màu đỏ: `[WATER_LOW] CRITICAL - Mực nước bình chứa đang ở mức THẤP!`.
       - (Nếu có nối Telegram): Telegram bot nổ tin nhắn thông báo cạn nước.
    3. Cố tình nhấn nút **"ON mist (60s)"** để ép bật bơm.
    4. Chỉ vào Serial Monitor Wokwi & Debug Node-RED: Lệnh bị từ chối thẳng thừng! Bản tin ACK trả về `result: "REJECTED"`, lý do `reason: "WATER_LOCKOUT"`. Relay bơm vẫn giữ nguyên mức ngắt (LOW).

---

### 🎬 Phân cảnh 4: Business Rules Tuần 7 - Quạt hỗ trợ sau phun sương & Đèn quang chu kỳ (1:55 - 2:40)
*   **Lời thoại thuyết minh:**
    > *"Bước sang Tuần 7, chúng em tích hợp các Business Rules thực tế cho vườn lan: Thứ nhất là quy tắc quạt thông gió hỗ trợ sau chu kỳ phun sương. Khi sương vừa ngắt, quạt sẽ tự động bật 60 giây để làm ráo kẽ lá, tránh nấm mốc."*
*   **Thao tác thực hiện:**
    1. Kéo nước lên mức an toàn (60%). Bật phun sương, sau đó tắt sương (hoặc hết chu kỳ phun).
    2. Chỉ vào màn hình Node-RED: Rule `orchid-rule-fan` lập tức bắt được sự kiện kết thúc phun, tự động kích hoạt lệnh bật quạt 60 giây.
    3. Giới thiệu Rule 1 về đèn:
       > *"Quy tắc thứ hai là đèn quang hợp: Đèn áp dụng khung giờ có khoảng tối sinh học bắt buộc. Mặc định cấm bật đèn từ 21h đêm đến 6h sáng để lan hô hấp; ban ngày chỉ bật bù sáng khi trời âm u và tự động ngắt khi đủ sáng."*

---

### 🎬 Phân cảnh 5: Kết luận & Chạy Test Tự động (2:40 - 3:00)
*   **Lời thoại thuyết minh:**
    > *"Toàn bộ các ca kiểm thử tích hợp và tình huống bất thường đều đã được tự động hóa bằng script Python. Sau đây em xin chạy bộ test tổng hợp."*
*   **Thao tác thực hiện:**
    1. Mở Terminal tại thư mục project, chạy lệnh:
       ```powershell
       py test-results/run_e2e_test_suite.py
       ```
    2. Màn hình in ra toàn bộ 10/10 test cases màu xanh: **[PASS] 10/10 TEST CASES ĐẠT TRẠNG THÁI [PASS] (100%)**.
    3. Kết thúc video: *"Em xin cảm ơn thầy cô đã lắng nghe."*
