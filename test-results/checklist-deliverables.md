# BẢNG CHECKLIST NGHIỆM THU TOÀN DIỆN DỰ ÁN (TUẦN 1 – TUẦN 9)
**Đề tài:** Hệ Thống Giám Sát và Tự Động Chăm Sóc Vườn Lan Thông Minh (Orchid-01)  
**Phân công trách nhiệm:** Người 1 (Firmware/Uplink), Người 2 (Downlink/Dashboard), Người 3 (Cảnh báo/Integration/Kiểm thử)  
**Trạng thái kiểm tra:** Toàn bộ thành viên đã hoàn thành và đối chiếu deliverables trên repository.

---

## 1. BẢNG CHECKLIST CHI TIẾT THEO TỪNG THÀNH VIÊN & TỪNG TUẦN

### 👤 NGƯỜI 1: FIRMWARE, BỘ LỌC TÍN HIỆU, UPLINK & TEST REPORT
| Tuần | Nhiệm vụ chi tiết | Deliverables yêu cầu | Vị trí file / Minh chứng | Trạng thái |
| :---: | :--- | :--- | :--- | :---: |
| **T3** | Lọc tín hiệu DHT22, LDR, Mực nước ADC bằng Running Average 5 mẫu và Spike Reject | `calibration-log.csv`, firmware lọc tín hiệu | [src/main.cpp](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/src/main.cpp), [calibration-log.csv](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/calibration-log.csv) | [x] **PASS** |
| **T4** | Ghép Wi-Fi và MQTT vào firmware, định kỳ publish telemetry và state lên broker | Code MQTT Uplink, log Serial kết nối | [src/main.cpp](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/src/main.cpp) | [x] **PASS** |
| **T5** | Subscribe các topic `cmd/mist`, `cmd/fan`, `cmd/light`, Non-blocking Reconnect, Last Will (LWT) | Firmware hoàn chỉnh chạy trên Wokwi | [src/main.cpp](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/src/main.cpp) | [x] **PASS** |
| **T6** | Dựng Node-RED Dashboard giám sát: Gauges nhiệt độ, độ ẩm, LDR, nước; online/offline | Dashboard chạy được, ảnh giao diện | [nodered/orchid-flow.json](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/nodered/orchid-flow.json) (Tab Dashboard) | [x] **PASS** |
| **T7** | Cài đặt Rule đèn theo lịch và độ sáng, Rule quạt sau chu kỳ phun sương | Flow export và event log | [nodered/orchid-flow.json](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/nodered/orchid-flow.json) (Tab Week 7) | [x] **PASS** |
| **T8** | Ghép firmware Wokwi + MQTT + Node-RED, chạy uplink liên tục 15 phút, khớp số liệu | Log uplink và ảnh dashboard khớp Serial | [test-results/tuan8-e2e-integration-m4.md](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/test-results/tuan8-e2e-integration-m4.md) | [x] **PASS** |
| **T9** | Chạy lại toàn bộ test case (Tuần 3, 7, 8), lập test report và sửa lỗi độ bền | Test report có bằng chứng | [test-results/tuan7-test-matrix.md](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/test-results/tuan7-test-matrix.md) | [x] **PASS** |

---

### 👤 NGƯỜI 2: NODE-RED NHẬN DỮ LIỆU, DOWNLINK & TÀI LIỆU KỸ THUẬT
| Tuần | Nhiệm vụ chi tiết | Deliverables yêu cầu | Vị trí file / Minh chứng | Trạng thái |
| :---: | :--- | :--- | :--- | :---: |
| **T4** | Dựng Node-RED kết nối broker EMQX, subscribe telemetry, state, availability | Flow Node-RED cơ bản | [nodered/orchid-flow.json](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/nodered/orchid-flow.json) | [x] **PASS** |
| **T5** | Lưu lịch sử relay và cảnh báo vào `orchid-history.jsonl`, thêm cảnh báo offline | File export flow, file lịch sử | [orchid-history.jsonl](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/orchid-history.jsonl) | [x] **PASS** |
| **T6** | Làm nút điều khiển mist/fan/light chọn AUTO/MANUAL, nhận ACK, cấu hình đăng nhập | Lệnh đi đúng topic/payload, xử lý ACK | [nodered/orchid-flow.json](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/nodered/orchid-flow.json) | [x] **PASS** |
| **T7** | Thống nhất quy tắc chăm sóc ban đêm, xử lý tình huống DHT lỗi, khóa cạn nước | Kịch bản abnormal có log an toàn | [test-results/tuan7-test-matrix.md](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/test-results/tuan7-test-matrix.md) | [x] **PASS** |
| **T8** | Kiểm thử lệnh từ dashboard xuống relay trong simulation, test ghi đè AUTO/MANUAL | Log lệnh: gửi, nhận, đổi relay, ACK | [test-results/tuan8-e2e-integration-m4.md](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/test-results/tuan8-e2e-integration-m4.md) | [x] **PASS** |
| **T9** | Sơ đồ kiến trúc 4 tầng bản cuối, ảnh wiring `diagram.json`, bảng topic map | Kiến trúc, wiring, topic map, README | [README.md](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/README.md), [diagram.json](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/diagram.json) | [x] **PASS** |

---

### 👤 NGƯỜI 3: CẢNH BÁO TELEGRAM, GHÉP LUỒNG E2E, DEMO & BÁO CÁO
| Tuần | Nhiệm vụ chi tiết | Deliverables yêu cầu | Vị trí file / Minh chứng | Trạng thái |
| :---: | :--- | :--- | :--- | :---: |
| **T4** | Viết Test Plan uplink/downlink, rà soát topic và payload chuẩn | File kế hoạch kiểm thử | [test-results/mqtt-test-plan.md](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/test-results/mqtt-test-plan.md) | [x] **PASS** |
| **T5** | Rule automation offline > 5 phút, nút AUTO, test Water Lockout, tổng hợp evidence | File kết quả test, log evidence | [test-results/mqtt-test-results.md](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/test-results/mqtt-test-results.md) | [x] **PASS** |
| **T6** | Cảnh báo Telegram khi nước thấp/offline/nhiệt độ cao, Whitelist chat ID, Ghép luồng E2E | Bằng chứng E2E, báo cáo Tuần 6 | [test-results/tuan6-e2e-integration.md](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/test-results/tuan6-e2e-integration.md) | [x] **PASS** |
| **T7** | Lập Test Matrix trung thực (10 TC), kiểm thử Automation & Tình huống bất thường | Bảng ma trận test, phân định HW vs Sim | [test-results/tuan7-test-matrix.md](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/test-results/tuan7-test-matrix.md) | [x] **PASS** |
| **T8** | Chạy kịch bản 4 tầng lặp lại (M4 Repeatability), Test đứt mạng LWT & Reconnect, Lập Bug Tracker | Báo cáo M4, Bug list, Script M4 | [test-results/tuan8-e2e-integration-m4.md](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/test-results/tuan8-e2e-integration-m4.md), [run_m4_reconnection_test.py](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/test-results/run_m4_reconnection_test.py) | [x] **PASS** |
| **T9** | Kịch bản video demo 2-3 phút, Bản nháp Báo cáo tổng kết đồ án, Dàn ý Slide, Script kiểm tra máy sạch | Báo cáo đồ án, Slide deck, Video guide, Clean script | [tuan9-bao-cao-do-an-nhap.md](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/test-results/tuan9-bao-cao-do-an-nhap.md), [tuan9-slide-thuyet-trinh.md](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/test-results/tuan9-slide-thuyet-trinh.md), [demo-guide-video.md](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/test-results/demo-guide-video.md), [verify_clean_install.py](file:///c:/Users/ADMIN/OneDrive/M%C3%A1y%20t%C3%ADnh/orhid_ng%C6%B0%E1%BB%9Di3/test-results/verify_clean_install.py) | [x] **PASS** |

---

## 2. ĐÁNH GIÁ NGUYÊN TẮC NGHIỆM THU CỦA ĐỒ ÁN
- [x] **Nguyên tắc "Không thêm tính năng lớn ở Tuần 9":** Hệ thống tập trung chuẩn hóa tài liệu, sửa lỗi và tối ưu độ ổn định.
- [x] **Nguyên tắc "M4 chạy lặp lại nhiều lần":** Đã chạy thực nghiệm tự động 5/5 chu kỳ liên tiếp thành công, không dựa vào may mắn.
- [x] **Nguyên tắc "Trung thực trong kiểm thử":** Phân định rạch ròi kết quả trên Simulation và Phần cứng thật; ghi nhận đầy đủ Bug Tracker.
- [x] **Khả năng tái hiện (Reproducibility):** Bất kỳ máy tính nào cài Node.js, Python và PlatformIO đều có thể chạy lại từ đầu mà không gặp lỗi.
