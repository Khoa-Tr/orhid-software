// BUG-02: gui thang len broker 3 goi dai (bo qua gateway) va cho ACK cua firmware.
// Cach dung: node check-bug02.cjs <file log>  (can firmware dang chay va ket noi broker; tat Node-RED khong bat buoc)
//  R1 lenh fan 300 byte (truoc day >= 256 byte bi bo, khong ACK)     -> APPLIED
//  R2 config du 8 nguong, JSON xuong dong ~330 byte (gia tri mac dinh) -> APPLIED CONFIG
//  R3 lenh fan ~420 byte (vuot 384)                                     -> REJECTED PAYLOAD_TOO_LARGE
//  R4 tra fan ve AUTO
const fs = require("node:fs");
const path = require("node:path");
const mqtt = require(process.env.W8_NODE_MODULES ? path.join(process.env.W8_NODE_MODULES, "mqtt") : "mqtt");
const out = process.argv[2];
const P = "garden/orchid/orchid-01";
const log = (line) => { const text = `${new Date().toISOString()} ${line}`; console.log(text); fs.appendFileSync(out, text + "\n"); };
const pad = (payload, size) => { payload.note = ""; const base = JSON.stringify(payload).length; payload.note = "x".repeat(Math.max(0, size - base)); return payload; };
const stamp = Date.now().toString(36);
const cases = [
  { id: "R1", topic: `${P}/cmd/fan`, body: () => JSON.stringify(pad({ request_id: `big300-${stamp}`, mode: "MANUAL", state: "OFF", ttl_s: 60 }, 300)), expect: (ack) => ack.result === "APPLIED" },
  { id: "R2", topic: `${P}/config`, body: () => JSON.stringify({ request_id: `cfgbig-${stamp}`, mist_rh_on: 65, mist_rh_off: 80, fan_temp_on: 33, fan_temp_off: 31, light_on_adc: 2200, light_off_adc: 1800, water_low_adc: 1200, water_refilled_adc: 1500 }, null, 10), expect: (ack) => ack.result === "APPLIED" && ack.reason === "CONFIG" },
  { id: "R3", topic: `${P}/cmd/fan`, body: () => JSON.stringify(pad({ request_id: `big420-${stamp}`, mode: "MANUAL", state: "OFF", ttl_s: 60 }, 420)), expect: (ack) => ack.result === "REJECTED" && ack.reason === "PAYLOAD_TOO_LARGE" },
  { id: "R4", topic: `${P}/cmd/fan`, body: () => JSON.stringify({ request_id: `auto-${stamp}`, mode: "AUTO" }), expect: (ack) => ack.result === "APPLIED" },
];
const client = mqtt.connect("mqtt://broker.emqx.io:1883", { clientId: `orchid-bug02-${stamp}` });
const acks = new Map();
client.on("message", (topic, payload) => { try { const ack = JSON.parse(payload.toString()); acks.set(ack.request_id, ack); } catch {} });
client.on("connect", async () => {
  await client.subscribeAsync(`${P}/ack`, { qos: 1 });
  let failed = 0;
  for (const item of cases) {
    const body = item.body();
    const id = JSON.parse(body).request_id;
    log(`${item.id} send ${item.topic} ${body.length} bytes request_id=${id}`);
    await client.publishAsync(item.topic, body, { qos: 1 });
    const start = Date.now();
    while (!acks.has(id) && Date.now() - start < 30000) await new Promise((resolve) => setTimeout(resolve, 200));
    const ack = acks.get(id);
    const ok = ack && item.expect(ack);
    if (!ok) failed += 1;
    log(`${item.id} ${ok ? "PASS" : "FAIL"} ack=${ack ? JSON.stringify(ack) : "none within 30 s"} after ${Date.now() - start} ms`);
  }
  log(failed ? `BUG-02 check FAIL (${failed})` : "BUG-02 check PASS");
  client.end();
  process.exit(failed ? 1 : 0);
});
