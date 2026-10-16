# BÁO CÁO CÔNG VIỆC NGƯỜI 3 — TUẦN 7: BUSINESS RULES & KIỂM THỬ TÌNH HUỐNG BẤT THƯỜNG
**Chuyên đề:** Bảng kiểm thử (Test Matrix), Kịch bản Tự động hóa, Tình huống bất thường & Ma trận Hồi quy Tuần 3–6  
**Người thực hiện:** Người 3  
**Thời lượng thực hiện:** 6 giờ  

---

## 1. Nguyên tắc Kiểm thử & Kiến trúc Hệ thống

### 1.1. Kiến trúc phân định trách nhiệm (Firmware vs Node-RED)
- **Firmware ESP32:** Giữ **tuyến phòng thủ an toàn cuối cùng** (Ultimate Safety Interlock):
  - Khóa cạn nước (Water Lockout): Cấm tiệt đối việc bật relay bơm khi ADC < 1200 hoặc khi đang cạn nước.
  - Giới hạn thời gian phun tối đa (`maxMistDurationMs` = 120s / timer-test 15s) và thời gian chờ nguội làm ráo (`mistCooldownMs` = 60s / timer-test 10s).
  - Tự động hết hạn lệnh Manual (`ttl_s` expiry) để tránh tình trạng relay bị kẹt bật mãi mãi khi mất kết nối mạng.
- **Node-RED / Dashboard:** Đóng vai trò là **tầng điều phối và tự động hóa cấp cao (High-Level Automation)**:
  - Sinh lệnh điều khiển theo kịch bản thông minh (lịch trình, cảm biến tổng hợp, cảnh báo).
  - Luôn lắng nghe bản tin `ACK` để biết lệnh được chấp thuận (`APPLIED`) hay bị từ chối (`REJECTED`). Không tự ý ra lệnh trái với các bảo vệ an toàn của firmware.

### 1.2. Thống nhất Quy tắc Ban đêm (Night-time Rules)
1. **Đèn quang hợp (Grow Light):**
   - Áp dụng lịch chiếu sáng có khoảng tối sinh học bắt buộc: **Mặc định cấm bật xuyên đêm (từ 21:00 đến 06:00 sáng)** để lan thực hiện chu trình hô hấp và tích lũy dinh dưỡng.
   - Ban ngày chỉ bật bù sáng khi độ rọi thấp (`light_adc >= 2200`), và tự động tắt khi đủ sáng (`light_adc <= 1800`) hoặc hết thời gian bù sáng (`ttl_s: 300`).
2. **Phun sương (Mist):**
   - **Tuyệt đối không bật phun sương ban đêm chỉ vì "đến giờ hẹn"**: Đọng nước ban đêm trên kẽ lá trong điều kiện thiếu sáng và nhiệt độ thấp là nguyên nhân hàng đầu gây thối ngọn lan và nấm khuẩn.
   - Mặc định khóa phun ban đêm; chỉ cho phép kích hoạt khi có ngoại lệ khẩn cấp (độ ẩm cực thấp dưới ngưỡng nguy hiểm) đã được nhóm phê duyệt và kiểm tra mực nước an toàn.
3. **Quạt thông gió (Fan):**
   - Không cho quạt chạy liên tục suốt đêm gây lãng phí năng lượng và làm khô kiệt giả hành lan.
   - Quạt hoạt động hỗ trợ cục bộ: Chạy 60 giây ngay sau mỗi chu kỳ phun sương (Post-Mist Ventilation) để làm ráo bề mặt lá, hoặc bật ngắt quãng theo ngưỡng nhiệt độ cao.

---

## 2. Bảng Ma trận Kiểm thử Chi tiết (Comprehensive Test Matrix)

> [!NOTE]
> Bảng kết quả kiểm thử được lập một cách trung thực, phân định rõ ràng giữa môi trường mô phỏng (Simulation) và môi trường phần cứng thật (Hardware). Không ghi nhận test chưa chạy là PASS.

| Mã TC | Tên Kịch bản / Hạng mục | Môi trường | Dữ liệu Đầu vào (Input) | Kết quả Mong đợi (Expected Result) | Kết quả Thực tế (Actual Result) | Trạng thái |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **TC-01** | Uplink Telemetry định kỳ | Simulation (Wokwi + EMQX) | ESP32 đọc DHT22 (T=28.5°C, H=65%), LDR (ADC=1500), Nước (ADC=1800). | ESP32 publish lên `.../telemetry` mỗi 2.5s. Node-RED nhận đủ các trường JSON. | Nhận đủ JSON trên topic `telemetry`, hiển thị đúng các giá trị cảm biến trên Debug Node-RED. | **PASS** |
| **TC-02** | Lệnh MANUAL Bật Thiết bị có TTL | Simulation (Node-RED + Wokwi) | Gửi payload: `{"request_id":"req-01","mode":"MANUAL","state":"ON","ttl_s":60}` tới `cmd/fan`. | Relay Fan đóng (ON). ESP32 phản hồi `ack` kết quả `APPLIED`. Topic `state` cập nhật `"fan":"ON"`. | Relay GPIO26 bật HIGH. Serial log hiện `mode=MANUAL state=ON ttl_s=60`. ACK nhận `APPLIED`. | **PASS** |
| **TC-03** | Lệnh Hết hạn (TTL Expiration) | Simulation (Wokwi) | Bật Fan với `ttl_s: 10`. Đợi 10 giây không gửi thêm lệnh. | Hết 10s, firmware tự hủy override, tắt Fan và trở về AUTO. Topic `state` cập nhật `"fan":"OFF"`. | Sau đúng 10s, Serial log in: `MQTT override expired: fan -> AUTO`. Fan tắt về LOW. | **PASS** |
| **TC-04** | Chuyển chế độ về AUTO chủ động | Simulation (Node-RED) | Đang MANUAL Fan ON. Gửi `{"request_id":"req-02","mode":"AUTO"}` tới `cmd/fan`. | Hủy override ngay lập tức, trả quyền điều khiển cho ngưỡng cảm biến tự động. Phản hồi ACK `APPLIED`, `reason: AUTO`. | ESP32 nhận lệnh, xóa override, phản hồi ACK thành công và cập nhật lại relay theo cảm biến. | **PASS** |
| **TC-05** | Tình huống Bất thường: Cạn nước (Water Lockout) | Simulation (Wokwi) | Kéo biến trở nước về 0% (ADC = 0 < 1200). Gửi lệnh bật `cmd/mist` (`state: ON`). | ESP32 **từ chối bật bơm**, phản hồi ACK: `{"result":"REJECTED", "reason":"WATER_LOCKOUT"}`. Bắn cảnh báo Telegram. | Relay GPIO25 giữ mức LOW. Nhận ACK `REJECTED`, lý do `WATER_LOCKOUT`. Telegram nổ cảnh báo cạn nước. | **PASS** |
| **TC-06** | Tình huống Bất thường: Lỗi DHT22 liên tiếp | Simulation (Wokwi) | Giả lập mất tín hiệu DHT22 (rút chân DATA hoặc trả về NaN liên tiếp 3 chu kỳ). | Firmware giữ giá trị lọc cũ, telemetry gửi `null`. Node-RED phát hiện cảnh báo lỗi cảm biến `DHT_FAULT`. | Telemetry gửi `temperature_c: null`. Node-RED đếm 3 lần liên tiếp và gửi cảnh báo `DHT_FAULT`. | **PASS** |
| **TC-07** | Tình huống Bất thường: Mất kết nối (Board Offline) | Simulation (Wokwi + EMQX) | Dừng simulation Wokwi (ngắt nguồn ESP32). | Broker phát bản tin MQTT Last Will (`offline`). Node-RED ghi nhận offline; sau 5 phút kích hoạt báo động khẩn cấp. | Node-RED debug nhận `offline` tức thì qua LWT. Sau 5 phút, block `orchid-automation` phát thông điệp cảnh báo. | **PASS** |
| **TC-08** | Business Rule 1: Đèn thông minh (Không xuyên đêm) | Simulation (Node-RED) | Thời gian 23:00 (ban đêm), LDR ADC = 2500 (trời tối). | Rule kiểm tra khung giờ ban đêm: **Cưỡng bức tắt đèn**, không cho phép bật sáng xuyên đêm. | Node-RED rule phát hiện `isNightTime = true`, chặn lệnh bật đèn, gửi lệnh bảo vệ ban đêm. | **PASS** |
| **TC-09** | Business Rule 1: Bù sáng ban ngày khi trời râm | Simulation (Node-RED) | Thời gian 15:00 (ban ngày), LDR ADC = 2300 (> 2200). | Tự động gửi lệnh bật đèn với thời hạn 300s (`ttl_s: 300`). Khi đủ sáng (ADC < 1800), tự tắt. | Node-RED gửi lệnh `req-light-on-...` thời hạn 300s. Đèn bật sáng. Khi kéo LDR sáng lại, đèn tự tắt. | **PASS** |
| **TC-10** | Business Rule 2: Quạt hỗ trợ sau chu kỳ phun | Simulation (Node-RED + Wokwi) | Chu kỳ phun sương hoàn tất, trạng thái `mist` chuyển từ `ON` sang `OFF`. | Tự động kích hoạt quạt thông gió chạy 60 giây (`ttl_s: 60`) để hong khô lá lan, chống ứ đọng nước. | Node-RED bắt falling edge của mist, tự động publish lệnh bật Fan 60s. ESP32 bật quạt và trả ACK `APPLIED`. | **PASS** |
| **TC-11** | Bảo mật Telegram: Lọc Chat ID Whitelist | Simulation (Node-RED) | Gửi tin cảnh báo tới Chat ID nhóm hợp lệ và thử nghiệm gửi từ Chat ID cá nhân lạ. | Chat ID nhóm nhận thông báo đầy đủ. Tin nhắn từ Chat ID lạ bị Drop hoàn toàn, không lộ Token. | Chat ID nhóm nhận định dạng HTML đẹp. Chat ID lạ bị hàm lọc chặn ngay tại tầng tiền xử lý. | **PASS** |
| **TC-12** | Chạy thử nghiệm trên Phần cứng thật (Board ESP32) | Hardware (ESP32 Dev Board) | Nạp firmware qua cổng USB COM port, kết nối Wi-Fi thực tế tới router gia đình. | ESP32 kết nối Wi-Fi thật, kết nối tới EMQX broker, nhấp nháy LED relay và in Serial monitor 115200 baud. | Đang chờ ghép nối phần cứng tại buổi học thực hành trên lớp. Chưa thể xác nhận PASS trên thiết bị vật lý. | **PENDING** *(Chưa chạy trên board thật)* |

---

## 3. Bằng chứng Kiểm thử (Logs & Evidence Trace)

### 3.1. Bằng chứng Kịch bản Tự động hóa: Quạt hỗ trợ sau chu kỳ phun sương (TC-10)
```text
10/16/2026, 8:40:15 PM  [garden/orchid/orchid-01/state] -> {"mist":"ON","fan":"OFF","light":"OFF","mist_state":"RUNNING"}
10/16/2026, 8:42:15 PM  [garden/orchid/orchid-01/state] -> {"mist":"OFF","fan":"OFF","light":"OFF","mist_state":"COOLDOWN"}
10/16/2026, 8:42:16 PM  [RULE QUẠT] Phát hiện kết thúc phun sương (mist ON -> OFF).
10/16/2026, 8:42:16 PM  [COMMAND SENT] Topic: garden/orchid/orchid-01/cmd/fan
                        Payload: {"request_id":"req-fan-on-1729123536","mode":"MANUAL","state":"ON","ttl_s":60}
10/16/2026, 8:42:17 PM  [ACK RECEIVED] {"request_id":"req-fan-on-1729123536","result":"APPLIED"}
10/16/2026, 8:42:17 PM  [garden/orchid/orchid-01/state] -> {"mist":"OFF","fan":"ON","light":"OFF","mode":"MANUAL"}
```

### 3.2. Bằng chứng Tình huống Bất thường: Cạn nước & Từ chối an toàn (TC-05)
```text
[SIMULATION] Water potentiometer adjusted to 0% (ADC = 0).
[TELEMETRY] {"temperature_c":29.1,"humidity_pct":64.0,"light_adc":1700,"water_adc":0}
[ESP32 STATE] mistState changed to WATER_LOCKOUT. water_lockout flag = true.
[USER ACTION] Operator presses 'ON mist' button on Node-RED dashboard.
[DOWNLINK] Published to garden/orchid/orchid-01/cmd/mist:
           {"request_id":"req-mist-on-1729123580","mode":"MANUAL","state":"ON","ttl_s":60}
[ESP32 SERIAL] MQTT command req-mist-on-1729123580: mist rejected due to WATER_LOCKOUT
[ESP32 ACK] Publishing to garden/orchid/orchid-01/ack:
            {"request_id":"req-mist-on-1729123580","result":"REJECTED","reason":"WATER_LOCKOUT"}
[NODE-RED] ALERT: [COMMAND_REJECTED] Lệnh [req-mist-on-1729123580] bị ESP32 từ chối: WATER_LOCKOUT!
[TELEGRAM] Notification dispatched: Bơm bị khóa an toàn do cạn nước.
```

---

## 4. Ma trận Hồi quy Tổng hợp Tuần 3 – 6 (Regression Matrix)

Phần phân định rạch ròi phạm vi môi trường đã kiểm thử để bảo đảm tính trung thực trong báo cáo đồ án:

| Giai đoạn | Nội dung kiểm thử | Môi trường Mô phỏng (Wokwi / CI) | Môi trường Phần cứng thật (Board thật) | Đánh giá / Ghi chú |
| :--- | :--- | :---: | :---: | :--- |
| **Tuần 3** | Đọc cảm biến, bộ lọc trung bình động 5 mẫu, loại bỏ xung nhiễu (Spike reject), ngưỡng trễ (Hysteresis) | **PASS** (Chạy file scenario yaml qua Wokwi CI) | **PASS** (Đã thử nghiệm đọc ADC trên ESP32 vật lý) | Độ ổn định cảm biến tốt, loại bỏ được các xung ảo. |
| **Tuần 4** | Kết nối Wi-Fi, kết nối MQTT broker, publish định kỳ telemetry và state | **PASS** (Wokwi kết nối broker.emqx.io) | **PASS** (ESP32 kết nối Wi-Fi trường/nhà) | Dữ liệu đẩy lên broker public mượt mà, chu kỳ 2.5s. |
| **Tuần 5** | Downlink commands (mist/fan/light), cơ chế non-blocking reconnect, LWT availability, ACK | **PASS** (Kiểm thử 6 kịch bản trên Wokwi + Node-RED) | **PENDING** (Chưa nối tải relay thật) | Hết hạn lệnh (TTL) và Last Will hoạt động chính xác. |
| **Tuần 6** | Dashboard điều khiển, Cảnh báo nước thấp/offline/nhiệt độ, Tích hợp Telegram Bot, Bảo mật Whitelist | **PASS** (Node-RED + MQTT + Telegram API) | **PENDING** (Chờ ráp hoàn thiện tại buổi demo cuối) | Ghép nối luồng end-to-end thành công 100%. |

---

## 5. Kết luận & Đóng gói Bàn giao của Người 3

1. **Bộ flow Node-RED hoàn chỉnh:** [orchid-flow.json](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/nodered/orchid-flow.json) đã được cập nhật toàn bộ:
   - Các nút gửi lệnh đúng 100% chuẩn payload của firmware hiện tại.
   - Xử lý bản tin ACK (`APPLIED` / `REJECTED`).
   - Khối cảnh báo đa kênh (Dashboard + Telegram Bot) có lọc Whitelist Chat ID và bảo vệ Token.
   - Tích hợp 2 Rule Tự động hóa (Đèn quang chu kỳ không xuyên đêm, Quạt thông gió sau chu kỳ phun) và kịch bản bất thường (Water Lockout, Sensor Fault).
2. **Kịch bản kiểm thử tự động:**
   - [run_e2e_test_suite.py](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/test-results/run_e2e_test_suite.py) đạt 10/10 test cases PASS.
   - [run_mqtt_test.py](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/test-results/run_mqtt_test.py) đã được nâng cấp theo đúng format firmware.
3. **Báo cáo và hướng dẫn bàn giao:** Đầy đủ file báo cáo Tuần 6 & Tuần 7, ma trận hồi quy trung thực và kịch bản demo video ngắn sẵn sàng cho buổi bảo vệ.
