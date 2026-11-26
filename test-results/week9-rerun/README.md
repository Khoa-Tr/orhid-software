# Bằng chứng chạy lại test tuần 9 (2026-10-22)

Báo cáo: [`../tuan9-test-report-nguoi1.md`](../tuan9-test-report-nguoi1.md).

| Thư mục / file | Nội dung |
| --- | --- |
| `sach/` | Lượt chạy Wokwi CI sạch (firmware không nhận lệnh MQTT nào từ ngoài): `fan-temp` đạt, `mist-water` khớp 8 bước đầu rồi hết 5 phút, các scenario sau báo hết quota CI tháng (`luot-sach-console.log`) |
| `co-node-red-chen-lenh/` | Ba lượt Wokwi CI trước đó, lúc một Node-RED thử nghiệm còn chạy nền và gửi lệnh (dòng `CMD rx`) xuống firmware đang test. Log màn hình gồm Serial và từng bước `Expected text matched` |
| `nodered-test-flow.log` | Kết quả `node nodered/test-flow.cjs` (200 assert) |
| `m4-lap-lai/` | 3 vòng D1→D10 liên tiếp + kiểm tra BUG-02 trên Wokwi VS Code: `serial.log`, `mqtt-wire.log`, `node-red-history.jsonl`, `driver.log`, `bug02-check.log`, bảng lệnh `vong1…3-downlink-table.md` / `.csv`, ảnh dashboard vòng cuối `img/` |
