"""
ESP32 Firmware Simulation & Live MQTT Runner for Orchid-01
Mô phỏng chính xác hành vi của firmware src/main.cpp:
- Kết nối MQTT broker (broker.emqx.io:1883)
- Availability: 'online' và LWT 'offline'
- Định kỳ publish Telemetry (mỗi 2.5s)
- Publish State: mist, fan, light, mist_state, water_lockout, mode
- Subscribe cmd/mist, cmd/fan, cmd/light
- Phản hồi ACK: APPLIED hoặc REJECTED (với reason)
- Quản lý TTL cho lệnh MANUAL, tự động trở về AUTO khi hết hạn
- Quản lý an toàn cạn nước (Water Lockout) và thời gian phun tối đa
"""

import sys
import json
import time
import threading
import paho.mqtt.client as mqtt

# Ensure UTF-8 output encoding for Windows terminal
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

BROKER = "broker.emqx.io"
PORT = 1883
DEVICE_ID = "orchid-01"
BASE_TOPIC = f"garden/orchid/{DEVICE_ID}"

# Trạng thái giả lập cảm biến
sensors = {
    "temperature_c": 28.5,
    "humidity_pct": 65.0,
    "light_adc": 1500,     # < 1800: đủ sáng, >= 2200: tối
    "water_adc": 1800      # >= 1500: đầy, < 1200: cạn
}

# Trạng thái relay và an toàn
relays = {
    "mist": "OFF",
    "fan": "OFF",
    "light": "OFF"
}

overrides = {
    "mist": {"active": False, "on": False, "expire_at": 0},
    "fan": {"active": False, "on": False, "expire_at": 0},
    "light": {"active": False, "on": False, "expire_at": 0}
}

mist_state = "IDLE"  # IDLE, RUNNING, COOLDOWN, WATER_LOCKOUT
water_lockout = False
running = True

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, f"wokwi-esp32-{DEVICE_ID}")

def get_mode():
    if any(ov["active"] for ov in overrides.values()):
        return "MANUAL"
    return "AUTO"

def publish_state():
    global mist_state, water_lockout
    # Xác định trạng thái an toàn
    water_lockout = sensors["water_adc"] < 1200
    if water_lockout:
        mist_state = "WATER_LOCKOUT"
        if relays["mist"] == "ON":
            relays["mist"] = "OFF"
            print("🚨 [SAFETY] Water level low! Mist relay FORCE OFF (WATER_LOCKOUT)")
    
    state_doc = {
        "mist": relays["mist"],
        "fan": relays["fan"],
        "light": relays["light"],
        "mist_state": mist_state,
        "water_lockout": water_lockout,
        "mode": get_mode()
    }
    client.publish(f"{BASE_TOPIC}/state", json.dumps(state_doc), retain=True)

def publish_telemetry():
    telemetry_doc = {
        "temperature_c": sensors["temperature_c"],
        "humidity_pct": sensors["humidity_pct"],
        "light_adc": sensors["light_adc"],
        "water_adc": sensors["water_adc"]
    }
    client.publish(f"{BASE_TOPIC}/telemetry", json.dumps(telemetry_doc))
    print(f"📡 [TELEMETRY] T={sensors['temperature_c']}°C, H={sensors['humidity_pct']}%, Light={sensors['light_adc']}, Water={sensors['water_adc']}")

def on_connect(cli, userdata, flags, reason_code, properties=None):
    print(f"✅ [MQTT] ESP32 Connected to {BROKER}:{PORT} (code: {reason_code})")
    cli.publish(f"{BASE_TOPIC}/availability", "online", retain=True)
    cli.subscribe(f"{BASE_TOPIC}/cmd/#")
    print(f"👂 [MQTT] Subscribed to {BASE_TOPIC}/cmd/#")
    publish_state()

def on_message(cli, userdata, msg):
    global mist_state
    topic = msg.topic
    payload_str = msg.payload.decode('utf-8')
    relay_name = topic.split('/')[-1]
    
    print(f"\n📩 [COMMAND RECEIVED] Topic: {topic} | Payload: {payload_str}")
    try:
        doc = json.loads(payload_str)
    except Exception as e:
        print(f"❌ [COMMAND ERROR] Invalid JSON: {e}")
        return

    req_id = doc.get("request_id", "")
    mode = doc.get("mode", "")
    
    if not req_id:
        print("❌ [COMMAND ERROR] Missing request_id")
        return
        
    if mode == "AUTO":
        overrides[relay_name]["active"] = False
        # Nếu là AUTO, trả về trạng thái mặc định
        relays[relay_name] = "OFF"
        if relay_name == "mist" and mist_state == "RUNNING":
            mist_state = "IDLE"
        ack = {"request_id": req_id, "result": "APPLIED", "reason": "AUTO"}
        cli.publish(f"{BASE_TOPIC}/ack", json.dumps(ack))
        publish_state()
        print(f"👌 [ACK] {req_id} -> APPLIED (mode=AUTO for {relay_name})")
        return

    if mode == "MANUAL":
        state_req = doc.get("state", "").upper()
        ttl_s = doc.get("ttl_s", 0)
        
        if state_req not in ["ON", "OFF"]:
            ack = {"request_id": req_id, "result": "REJECTED", "reason": "INVALID_STATE"}
            cli.publish(f"{BASE_TOPIC}/ack", json.dumps(ack))
            print(f"🚫 [ACK] {req_id} -> REJECTED (INVALID_STATE)")
            return
            
        if not (1 <= ttl_s <= 3600):
            ack = {"request_id": req_id, "result": "REJECTED", "reason": "INVALID_TTL"}
            cli.publish(f"{BASE_TOPIC}/ack", json.dumps(ack))
            print(f"🚫 [ACK] {req_id} -> REJECTED (INVALID_TTL)")
            return

        # Kiểm tra an toàn cho Mist (Water Lockout)
        if relay_name == "mist" and state_req == "ON":
            if sensors["water_adc"] < 1200 or mist_state == "WATER_LOCKOUT":
                ack = {"request_id": req_id, "result": "REJECTED", "reason": "WATER_LOCKOUT"}
                cli.publish(f"{BASE_TOPIC}/ack", json.dumps(ack))
                print(f"🚫 [ACK SAFETY] {req_id} -> REJECTED (WATER_LOCKOUT)")
                return

        # Áp dụng lệnh
        overrides[relay_name]["active"] = True
        overrides[relay_name]["on"] = (state_req == "ON")
        overrides[relay_name]["expire_at"] = time.time() + ttl_s
        relays[relay_name] = state_req
        if relay_name == "mist":
            mist_state = "RUNNING" if state_req == "ON" else "IDLE"

        ack = {"request_id": req_id, "result": "APPLIED"}
        cli.publish(f"{BASE_TOPIC}/ack", json.dumps(ack))
        publish_state()
        print(f"⚡ [RELAY] {relay_name.upper()} turned {state_req} for {ttl_s}s (req_id: {req_id})")
        print(f"👌 [ACK] {req_id} -> APPLIED")

def telemetry_loop():
    while running:
        # Kiểm tra hết hạn TTL của các lệnh MANUAL
        now = time.time()
        for r_name, ov in overrides.items():
            if ov["active"] and now >= ov["expire_at"]:
                ov["active"] = False
                relays[r_name] = "OFF"
                print(f"⏱️ [TTL EXPIRED] Override expired for {r_name} -> Reverted to AUTO (OFF)")
                publish_state()
                
        publish_telemetry()
        time.sleep(2.5)

def main():
    global running
    print("=" * 65)
    print("🚀 KHỞI ĐỘNG VIRTUAL ESP32 FIRMWARE RUNNER (ORCHID-01)")
    print("Mô phỏng đầy đủ: Telemetry, State, Downlink Commands, ACK, TTL & Safety")
    print("=" * 65)
    
    # Thiết lập LWT
    client.will_set(f"{BASE_TOPIC}/availability", "offline", qos=1, retain=True)
    client.on_connect = on_connect
    client.on_message = on_message
    
    client.connect(BROKER, PORT, 60)
    client.loop_start()
    
    t_thread = threading.Thread(target=telemetry_loop, daemon=True)
    t_thread.start()
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n🛑 Đang dừng ESP32 Runner...")
        running = False
        client.publish(f"{BASE_TOPIC}/availability", "offline", retain=True)
        client.loop_stop()
        client.disconnect()
        print("Đã tắt ESP32 và gửi Last Will offline.")

if __name__ == "__main__":
    main()

