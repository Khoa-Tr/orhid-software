# BÁO CÁO NGHIỆM THU TUẦN 8: END-TO-END INTEGRATION (M4, 15%)
**Chuyên đề:** Kiểm thử Tích hợp 2 Chiều 4 Tầng, Thử nghiệm Đứt mạng/Phục hồi & Danh sách Lỗi Tích hợp  
**Người thực hiện:** Người 3  
**Thời lượng thực hiện:** 6 giờ  
**Trọng số đánh giá:** Cột mốc M4 (15% tổng điểm đồ án)  

---

## 1. MỤC TIÊU VÀ ĐIỀU KIỆN NGHIỆM THU CỘT MỐC M4

### 1.1. Mục tiêu tuần 8
Chứng minh luồng truyền thông hai chiều (Bidirectional End-to-End Dataflow) hoạt động ổn định và chính xác qua đầy đủ 4 tầng kiến trúc:
1. **Tầng 1 (Sensor / Actuator):** ESP32 đọc cảm biến DHT22, LDR, Biến trở nước và điều khiển 3 Relay (Mist, Fan, Light).
2. **Tầng 2 (Truyền thông Mạng):** MQTT Broker (`broker.emqx.io:1883`) làm trung gian phân phối dữ liệu QoS 1.
3. **Tầng 3 (Xử lý & Điều phối):** Node-RED parse feed, ghi log `orchid-history.jsonl`, kích hoạt Business Rules và Watchdog.
4. **Tầng 4 (Giao diện Ứng dụng & Cảnh báo):** Dashboard hiển thị đồng hồ đo/biểu đồ, Telegram Bot bắn cảnh báo khẩn cấp tới nhóm.

### 1.2. Điều kiện nghiệm thu M4 (Chống may mắn)
> [!IMPORTANT]
> **Quy tắc nghiệm thu M4:** Hệ thống phải chạy lặp lại nhiều lần liên tục (Repeatability Test) đạt trạng thái ổn định, không chấp nhận việc "chỉ chạy thử 1 lần thành công do may mắn". Ngoài ra, phải chứng minh được khả năng tự phục hồi khi xảy ra sự cố mạng (Fault Tolerance).

---

## 2. KẾT QUẢ KIỂM THỬ LUỒNG 2 CHIỀU 4 TẦNG & ĐỘ LẶP LẠI (REPEATABILITY)

### 2.1. Kiểm thử luồng Uplink (Sensor ➔ MQTT ➔ Node-RED ➔ Dashboard)
- **Thao tác:** Kéo thay đổi thông số trên Wokwi (Nhiệt độ 28.5°C -> 33.2°C, Nước 1800 ADC -> 950 ADC).
- **Kiểm chứng:**
  - Tầng 1 (Serial Wokwi): `CAL raw_temp=33.2 filtered_temp=33.2 ...`
  - Tầng 2 (MQTT Broker): Topic `garden/orchid/orchid-01/telemetry` nhận JSON chứa `temperature_c: 33.2`.
  - Tầng 3 (Node-RED): Khối `orchid-process` cập nhật context, ghi vào `orchid-history.jsonl`.
  - Tầng 4 (Dashboard & Telegram): Gauge nhiệt độ nhảy lên 33.2°C; đồng thời bộ xử lý cảnh báo kích hoạt gửi cảnh báo nhiệt độ cao `HIGH_TEMPERATURE` về Dashboard log và bot Telegram.
- **Đánh giá:** Đồng bộ dữ liệu tức thời (< 300ms), không lệch đơn vị.

### 2.2. Kiểm thử luồng Downlink (Dashboard ➔ Node-RED ➔ MQTT ➔ ESP32 ➔ Relay ➔ ACK)
- **Thao tác:** Bấm nút điều khiển `ON fan (60s)` từ Dashboard.
- **Kiểm chứng:**
  - Tầng 4 (Dashboard): Gửi yêu cầu với `ttl_s: 60`.
  - Tầng 3 (Node-RED): Khối `orchid-cmd-formatter` sinh `request_id: "req-fan-on-..."`, đóng gói JSON chuẩn firmware publish lên topic `garden/orchid/orchid-01/cmd/fan`.
  - Tầng 2 (MQTT Broker): Truyền payload tới ESP32 qua QoS 1.
  - Tầng 1 (ESP32 Wokwi): Serial in `mode=MANUAL state=ON ttl_s=60`, GPIO26 kéo lên HIGH, quạt bật sáng. ESP32 publish ACK `{"result":"APPLIED"}` lên `cmd/ack` và cập nhật `state`.
  - Phản hồi ngược lên Tầng 4: Dashboard nhận ACK `APPLIED`, nút chuyển trạng thái sáng, log lịch sử ghi nhận thành công.

### 2.3. Bằng chứng kiểm thử độ lặp lại M4 (M4 Repeatability Log - 5 Chu kỳ liên tiếp)
Được thực thi tự động qua script `test-results/run_m4_reconnection_test.py`:

```text
======================================================================
BƯỚC 1: KIỂM THỬ ĐỘ ỔN ĐỊNH LẶP LẠI (M4 REPEATABILITY TEST - 5 CHU KỲ)
======================================================================
--- Chu kỳ 1/5: Gửi lệnh bật quạt (Fan ON, 5s, req_id: m4-cycle-1-2589) ---
  [ACK OK] Nhận ACK APPLIED thành công trong 0.60s
--- Chu kỳ 2/5: Gửi lệnh bật quạt (Fan ON, 5s, req_id: m4-cycle-2-3592) ---
  [ACK OK] Nhận ACK APPLIED thành công trong 0.90s
--- Chu kỳ 3/5: Gửi lệnh bật quạt (Fan ON, 5s, req_id: m4-cycle-3-4896) ---
  [ACK OK] Nhận ACK APPLIED thành công trong 0.70s
--- Chu kỳ 4/5: Gửi lệnh bật quạt (Fan ON, 5s, req_id: m4-cycle-4-5999) ---
  [ACK OK] Nhận ACK APPLIED thành công trong 0.70s
--- Chu kỳ 5/5: Gửi lệnh bật quạt (Fan ON, 5s, req_id: m4-cycle-5-7103) ---
  [ACK OK] Nhận ACK APPLIED thành công trong 0.80s

=> Kết quả M4 Repeatability: 5/5 chu kỳ thành công 100% (Thời gian phản hồi trung bình: 0.74s).
```

---

## 3. KIỂM THỬ MẤT KẾT NỐI (LWT) & TỰ ĐỘNG PHỤC HỒI (RECONNECTION)

Mô phỏng sự cố mất nguồn hoặc đứt kết nối mạng đột ngột (Socket abrupt disconnect / Ungraceful failure).

```
 [Trạng thái bình thường]
   ESP32 (Online) ────────► Broker MQTT ────────► Node-RED Dashboard (Online)
 
 [Sự cố đứt mạng đột ngột]
   ESP32 (Mất kết nối) - - ✖ Broker phát LWT ───► Node-RED Dashboard (Cảnh báo OFFLINE)
 
 [Phục hồi kết nối]
   ESP32 (Reconnect)  ────► Publish "online" ──► Node-RED xóa cảnh báo
                      ────► Publish "state"   ──► Đồng bộ lại trạng thái Relay ngay lập tức
```

### Log thực nghiệm quá trình cắt mạng và phục hồi:
```text
======================================================================
BƯỚC 2: KIỂM THỬ MẤT KẾT NỐI (LWT) & TỰ ĐỘNG PHỤC HỒI (RECONNECTION)
======================================================================
1. [NORMAL] Thiết bị đang kết nối bình thường, publish availability: 'online'
2. [FAULT INJECTION] Cắt socket mạng đột ngột (Mô phỏng mất Wi-Fi/mất điện)...
3. [WAIT FOR LWT] Đang chờ Broker phát hiện và publish Last Will 'offline'...
  => [LWT THÀNH CÔNG] Broker đã phát bản tin Last Will: availability -> 'offline'
4. [RECONNECT] Thiết bị kết nối lại mạng (Non-blocking Reconnection)...
5. [STATE RESYNC] Đã phát lại 'online' và đồng bộ trạng thái state thành công.
```

- **Cơ chế Last Will (LWT):** Đăng ký topic `garden/orchid/orchid-01/availability`, QoS 1, Retain `true`, payload `"offline"`. Khi socket đứt, Broker thay mặt ESP32 phát bản tin này để tầng ứng dụng lập tức phát hiện.
- **Đồng bộ trạng thái sau Reconnect (State Resynchronization):** Trong hàm `serviceNetwork()` của firmware, ngay sau khi kết nối lại MQTT, vi điều khiển gọi ngay `publishState()` để đẩy trạng thái relay và cờ an toàn hiện tại lên broker (retained), giúp Node-RED không bao giờ bị lệch trạng thái giữa giao diện và thực tế.

---

## 4. DANH SÁCH LỖI TÍCH HỢP TÌM ĐƯỢC (INTEGRATION BUG TRACKER)

Người 3 đã rà soát toàn bộ hệ thống và phân loại các lỗi phát sinh trong quá trình ghép nối, phân công cụ thể cho Người 1 và Người 2 xử lý trong tuần 8-9:

| Mã Bug | Tên lỗi & Mô tả chi tiết | Tầng phát sinh | Mức độ | Phân công sửa | Hướng giải quyết đề xuất |
| :---: | :--- | :---: | :---: | :---: | :--- |
| **BUG-01** | **Xung đột kiểu dữ liệu trạng thái Relay (Boolean vs String):** Flow cũ gửi `state: true/false`, trong khi firmware `main.cpp` bắt buộc `state: "ON"/"OFF"`. | Node-RED / Firmware | **CRITICAL** | **Người 2** (Đã fix) | Đã cập nhật `orchid-cmd-formatter` chuẩn hóa chuỗi hoa `"ON"`/`"OFF"`. Người 2 rà soát lại các nút cũ trên dashboard. |
| **BUG-02** | **Tràn bộ đệm JSON Command Buffer:** Firmware định nghĩa `commandBufferSize = 256 bytes`. Khi gửi `request_id` quá dài kèm cấu hình config mở rộng, `deserializeJson()` trả về lỗi `NoMemory`. | Firmware (C++) | **HIGH** | **Người 1** | Tăng `commandBufferSize` trong `main.cpp` từ 256 lên **384 bytes** để an toàn khi gửi payload phức tạp. |
| **BUG-03** | **Độ trễ và mất gói tin của Public Broker (`broker.emqx.io`):** Khi kiểm thử lặp lại, broker công cộng có thời điểm bị nghẽn mạng, độ trễ phản hồi ACK tăng vọt > 3 giây gây timeout giả. | Tầng Truyền thông | **MEDIUM** | **Người 2** | Tăng timeout chờ ACK trên Node-RED từ 2s lên 5s; bổ sung thông báo "Đang gửi lệnh..." trên giao diện. |
| **BUG-04** | **Lỗi Race Condition khi spam nút bấm:** Người dùng bấm liên tục nhiều lần vào nút ON/OFF khi chưa nhận được ACK khiến ESP32 bị quá tải hàng đợi lệnh. | Node-RED Dashboard | **MEDIUM** | **Người 2** | Thêm logic Disable nút bấm (khóa nút tạm thời) trong 1.5 giây sau khi click cho đến khi nhận được ACK. |
| **BUG-05** | **Lỗi biên dịch GCC Xtensa do đường dẫn chứa dấu tiếng Việt:** Trên Windows, PlatformIO bị lỗi `tmp...: Invalid argument` khi đường dẫn có dấu "Máy tính\orhid_người3". | Môi trường / Build | **MEDIUM** | **Người 1** | Viết script tạo Symbolic/Junction link (ví dụ `C:\orchid_src`) trong README để mọi thành viên đều build được. |

---

## 5. TỔNG KẾT NGHIỆM THU M4
- **Độ lặp lại (Repeatability):** Đạt 5/5 chu kỳ liên tục (**PASS**).
- **Khả năng chịu lỗi (Fault Tolerance):** LWT phát hiện mất mạng, Reconnect tự động và State Resync chuẩn xác (**PASS**).
- **Tiến độ:** Hoàn thành toàn diện các yêu cầu của Người 3 Tuần 8.
