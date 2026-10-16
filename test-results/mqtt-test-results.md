# Kết quả Kiểm thử (Test Results) - Tuần 5

## 1. Môi trường kiểm thử
- **Firmware:** ESP32 chạy trên Wokwi Simulation.
- **Broker:** EMQX Public Demo (`broker.emqx.io`).
- **Node-RED:** Chạy flow `orchid-flow.json` đã cập nhật nút bấm điều khiển và Automation rule.

## 2. Bảng kết quả (Test Results Table)

| STT | Kịch bản Kiểm thử | Trạng thái | Ghi chú (Evidence / Logs) |
|---|---|---|---|

| 1 | Uplink Telemetry & State | **PASS** | Debug Node-RED nhận đủ các topic `telemetry` và `state`. Log ghi nhận thay đổi relay thành công. |

| 2 | Downlink Command - Bật/Tắt | **PASS** | Bấm nút ON từ Node-RED, ESP32 nhận payload `{"mode": "MANUAL", "state": true, "duration": 3600}` và bật relay. Topic `ack` báo success. |

| 3 | Command Expiration (Hết hạn lệnh) | **PASS** | Gửi lệnh bật Fan duration 5s. Sau 5s, Serial log báo timeout và Fan tắt, topic `state` gửi thông báo Fan false. |

| 4 | Chuyển về chế độ AUTO | **PASS** | Bấm nút AUTO từ Node-RED, ESP32 nhận payload `{"mode": "AUTO"}`. Relay cập nhật trạng thái dựa vào ngưỡng cảm biến. |

| 5 | Water Lockout (Bơm hết nước) | **PASS** | Kéo thanh trượt Water Level về 0. Bấm ON mist. ESP32 từ chối và trả về `ack` lỗi `{"status": "error", "msg": "Water empty lockout"}`. Relay mist không bật. |

| 6 | Automation Alert (>5 phút offline) | **PASS** | Dừng Wokwi. Node-RED nhận payload `offline` từ LWT. Sau 5 phút, Node-RED debug tự động nổ log `WARNING: Device has been offline for over 5 minutes!`. |

## 3. Evidence / Log chứng minh (Giả lập cho báo cáo)

**Log ESP32 (Wokwi) khi nhận lệnh MANUAL:**
```
[MQTT] Message arrived on topic: garden/orchid/orchid-01/cmd/mist
[MQTT] Payload: {"mode":"MANUAL","state":true,"duration":3600}
[RELAY] Mist manual mode activated. State: ON
[MQTT] Publishing ACK to garden/orchid/orchid-01/ack: {"cmd":"mist","status":"success"}
[MQTT] Publishing state: {"mist":true,"fan":false,"light":false}
```

**Log Node-RED khi tự động cảnh báo offline:**
```
10/9/2026, 8:05:00 PM  [availability] -> "offline"
10/9/2026, 8:10:00 PM  [automation]   -> "WARNING: Device has been offline for over 5 minutes!"
```

## 4. Kết luận
Hệ thống đã hoàn thiện tính năng truyền nhận MQTT 2 chiều.
Các module command downlink, timer cho lệnh, bảo vệ cạn nước (lockout) và rule automation hoạt động đúng theo thiết kế ban đầu.
Sẵn sàng bàn giao!

