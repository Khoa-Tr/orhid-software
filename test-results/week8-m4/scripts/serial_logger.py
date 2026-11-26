# Doc Serial cua Wokwi (VS Code) qua RFC2217 localhost:4000, ghi kem thoi diem; gui lenh tu file tx.
import datetime, os, sys, time
import serial

URL = "rfc2217://localhost:4000?ign_set_control"
out_path, tx_path = sys.argv[1], sys.argv[2]
now = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
log = open(out_path, "a", buffering=1, encoding="utf-8")
tx_pos = os.path.getsize(tx_path) if os.path.exists(tx_path) else 0
while True:
    try:
        port = serial.serial_for_url(URL, baudrate=115200, timeout=0.2)
    except Exception:
        time.sleep(2)
        continue
    log.write(f"{now()} # serial connected {URL}\n")
    buffer = b""
    try:
        while True:
            data = port.read(4096)
            if data:
                buffer += data
                while b"\n" in buffer:
                    line, buffer = buffer.split(b"\n", 1)
                    log.write(f"{now()} {line.decode('utf-8', 'replace').rstrip()}\n")
            if os.path.exists(tx_path) and os.path.getsize(tx_path) > tx_pos:
                with open(tx_path, "rb") as handle:
                    handle.seek(tx_pos)
                    chunk = handle.read()
                tx_pos += len(chunk)
                for line in chunk.splitlines():
                    port.write(line + b"\n")
                    log.write(f"{now()} >> TX {line.decode()}\n")
    except Exception as error:
        log.write(f"{now()} # serial disconnected: {error}\n")
        time.sleep(2)
