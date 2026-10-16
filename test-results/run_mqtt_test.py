import paho.mqtt.client as mqtt
import json
import time
import sys

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

broker = "broker.emqx.io"
port = 1883
base_topic = "garden/orchid/orchid-01"

test_passed = False
ack_received = False
state_received = False
req_id = f"req-test-{int(time.time())}"

def on_connect(client, userdata, flags, reason_code, properties=None):
    print(f"[TEST] Connected to broker: {broker} (Result code: {reason_code})")
    client.subscribe(f"{base_topic}/ack")
    client.subscribe(f"{base_topic}/state")
    time.sleep(1)
    
    # Gửi lệnh chuẩn firmware: request_id, mode: MANUAL, state: "ON", ttl_s: 10
    cmd = {
        "request_id": req_id,
        "mode": "MANUAL",
        "state": "ON",
        "ttl_s": 10
    }
    print(f"[TEST] Publishing firmware-compliant command to {base_topic}/cmd/mist: {cmd}")
    client.publish(f"{base_topic}/cmd/mist", json.dumps(cmd))

def on_message(client, userdata, msg):
    global ack_received, state_received
    topic = msg.topic
    payload = msg.payload.decode('utf-8')
    
    if topic.endswith("/ack"):
        print(f"[TEST] Received ACK: {payload}")
        try:
            data = json.loads(payload)
            if data.get("request_id") == req_id:
                if data.get("result") == "APPLIED":
                    print(f" -> ACK matched: APPLIED successfully for {req_id}")
                    ack_received = True
                elif data.get("result") == "REJECTED":
                    print(f" -> ACK REJECTED: reason={data.get('reason')}")
        except Exception as e:
            print(f" -> Error parsing ACK JSON: {e}")
            
    if topic.endswith("/state"):
        print(f"[TEST] Received State: {payload}")
        try:
            data = json.loads(payload)
            # Firmware trả về "ON" / "OFF" dạng string
            if data.get("mist") == "ON":
                state_received = True
                print(" -> State matched: mist is ON")
        except Exception as e:
            print(f" -> Error parsing State JSON: {e}")

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, "orchid-tester-nguoi3")
client.on_connect = on_connect
client.on_message = on_message

print(f"[TEST] Starting MQTT E2E Test on {broker}:{port} ...")
client.connect(broker, port, 60)
client.loop_start()

timeout = 12
start_time = time.time()
while time.time() - start_time < timeout:
    if ack_received and state_received:
        print("\n=> [RESULT] TEST PASSED! The ESP32 successfully received the firmware-compliant command, activated mist relay, and returned ACK APPLIED & State updates!")
        test_passed = True
        break
    time.sleep(0.5)

if not test_passed:
    print(f"\n=> [RESULT] TEST TIMEOUT. ack_received={ack_received}, state_received={state_received}. Please ensure Wokwi simulation / ESP32 is running and connected to WiFi & EMQX.")

client.loop_stop()
client.disconnect()
