// Thiet bi mo phong noi theo dung giao thuc MQTT cua firmware (telemetry/state/availability/cmd/ack),
// dung de thu dashboard va rule tuan 6-7 khi khong chay Wokwi. Day KHONG phai firmware: logic an toan that
// nam trong src/main.cpp va duoc kiem tra bang scenario Wokwi.
//
//   node nodered/sim-device.cjs [--host broker.emqx.io] [--port 1883] [--device orchid-01]
//                               [--scenario fault-demo|none] [--fast] [--log file.log]
//
// Lenh go tu ban phim khi dang chay: rh <so> | temp <so> | light dark|bright|<adc> | water low|ok|<adc>
//   dht fault|ok | drop-cmd on|off | link drop <giay> | status | quit
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const readline = require("node:readline");
const { EventEmitter } = require("node:events");

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}
const host = option("--host", process.env.MQTT_HOST || "broker.emqx.io");
const port = Number(option("--port", process.env.MQTT_PORT || 1883));
const deviceId = option("--device", "orchid-01");
const scenarioName = option("--scenario", "none");
const fast = process.argv.includes("--fast");
const logFile = option("--log", null);
const base = `garden/orchid/${deviceId}`;

// Cung nguong voi src/main.cpp; --fast giong build ORCHID_TIMER_TEST (phun 15 s, cooldown 10 s).
const T = {
  mistOn: 65, mistOff: 80, fanTempOn: 33, fanTempOff: 31, fanHumOn: 90, fanHumOff: 85,
  lightOn: 2200, lightOff: 1800, waterLow: 1200, waterRefilled: 1500,
  maxMistMs: fast ? 15000 : 120000, cooldownMs: fast ? 10000 : 60000, sampleMs: 2500, dhtFaultAfter: 3,
};

function log(line) {
  const text = `${new Date().toISOString()} ${line}`;
  console.log(text);
  if (logFile) fs.appendFileSync(logFile, text + "\n");
}

// ---------------- MQTT 3.1.1 client toi thieu (khong can package) ----------------
const utf8 = (value) => {
  const bytes = Buffer.from(value);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(bytes.length);
  return Buffer.concat([length, bytes]);
};
const remaining = (length) => {
  const bytes = [];
  do {
    let digit = length % 128;
    length = Math.floor(length / 128);
    if (length > 0) digit |= 0x80;
    bytes.push(digit);
  } while (length > 0);
  return Buffer.from(bytes);
};
const packet = (header, body) => Buffer.concat([Buffer.from([header]), remaining(body.length), body]);

class MiniMqtt extends EventEmitter {
  constructor({ clientId, will }) {
    super();
    this.clientId = clientId;
    this.will = will;
    this.packetId = 0;
    this.buffer = Buffer.alloc(0);
    this.connected = false;
  }

  connect() {
    this.socket = net.connect(port, host);
    this.socket.on("connect", () => {
      const willPayload = Buffer.from(this.will.payload);
      const flags = 0x02 | 0x04 | (this.will.qos << 3) | (this.will.retain ? 0x20 : 0);
      const variable = Buffer.concat([utf8("MQTT"), Buffer.from([4, flags, 0, 30])]);
      const willLength = Buffer.alloc(2);
      willLength.writeUInt16BE(willPayload.length);
      this.socket.write(packet(0x10, Buffer.concat([variable, utf8(this.clientId), utf8(this.will.topic), willLength, willPayload])));
    });
    this.socket.on("data", (chunk) => this.onData(chunk));
    this.socket.on("error", (error) => this.emit("error", error));
    this.socket.on("close", () => {
      clearInterval(this.ping);
      const was = this.connected;
      this.connected = false;
      if (was) this.emit("close");
    });
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      let multiplier = 1;
      let length = 0;
      let offset = 1;
      let digit;
      do {
        if (offset >= this.buffer.length) return;
        digit = this.buffer[offset++];
        length += (digit & 0x7f) * multiplier;
        multiplier *= 128;
      } while (digit & 0x80);
      if (this.buffer.length < offset + length) return;
      const header = this.buffer[0];
      const body = this.buffer.subarray(offset, offset + length);
      this.buffer = this.buffer.subarray(offset + length);
      this.onPacket(header, body);
    }
  }

  onPacket(header, body) {
    const type = header >> 4;
    if (type === 2) {
      if (body[1] !== 0) {
        this.emit("error", new Error(`CONNACK refused (${body[1]})`));
        this.socket.destroy();
        return;
      }
      this.connected = true;
      this.ping = setInterval(() => this.socket.write(Buffer.from([0xc0, 0])), 15000);
      this.emit("connect");
    } else if (type === 3) {
      const qos = (header >> 1) & 0x03;
      const topicLength = body.readUInt16BE(0);
      const topic = body.subarray(2, 2 + topicLength).toString();
      let index = 2 + topicLength;
      if (qos > 0) {
        const id = body.readUInt16BE(index);
        index += 2;
        this.socket.write(Buffer.from([0x40, 2, id >> 8, id & 0xff]));
      }
      this.emit("message", topic, body.subarray(index).toString());
    }
  }

  nextId() {
    this.packetId = (this.packetId % 65535) + 1;
    return this.packetId;
  }

  publish(topic, payload, { retain = false } = {}) {
    if (!this.connected) return;
    this.socket.write(packet(0x30 | (retain ? 1 : 0), Buffer.concat([utf8(topic), Buffer.from(payload)])));
  }

  subscribe(topics) {
    const id = this.nextId();
    const parts = [Buffer.from([id >> 8, id & 0xff])];
    for (const topic of topics) parts.push(utf8(topic), Buffer.from([1]));
    this.socket.write(packet(0x82, Buffer.concat(parts)));
  }

  // Dong TCP dot ngot (khong gui DISCONNECT) de broker phat LWT, giong mat mang that.
  drop() {
    this.socket.destroy();
  }

  end() {
    if (this.connected) this.socket.write(Buffer.from([0xe0, 0]));
    this.socket.end();
  }
}

// ---------------- Mo hinh thiet bi (cung giao thuc va khoa an toan voi firmware) ----------------
const sim = {
  temperature: 28, humidity: 72, lightAdc: 900, waterAdc: 2400,
  dhtBroken: false, dhtFailStreak: 0, dhtFault: false, dropCommands: false,
  mist: "IDLE", mistSince: Date.now(), fanAuto: false, lightAuto: false,
  overrides: { mist: null, fan: null, light: null },
  manualRun: null, relays: { mist: false, fan: false, light: false },
};
let client = null;
let linkDownUntil = 0;
let reconnectTimer = null;

const waterLockout = () => sim.mist === "WATER_LOCKOUT" || sim.waterAdc < T.waterLow;
const setMist = (next, reason = "") => {
  if (next === sim.mist) return;
  log(`STATE mist ${sim.mist} -> ${next}${reason ? ` (${reason})` : ""}`);
  sim.mist = next;
  sim.mistSince = Date.now();
};

function applyRelays() {
  const now = Date.now();
  for (const relay of ["mist", "fan", "light"]) {
    const override = sim.overrides[relay];
    if (override && now >= override.until) {
      sim.overrides[relay] = null;
      log(`override expired: ${relay} -> AUTO`);
    }
  }
  if (sim.manualRun !== null && now - sim.manualRun >= T.maxMistMs) {
    sim.overrides.mist = null;
    setMist("COOLDOWN", "manual mist safety limit");
  }
  if (sim.overrides.mist?.on && (waterLockout() || sim.mist === "SENSOR_FAULT")) {
    sim.overrides.mist = null;
    log(`mist override cancelled: ${sim.mist === "SENSOR_FAULT" ? "SENSOR_FAULT" : "WATER_LOCKOUT"}`);
  }
  const safeForManual = !waterLockout() && !["COOLDOWN", "SENSOR_FAULT"].includes(sim.mist);
  const mistOverride = sim.overrides.mist;
  sim.relays.mist = mistOverride ? mistOverride.on && safeForManual : sim.mist === "RUNNING";
  sim.relays.fan = sim.overrides.fan ? sim.overrides.fan.on : sim.fanAuto;
  sim.relays.light = sim.overrides.light ? sim.overrides.light.on : sim.lightAuto;
  const manualOn = sim.relays.mist && mistOverride?.on;
  if (manualOn && sim.manualRun === null) sim.manualRun = now;
  if (!manualOn && sim.manualRun !== null) {
    sim.manualRun = null;
    if (sim.mist === "IDLE" || sim.mist === "RUNNING") setMist("COOLDOWN", "manual mist run ended");
  }
}

function sample() {
  const now = Date.now();
  if (sim.dhtBroken) {
    sim.dhtFailStreak += 1;
    log(`DHT22 read failed (${sim.dhtFailStreak} consecutive)`);
    if (!sim.dhtFault && sim.dhtFailStreak >= T.dhtFaultAfter) {
      sim.dhtFault = true;
      log("FAULT DHT22 consecutive read failures; mist AUTO blocked");
    }
  } else {
    if (sim.dhtFault) log("RECOVERED DHT22");
    sim.dhtFailStreak = 0;
    sim.dhtFault = false;
  }
  const climateValid = !sim.dhtFault;
  const waterLow = sim.waterAdc < T.waterLow;
  const held = sim.overrides.mist && !sim.overrides.mist.on;
  const elapsed = now - sim.mistSince;
  switch (sim.mist) {
    case "IDLE":
      if (waterLow) setMist("WATER_LOCKOUT");
      else if (sim.dhtFault) setMist("SENSOR_FAULT");
      else if (climateValid && !held && sim.humidity < T.mistOn) setMist("RUNNING");
      break;
    case "RUNNING":
      if (waterLow) setMist("WATER_LOCKOUT");
      else if (sim.dhtFault) setMist("SENSOR_FAULT");
      else if (held) setMist("COOLDOWN", "AUTO mist held OFF");
      else if (sim.humidity >= T.mistOff) setMist("IDLE");
      else if (elapsed >= T.maxMistMs) setMist("COOLDOWN");
      break;
    case "COOLDOWN":
      if (waterLow) setMist("WATER_LOCKOUT");
      else if (elapsed >= T.cooldownMs) setMist("IDLE");
      break;
    case "WATER_LOCKOUT":
      if (sim.waterAdc >= T.waterRefilled) setMist("IDLE");
      break;
    case "SENSOR_FAULT":
      if (waterLow) setMist("WATER_LOCKOUT");
      else if (!sim.dhtFault) setMist("COOLDOWN", "sensor recovered");
      break;
  }
  if (climateValid) {
    if (!sim.fanAuto && (sim.temperature > T.fanTempOn || sim.humidity > T.fanHumOn)) sim.fanAuto = true;
    else if (sim.fanAuto && sim.temperature < T.fanTempOff && sim.humidity < T.fanHumOff) sim.fanAuto = false;
  }
  if (!sim.lightAuto && sim.lightAdc > T.lightOn) sim.lightAuto = true;
  else if (sim.lightAuto && sim.lightAdc < T.lightOff) sim.lightAuto = false;
  applyRelays();
  publishTelemetry();
  publishState();
}

function publishTelemetry() {
  if (!client?.connected) return;
  client.publish(`${base}/telemetry`, JSON.stringify({
    temperature_c: sim.dhtFault ? null : sim.temperature,
    humidity_pct: sim.dhtFault ? null : sim.humidity,
    light_adc: sim.lightAdc, water_adc: sim.waterAdc, dht_fail_streak: sim.dhtFailStreak,
  }));
}

function publishState() {
  if (!client?.connected) return;
  const modeOf = (relay) => (sim.overrides[relay] ? "MANUAL" : "AUTO");
  client.publish(`${base}/state`, JSON.stringify({
    mist: sim.relays.mist ? "ON" : "OFF", fan: sim.relays.fan ? "ON" : "OFF", light: sim.relays.light ? "ON" : "OFF",
    mist_state: sim.mist, water_lockout: waterLockout(), dht_fault: sim.dhtFault,
    mode: Object.values(sim.overrides).some(Boolean) ? "MANUAL" : "AUTO",
    mist_mode: modeOf("mist"), fan_mode: modeOf("fan"), light_mode: modeOf("light"),
  }), { retain: true });
}

function ack(requestId, result, reason) {
  const body = { request_id: requestId, result };
  if (reason) body.reason = reason;
  client.publish(`${base}/ack`, JSON.stringify(body));
  log(`ACK ${requestId} ${result}${reason ? ` ${reason}` : ""}`);
}

function onCommand(topic, text) {
  const relay = topic.slice(`${base}/cmd/`.length);
  if (sim.dropCommands) {
    log(`TEST command dropped without ACK: ${topic} ${text}`);
    return;
  }
  let command;
  try {
    command = JSON.parse(text);
  } catch {
    log(`command rejected: invalid JSON on ${topic}`);
    return;
  }
  log(`CMD ${relay} ${text}`);
  const requestId = typeof command.request_id === "string" ? command.request_id : "";
  if (!requestId) return;
  if (command.mode === "AUTO") {
    sim.overrides[relay] = null;
    applyRelays();
    ack(requestId, "APPLIED", "AUTO");
    publishState();
    return;
  }
  if (command.mode !== "MANUAL") return ack(requestId, "REJECTED", "INVALID_MODE");
  if (command.state !== "ON" && command.state !== "OFF") return ack(requestId, "REJECTED", "INVALID_STATE");
  const ttl = Number(command.ttl_s);
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > 3600) return ack(requestId, "REJECTED", "INVALID_TTL");
  const on = command.state === "ON";
  if (relay === "mist" && on) {
    if (waterLockout()) return ack(requestId, "REJECTED", "WATER_LOCKOUT");
    if (sim.mist === "SENSOR_FAULT") return ack(requestId, "REJECTED", "SENSOR_FAULT");
    if (sim.mist === "COOLDOWN") return ack(requestId, "REJECTED", "MIST_COOLDOWN");
  }
  sim.overrides[relay] = { on, until: Date.now() + ttl * 1000 };
  applyRelays();
  ack(requestId, "APPLIED");
  publishState();
}

function connect() {
  client = new MiniMqtt({
    clientId: `orchid-sim-${deviceId}-${crypto.randomBytes(3).toString("hex")}`,
    will: { topic: `${base}/availability`, payload: "offline", qos: 1, retain: true },
  });
  client.on("connect", () => {
    log(`MQTT connected to ${host}:${port} as device ${deviceId}`);
    client.publish(`${base}/availability`, "online", { retain: true });
    client.subscribe(["mist", "fan", "light"].map((relay) => `${base}/cmd/${relay}`));
    publishState();
  });
  client.on("message", (topic, text) => onCommand(topic, text));
  client.on("error", (error) => log(`MQTT error: ${error.message}`));
  client.on("close", () => {
    log("MQTT disconnected");
    if (Object.values(sim.overrides).some(Boolean)) {
      sim.overrides = { mist: null, fan: null, light: null };
      applyRelays();
    }
    log("SAFETY MQTT link lost; manual overrides cleared -> AUTO");
    scheduleReconnect();
  });
  client.connect();
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  const wait = Math.max(5000, linkDownUntil - Date.now());
  reconnectTimer = setTimeout(connect, wait);
}

function handle(line) {
  const [word, value, extra] = line.trim().toLowerCase().split(/\s+/);
  if (!word) return;
  if (word === "rh") sim.humidity = Number(value);
  else if (word === "temp") sim.temperature = Number(value);
  else if (word === "light") sim.lightAdc = value === "dark" ? 2600 : value === "bright" ? 900 : Number(value);
  else if (word === "water") sim.waterAdc = value === "low" ? 1000 : value === "ok" ? 2400 : Number(value);
  else if (word === "dht") sim.dhtBroken = value === "fault";
  else if (word === "drop-cmd") sim.dropCommands = value === "on";
  else if (word === "link" && value === "drop") {
    linkDownUntil = Date.now() + Number(extra || 15) * 1000;
    log(`TEST link drop for ${extra || 15}s (abrupt TCP close -> broker publishes LWT offline)`);
    client.drop();
    return;
  } else if (word === "status") {
    log(`SIM ${JSON.stringify({ ...sim, relays: sim.relays })}`);
    return;
  } else if (word === "quit") {
    client.end();
    process.exit(0);
  } else {
    log(`unknown command: ${line}`);
    return;
  }
  log(`SIM set ${line.trim()}`);
}

// Kich ban bat thuong co the lap lai: DHT loi khi dang phun, nuoc thap, lenh mat ACK, mat ket noi.
const SCENARIOS = {
  "fault-demo": [
    [0, "rh 72"], [8, "rh 60"], [20, "dht fault"], [38, "water low"], [52, "water ok"], [62, "dht ok"],
    [90, "rh 82"], [100, "drop-cmd on"], [125, "drop-cmd off"], [135, "link drop 20"], [175, "status"],
  ],
};

log(`SIM device=${deviceId} broker=${host}:${port} timers=${fast ? "fast 15s/10s" : "normal 120s/60s"} scenario=${scenarioName}`);
log("SIM this is a protocol simulator for Node-RED tests, not the ESP32 firmware");
connect();
setInterval(sample, T.sampleMs);
if (SCENARIOS[scenarioName]) {
  for (const [second, line] of SCENARIOS[scenarioName]) setTimeout(() => handle(line), second * 1000);
} else if (scenarioName !== "none") {
  log(`unknown scenario ${scenarioName}; available: ${Object.keys(SCENARIOS).join(", ")}`);
}
// Doc lenh tu ban phim, hoac tu stdin cua script test.
readline.createInterface({ input: process.stdin }).on("line", handle);
