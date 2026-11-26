# 📋 Chi Tiết Nối Chân & Sơ Đồ Đấu Dây — OrchidSense Pro

## 🎯 1. Sơ đồ nối chân tổng quan ESP32 DevKit V1 (30 chân)

Hệ thống điều khiển vi khí hậu và tưới phun sương vườn lan thông minh sử dụng **ESP32 DevKit V1**, giao tiếp với 3 khối cảm biến đầu vào và 3 relay chấp hành đầu ra.

```
                         ┌───────────────────┐
                  3V3  ──│3V3             GND│──  GND (Chung tất cả module)
                  GND  ──│GND             GPIO23│
               GPIO36  ──│VP              GPIO22│
   (LDR Sáng)  GPIO34  ──│D34             GPIO1│
  (Nước Bồn)  GPIO35  ──│D35             GPIO3│
               GPIO32  ──│D32             GPIO21│
               GPIO33  ──│D33             GPIO19│
               GPIO25  ──│D25             GPIO18│
               GPIO26  ──│D26              GPIO5│
               GPIO27  ──│D27             GPIO17│
               GPIO14  ──│D14             GPIO16│
               GPIO12  ──│D12              GPIO4│
               GPIO13  ──│D13              GPIO0│
                  GND  ──│GND              GPIO2│
                  VIN  ──│VIN             GPIO15│── (DHT22 Data)
                         └───────────────────┘
```

---

## 📌 2. Bảng Phân Bổ Chân GPIO Chi Tiết (Pinout Table)

| Linh Kiện | Tên Chân / Tín Hiệu | Chân ESP32 DevKit | Loại Tín Hiệu | Ghi Chú Kỹ Thuật |
| :--- | :--- | :--- | :--- | :--- |
| **DHT22** | VCC | `3V3` | Nguồn 3.3V | Khuyến nghị nguồn sạch, lọc tụ 100nF |
| | GND | `GND` | Ground | Nối chung mass hệ thống |
| | DATA | `GPIO15` *(hoặc GPIO4)* | Digital I/O | Kèm trở kéo lên Pull-up 10kΩ lên 3.3V |
| **LDR (Quang Trở)** | VCC | `3V3` | Nguồn 3.3V | Mạch cầu phân áp với điện trở 10kΩ |
| | VOUT (Chân giữa) | `GPIO34` | Analog (ADC1_CH6) | Dải đo ADC 0-4095. Tối: >2200, Sáng: <1800 |
| | GND | `GND` | Ground | Chân còn lại của trở 10kΩ về GND |
| **Biến trở Mực Nước** | VCC | `3V3` | Nguồn 3.3V | Mô phỏng cảm biến mực nước bồn tưới |
| | WIPER (Chân giữa)| `GPIO35` | Analog (ADC1_CH7) | Khóa cạn: <1200 ADC, Phục hồi: ≥1500 ADC |
| | GND | `GND` | Ground | Chân biên còn lại nối GND |
| **Relay 1: Bơm Sương**| IN1 | `GPIO25` | Digital Output | Active LOW (Mức LOW = BẬT, HIGH = TẮT) |
| **Relay 2: Quạt Gió** | IN2 | `GPIO26` | Digital Output | Active LOW (Mức LOW = BẬT, HIGH = TẮT) |
| **Relay 3: Đèn Quang Hợp**| IN3 | `GPIO27` | Digital Output | Active LOW (Mức LOW = BẬT, HIGH = TẮT) |
| **Module Relay** | VCC | `VIN` *(5V)* | Nguồn 5V | Cuộn hút relay cần 5V từ cổng USB/nguồn ngoài |
| | GND | `GND` | Ground | Phải nối chung GND với ESP32 |

---

## 🔌 3. Chi Tiết Sơ Đồ Đấu Nối Từng Khối Linh Kiện

### 3.1. Cảm biến Nhiệt độ & Độ ẩm DHT22
```
DHT22 Pin 1 (VCC)  ────────> ESP32 3V3
DHT22 Pin 2 (DATA) ──┬─────> ESP32 GPIO15
                     │
                    [10kΩ Pull-up Resistor]
                     │
                    3V3
DHT22 Pin 3 (NC)   ────────> Bỏ trống (Không nối)
DHT22 Pin 4 (GND)  ────────> ESP32 GND
```

### 3.2. Cảm biến Ánh sáng LDR (Mạch phân áp)
```
          3.3V
           │
         [LDR] (Quang trở)
           │
           ├───────────────> ESP32 GPIO34 (ADC1_CH6)
           │
        [10kΩ] (Điện trở cố định)
           │
          GND
```
*Nguyên lý:* Khi trời tối, điện trở LDR tăng vọt, điện áp tại GPIO34 giảm (hoặc tăng tùy vị trí đảo), firmware đọc ADC > 2200 để nhận biết trời tối và bật đèn quang hợp.

### 3.3. Cảm biến Mực nước bồn tưới (Biến trở 10k mô phỏng)
```
Pin 1 (Chân biên trái)  ───> 3.3V
Pin 2 (Chân giữa Wiper) ───> ESP32 GPIO35 (ADC1_CH7)
Pin 3 (Chân biên phải)  ───> GND
```
*Ngưỡng an toàn bảo vệ bồn tưới:*
- **ADC < 1200**: Bồn cạn nước! Kích hoạt trạng thái khóa khẩn cấp `WATER_LOCKOUT`, ngắt bơm ngay lập tức để tránh cháy máy bơm.
- **ADC ≥ 1500**: Bồn được bơm đầy lại, mở khóa an toàn cho phép máy bơm trở lại trạng thái `IDLE`.

### 3.4. Module 3 Kênh Relay Điều Khiển Thiết Bị Phụ Tải
```
ESP32 VIN (5V)    ─────────> Relay Module VCC
ESP32 GND         ─────────> Relay Module GND
ESP32 GPIO25      ─────────> Relay IN1 (Bơm phun sương)
ESP32 GPIO26      ─────────> Relay IN2 (Quạt thông gió)
ESP32 GPIO27      ─────────> Relay IN3 (Đèn quang hợp)

Đầu ra Relay (Tiếp điểm thường mở NO):
[Nguồn AC/DC 12V-220V] ──(Dây L)──> Chân COM ──[Tiếp điểm NO]──> Thiết bị tải ──> Dây Nguồn N
```

---

## ⚡ 4. Lưu Ý Quan Trọng Về An Toàn Phần Cứng
1. **Dùng chân ADC1 thay vì ADC2:**
   - ESP32 bị xung đột phần cứng giữa **ADC2** và **Wi-Fi**. Nếu đọc analog trên các chân ADC2 (GPIO0, 2, 4, 12-15, 25-27) khi Wi-Fi đang bật sẽ bị sai lệch hoặc crash.
   - Dự án chuẩn hóa sử dụng **GPIO34** và **GPIO35** (thuộc **ADC1**), đảm bảo việc đọc cảm biến hoàn toàn độc lập và chính xác 100% trong lúc truyền MQTT.
2. **Logic Kích Hoạt Relay (Active LOW):**
   - Đa số module relay opto-isolated trên thị trường kích bằng mức thấp (`LOW = 0V`).
   - Trong firmware: `digitalWrite(PIN, LOW)` là BẬT, `digitalWrite(PIN, HIGH)` là TẮT.
   - Khi khởi động vi điều khiển, các chân GPIO relay được kéo `HIGH` ngay lập tức để tránh hiện tượng thiết bị bị giật bật khi vừa cắm nguồn.
3. **Nguồn cấp cách ly:**
   - Khi chạy tải thật (máy bơm 12V, quạt 220V), nên dùng nguồn tổ ong hoặc adapter riêng cho relay và tải, cách ly optocoupler để tránh nhiễu xung cảm ứng dội ngược vào ESP32.
