"""
Kịch bản Kiểm tra Môi trường Sạch (Clean Environment Reproducibility Verification)
Tác giả: Người 3 (Tuần 9)
Mục tiêu: Đảm bảo bất kỳ ai clone project về một máy tính mới hoặc thư mục sạch
đều có thể chạy lại từ đầu mà không gặp lỗi thiếu file hoặc sai cú pháp.
"""

import os
import sys
import json
import socket

# Đảm bảo UTF-8 cho Windows console
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

REQUIRED_FILES = [
    "platformio.ini",
    "requirements.txt",
    "README.md",
    "diagram.json",
    "wokwi.toml",
    "calibration-log.csv",
    os.path.join("src", "main.cpp"),
    os.path.join("nodered", "orchid-flow.json"),
    os.path.join("test-results", "tuan8-e2e-integration-m4.md"),
    os.path.join("test-results", "tuan9-bao-cao-do-an-nhap.md"),
    os.path.join("test-results", "tuan9-slide-thuyet-trinh.md"),
    os.path.join("test-results", "checklist-deliverables.md"),
    os.path.join("test-results", "run_e2e_test_suite.py"),
    os.path.join("test-results", "run_m4_reconnection_test.py")
]

def check_file_presence():
    print("=" * 70)
    print("BƯỚC 1: KIỂM TRA SỰ TỒN TẠI CỦA CÁC FILE CỐT LÕI (CORE FILES)")
    print("=" * 70)
    all_ok = True
    for f in REQUIRED_FILES:
        exists = os.path.isfile(f)
        status = "[OK]  " if exists else "[MISS]"
        print(f" {status} {f}")
        if not exists:
            all_ok = False
    return all_ok

def check_json_validity():
    print("\n" + "=" * 70)
    print("BƯỚC 2: KIỂM TRA CÚ PHÁP CÁC FILE CẤU HÌNH JSON")
    print("=" * 70)
    json_files = ["diagram.json", os.path.join("nodered", "orchid-flow.json")]
    all_ok = True
    for jf in json_files:
        try:
            with open(jf, "r", encoding="utf-8") as f:
                data = json.load(f)
            node_count = len(data) if isinstance(data, list) else len(data.get("parts", []))
            print(f" [OK]   {jf} (JSON hợp lệ, chứa {node_count} phần tử)")
        except Exception as e:
            print(f" [FAIL] {jf} Lỗi cú pháp JSON: {e}")
            all_ok = False
    return all_ok

def check_network_reachability():
    print("\n" + "=" * 70)
    print("BƯỚC 3: KIỂM TRA KẾT NỐI TỚI BROKER MQTT PUBLIC (broker.emqx.io:1883)")
    print("=" * 70)
    host = "broker.emqx.io"
    port = 1883
    try:
        sock = socket.create_connection((host, port), timeout=5)
        sock.close()
        print(f" [OK]   Đã kết nối thành công tới {host}:{port} qua TCP Socket.")
        return True
    except Exception as e:
        print(f" [WARN] Không thể kết nối tới {host}:{port}: {e}")
        print("        (Lưu ý: Có thể do mạng trường/công ty chặn cổng 1883).")
        return False

def check_python_dependencies():
    print("\n" + "=" * 70)
    print("BƯỚC 4: KIỂM TRA CÁC THƯ VIỆN PYTHON CẦN THIẾT")
    print("=" * 70)
    required_packages = ["paho.mqtt"]
    all_ok = True
    for pkg in required_packages:
        try:
            __import__(pkg)
            print(f" [OK]   Thư viện Python: {pkg}")
        except ImportError:
            print(f" [FAIL] Thiếu thư viện Python: {pkg} (Cài đặt bằng: pip install paho-mqtt)")
            all_ok = False
    return all_ok

def main():
    print("=" * 70)
    print("KIỂM THỬ KHẢ NĂNG TÁI HIỆN MÔI TRƯỜNG SẠCH (CLEAN INSTALL VERIFY)")
    print("=" * 70)
    
    ok1 = check_file_presence()
    ok2 = check_json_validity()
    ok3 = check_network_reachability()
    ok4 = check_python_dependencies()
    
    print("\n" + "=" * 70)
    overall = ok1 and ok2 and ok4
    print(f"TỔNG KẾT KHẢ NĂNG TÁI HIỆN TOÀN DỰ ÁN: {'[ĐẠT CHUẨN 100%]' if overall else '[CẦN KIỂM TRA LẠI]'}")
    print("=" * 70)
    sys.exit(0 if overall else 1)

if __name__ == "__main__":
    main()
