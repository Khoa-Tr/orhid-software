process.env.TZ = "Asia/Ho_Chi_Minh";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const flowPath = path.join(__dirname, "orchid-flow.json");
const nodes = JSON.parse(fs.readFileSync(flowPath, "utf8"));
const ids = new Set(nodes.map((node) => node.id));
const tabs = nodes.filter((node) => node.type === "tab");
const byId = (id) => nodes.find((node) => node.id === id);
const DEVICE = "garden/orchid/orchid-01";

assert.equal(ids.size, nodes.length, "Node IDs must be unique");
assert(tabs.length >= 5, "Expected at least 5 tabs (Week 5 tabs, Week 6 dashboard, Week 7 rules, and Người 3)");

for (const node of nodes) {
  if (node.z) assert(ids.has(node.z), `${node.id} must reference an existing tab`);
  for (const output of node.wires || []) {
    for (const target of output) assert(ids.has(target), `${node.id} has dangling wire ${target}`);
  }
  if (node.type === "mqtt in" || node.type === "mqtt out") {
    assert(ids.has(node.broker), `${node.id} must reference an existing MQTT broker`);
  }
  if (node.type === "function") {
    assert.equal(node.outputs, node.wires.length, `${node.id} output count must match its wires`);
  }
  if (node.type.startsWith("ui-") && node.group) assert(ids.has(node.group), `${node.id} must reference an existing group`);
  if (node.type === "link in" || node.type === "link out") {
    for (const peer of node.links) {
      assert(ids.has(peer), `${node.id} links to missing ${peer}`);
      assert(byId(peer).links.includes(node.id), `${node.id} and ${peer} must link both ways`);
    }
  }
}

// Week 6: chi mot cong lenh, khong retain, topic dong do gateway dat.
// Node bi tat (d: true) khong chay, nen chi xet node dang bat.
const mqttOut = nodes.filter((node) => node.type === "mqtt out" && node.d !== true);
assert.equal(mqttOut.length, 1, "Only the command gateway may publish MQTT");
assert.equal(mqttOut[0].qos, "1");
assert.equal(mqttOut[0].retain, "false", "Commands must never be retained");
assert.equal(mqttOut[0].topic, "", "Topic comes from the gateway");
const publishers = nodes.filter((node) => (node.wires || []).some((output) => output.includes(mqttOut[0].id)));
assert.deepEqual(publishers.map((node) => node.id), ["orchid-gateway"], "Only the gateway may feed MQTT out");
const buttons = nodes.filter((node) => node.type === "ui-button");
assert.deepEqual(buttons.map((node) => node.payload).sort(),
  ["fan:OFF", "fan:ON", "light:OFF", "light:ON", "mist:OFF", "mist:ON"]);
for (const button of buttons) assert.deepEqual(button.wires, [["orchid-control-ui"]]);
assert.equal(nodes.filter((node) => node.type === "ui-chart").length, 2, "Dashboard must include two history charts");
assert(nodes.some((node) => node.type === "mqtt in" && node.topic === `${DEVICE}/ack`), "Gateway must subscribe to ACKs");

function createContext() {
  const values = new Map();
  return {
    get(key) {
      return values.get(key);
    },
    set(key, value) {
      values.set(key, value);
    },
  };
}

let currentTime = Date.parse("2026-10-09T05:00:00.000Z");
const setNow = (timestamp) => {
  currentTime = timestamp;
};
class TestDate extends Date {
  constructor(...args) {
    super(...(args.length > 0 ? args : [currentTime]));
  }

  static now() {
    return currentTime;
  }
}

function createRunner(id, context = createContext(), globalContext = createContext(), { allowWarn = false } = {}) {
  const node = byId(id);
  assert(node && node.type === "function", `${id} must be a Function node`);
  const execute = new Function("msg", "flow", "global", "node", "Buffer", "Date", node.func);
  const run = (input) => {
    const message =
      input && (Object.hasOwn(input, "topic") || Object.hasOwn(input, "payload") || Object.hasOwn(input, "kind"))
        ? input
        : { payload: input };
    const warn = (warning) => (allowWarn ? run.warnings.push(warning) : assert.fail(warning));
    return execute(message, context, globalContext, { warn }, Buffer, TestDate);
  };
  run.warnings = [];
  run.withPayload = (payload) => run(payload);
  run.setNow = setNow;
  run.context = context;
  run.global = globalContext;
  return run;
}

function emittedEvents(result) {
  return result?.[0]?.events || [];
}

function eventExists(events, event, rule) {
  return events.some((item) => item.event === event && (!rule || item.rule === rule));
}

const asArray = (value) => (value === null || value === undefined ? [] : Array.isArray(value) ? value : [value]);
const lines = (output) => asArray(output).map((item) => JSON.parse(item.payload));

// ---------------- Week 5 rules (unchanged) ----------------
const climate = createRunner("orchid-climate-rules");
let events = emittedEvents(climate({ temperature_c: 34, humidity_pct: 72 }));
assert(eventExists(events, "threshold_active", "orchidHighTemperature"));

events = emittedEvents(climate({ temperature_c: 32, humidity_pct: 92 }));
assert(eventExists(events, "threshold_active", "orchidHighHumidity"));
assert(!eventExists(events, "threshold_cleared", "orchidHighTemperature"));

events = emittedEvents(climate({ temperature_c: 30, humidity_pct: 87 }));
assert(eventExists(events, "threshold_cleared", "orchidHighTemperature"));
assert(!eventExists(events, "threshold_cleared", "orchidHighHumidity"));

events = emittedEvents(climate({ temperature_c: 30, humidity_pct: 84 }));
assert(eventExists(events, "threshold_cleared", "orchidHighHumidity"));
assert.equal(climate({ temperature_c: null, humidity_pct: null }), null);

events = emittedEvents(climate({ light_adc: 2400 }));
assert(eventExists(events, "threshold_active", "orchidLightDemand"));
assert.equal(climate({ light_adc: 2000 }), null);
events = emittedEvents(climate({ light_adc: 1700 }));
assert(eventExists(events, "threshold_cleared", "orchidLightDemand"));

const water = createRunner("orchid-water-rules");
events = emittedEvents(water({ water_adc: 1100, humidity_pct: 60 }));
assert(eventExists(events, "water_lockout"));

assert.equal(water({ water_adc: 1300, humidity_pct: 60 }), null);

events = emittedEvents(water({ water_adc: 1550, humidity_pct: 60 }));
assert(eventExists(events, "water_recovered"));
assert(eventExists(events, "mist_demand_observed"));

assert.equal(water({ water_adc: 1550, humidity_pct: 72 }), null);
events = emittedEvents(water({ water_adc: 1550, humidity_pct: 82 }));
assert(eventExists(events, "mist_demand_cleared"));

events = emittedEvents(water({ water_adc: 1100, humidity_pct: 60 }));
assert(eventExists(events, "water_lockout"));
assert(!eventExists(events, "mist_demand_observed"));

const sharedContext = createContext();
const monitor = createRunner("orchid-process", sharedContext);
const watchdog = createRunner("orchid-watchdog", sharedContext);
let timestamp = Date.parse("2026-10-09T00:00:00.000Z");
setNow(timestamp);
let result = monitor({
  topic: "garden/orchid/test/availability",
  payload: "offline",
});
assert.equal(result[1].length, 1);
assert.equal(JSON.parse(result[1][0].payload).event, "availability");

watchdog.context.set("orchidOnline", "offline");
watchdog.context.set("orchidOfflineSince", timestamp);
setNow(timestamp + 299999);
result = watchdog.withPayload({});
assert(
  !result.some((item) => JSON.parse(item.payload).event === "device_offline_over_5m"),
  "Five-minute alert must not fire early",
);
setNow(timestamp + 300000);
result = watchdog.withPayload({});
assert(
  result.some((item) => JSON.parse(item.payload).event === "device_offline_over_5m"),
  "Five-minute alert must fire at the threshold",
);
result = watchdog.withPayload({});
assert(
  !result.some((item) => JSON.parse(item.payload).event === "device_offline_over_5m"),
  "Five-minute alert must fire only once",
);

timestamp += 360000;
setNow(timestamp);
result = monitor({
  topic: "garden/orchid/test/availability",
  payload: "online",
});
assert.equal(result[1].length, 1);
watchdog.context.set("orchidOnline", "online");
watchdog.context.set("orchidOfflineSince", 0);
watchdog.context.set("orchidOfflineFiveMinuteLogged", false);
setNow(timestamp + 300000);
assert.equal(watchdog.withPayload({}).length, 0, "Online device must not get an offline alert");

timestamp += 360000;
setNow(timestamp);
monitor({
  topic: "garden/orchid/test/availability",
  payload: "offline",
});
setNow(timestamp + 300000);
result = watchdog.withPayload({});
assert(
  result.some((item) => JSON.parse(item.payload).event === "device_offline_over_5m"),
  "A later offline period must raise a fresh five-minute alert",
);

// ---------------- Week 6: dashboard rendering ----------------
const dashboardFlow = createContext();
const globals = createContext();
const dashboard = createRunner("orchid-dashboard-render", dashboardFlow, globals);
timestamp = Date.parse("2026-10-09T12:00:00.000Z");
setNow(timestamp);
result = dashboard({
  topic: `${DEVICE}/telemetry`,
  payload: JSON.stringify({ temperature_c: 29.5, humidity_pct: 74, light_adc: 2300, water_adc: 1650 }),
});
assert.equal(result[0].payload, "29.5 °C");
assert.equal(result[1].payload, "74 %");
assert.equal(result[2].payload, "2300");
assert.equal(result[3].payload, "1650");
assert.equal(result[7].payload, "ONLINE");
assert.deepEqual(result[9].map((point) => point.payload), [29.5, 74]);
assert.deepEqual(result[10].map((point) => point.payload), [2300, 1650]);
assert.equal(result[11].payload.connection, "ONLINE", "Render must feed the button-lock logic");
result = dashboard({
  topic: `${DEVICE}/state`,
  payload: JSON.stringify({ mist: "OFF", fan: "ON", light: "OFF", mist_state: "COOLDOWN", mode: "AUTO" }),
});
assert.equal(result[4].payload, "COOLDOWN");
assert.equal(result[5].payload, "ON");
assert.equal(result[6].payload, "OFF");
assert.equal(result[8].payload, "AUTO");
result = dashboard({
  topic: `${DEVICE}/state`,
  payload: { mist: "OFF", fan: "ON", light: "ON", mist_state: "IDLE", mode: "MANUAL", mist_mode: "AUTO", fan_mode: "AUTO", light_mode: "MANUAL" },
});
assert.equal(result[8].payload, "MANUAL (light)", "Mode must name the relays held by an override");
result = dashboard({ topic: `${DEVICE}/telemetry`, payload: { temperature_c: null, humidity_pct: null, light_adc: 2300, water_adc: 1650 } });
assert.equal(result[0].payload, "—", "Null DHT readings must not render as 0");
assert.deepEqual(result[9], [], "Null DHT readings must not be charted");
result = dashboard({ topic: `${DEVICE}/state`, payload: { dht_fault: true, mist_state: "SENSOR_FAULT" } });
assert.equal(result[0].payload, "DHT fault");
assert.equal(result[4].payload, "SENSOR_FAULT");
dashboard({ topic: `${DEVICE}/state`, payload: { dht_fault: false, mist_state: "IDLE" } });
setNow(timestamp + 15001);
result = dashboard({ topic: "dashboard/refresh", payload: {} });
assert.equal(result[7].payload, "STALE", "Telemetry older than 15 seconds must be marked stale");
result = dashboard({ topic: `${DEVICE}/availability`, payload: "offline" });
assert.equal(result[7].payload, "OFFLINE");
assert.equal(dashboardFlow.get("orchidDashboardConnection"), "OFFLINE");

// Tuan 8: tin "online" retained cu tren broker (thiet bi khong chay) khong duoc mo khoa lenh.
const freshDashboard = createRunner("orchid-dashboard-render", createContext(), createContext());
setNow(timestamp + 60000);
result = freshDashboard({ topic: `${DEVICE}/availability`, payload: "online" });
assert.equal(result[7].payload, "WAITING", "Retained 'online' without fresh telemetry must not count as ONLINE");
setNow(timestamp + 60000 + 15001);
result = freshDashboard({ topic: "dashboard/refresh", payload: {} });
assert.equal(result[7].payload, "STALE", "No telemetry 15 s after 'online' must be marked stale");
result = freshDashboard({ topic: `${DEVICE}/telemetry`, payload: { temperature_c: 28, humidity_pct: 72, light_adc: 900, water_adc: 2400 } });
assert.equal(result[7].payload, "ONLINE", "Fresh telemetry after 'online' marks the device ONLINE");
result = freshDashboard({ topic: `${DEVICE}/availability`, payload: "offline" });
assert.equal(result[7].payload, "OFFLINE");
setNow(timestamp + 60000 + 20000);
result = freshDashboard({ topic: `${DEVICE}/availability`, payload: "online" });
assert.equal(result[7].payload, "WAITING", "After reconnect, wait for new telemetry before ONLINE");

// ---------------- Week 6: control widgets, gateway, ACK ----------------
const sessions = new Map([
  ["sock-op", { user: "alice", role: "operator" }],
  ["sock-view", { user: "bob", role: "viewer" }],
]);
globals.set("orchidDashboardUser", (socketId) => sessions.get(socketId) || null);
const controlUi = createRunner("orchid-control-ui", dashboardFlow, globals);
const gateway = createRunner("orchid-gateway", dashboardFlow, globals);
const controlState = createRunner("orchid-control-state", dashboardFlow, globals);
const asOperator = { socketId: "sock-op" };
const asViewer = { socketId: "sock-view" };
const goOnline = () => {
  dashboard({ topic: `${DEVICE}/availability`, payload: "online" });
  dashboard({ topic: `${DEVICE}/telemetry`, payload: { temperature_c: 28, humidity_pct: 72, light_adc: 900, water_adc: 2400 } });
  dashboard({ topic: `${DEVICE}/state`, payload: { mist: "OFF", fan: "OFF", light: "OFF", mist_state: "IDLE", water_lockout: false, dht_fault: false, mode: "AUTO" } });
};
timestamp = Date.parse("2026-10-09T13:00:00.000Z");
setNow(timestamp);
goOnline();

result = controlUi({ topic: "control/init", payload: "" });
assert.equal(globals.get("orchidControlMode"), "AUTO", "Dashboard must start in AUTO");
assert.equal(result[1].payload, "AUTO");
assert.equal(dashboardFlow.get("orchidControlTtl"), 300);
assert.equal(result[2].payload, 300, "TTL dropdown shows the default on start");

result = controlState({ topic: "control/init" });
assert(result.slice(0, 6).every((item) => item.enabled === false), "AUTO mode must lock every manual button");
assert.match(result[6].payload, /AUTO mode/);

result = controlUi({ topic: "control/mode", payload: "MANUAL", _client: asViewer });
assert.equal(globals.get("orchidControlMode"), "AUTO", "Viewer must not change the mode");
assert.equal(result[1].payload, "AUTO", "Mode selector must snap back for a viewer");
assert.equal(lines(result[3])[0].event, "control_denied");

result = controlUi({ topic: "control/mode", payload: "MANUAL", _client: asOperator });
assert.equal(globals.get("orchidControlMode"), "MANUAL");
assert.equal(lines(result[3])[0].event, "control_mode_changed");
result = controlState({ topic: "control/refresh" });
assert(result.slice(0, 6).every((item) => item.enabled === true), "MANUAL + ONLINE must unlock the buttons");
assert.equal(controlState({ topic: "control/refresh" }).slice(0, 7).filter(Boolean).length, 0, "Unchanged locks are not re-sent");

controlUi({ topic: "control/ttl", payload: 900, _client: asOperator });
result = controlUi({ topic: "control/relay", payload: "fan:ON", _client: asOperator });
const fanRequest = result[0][0];
assert.deepEqual(
  { relay: fanRequest.payload.relay, state: fanRequest.payload.state, ttl: fanRequest.payload.ttl_s, user: fanRequest.payload.user },
  { relay: "fan", state: "ON", ttl: 900, user: "alice" },
);
result = gateway(fanRequest);
const fanPublish = result[0][0];
assert.equal(fanPublish.topic, `${DEVICE}/cmd/fan`);
assert.equal(fanPublish.qos, 1);
assert.equal(fanPublish.retain, false);
const fanPayload = JSON.parse(fanPublish.payload);
assert.deepEqual(Object.keys(fanPayload), ["request_id", "mode", "state", "ttl_s"], "Payload must match the firmware format");
assert.deepEqual({ ...fanPayload, request_id: "x" }, { request_id: "x", mode: "MANUAL", state: "ON", ttl_s: 900 });
assert.match(fanPayload.request_id, /^dash-/);
assert.equal(result[1].payload[0].result, "PENDING");
assert.equal(lines(result[4])[0].event, "command_sent");

result = controlState({ topic: "control/refresh" });
assert.equal(result[2].enabled, false, "Fan ON must lock while waiting for ACK");
assert.equal(result[3].enabled, false, "Fan OFF must lock while waiting for ACK");
assert.match(result[6].payload, /Waiting for ACK: fan/);

result = gateway({ topic: "orchid/command", payload: { relay: "fan", mode: "MANUAL", state: "OFF", ttl_s: 60, source: "dashboard", role: "operator" } });
assert.equal(result[5][0].payload.result, "BLOCKED");
assert.equal(result[5][0].payload.reason, "BUSY", "Only one pending command per relay");

setNow(timestamp + 420);
result = gateway({ topic: `${DEVICE}/ack`, payload: JSON.stringify({ request_id: fanPayload.request_id, result: "APPLIED" }) });
const applied = result[5][0].payload;
assert.equal(applied.result, "APPLIED");
assert.equal(applied.latency_ms, 420);
const appliedRow = result[1].payload.find((row) => row.command === "MANUAL ON 900s");
assert.equal(appliedRow.result, "APPLIED", "History row updates from PENDING to APPLIED");
assert.equal(appliedRow.latency, "420 ms");
assert.equal(appliedRow.source, "dashboard (alice)");
assert.match(result[2].payload, /fan MANUAL ON 900s → APPLIED/);
assert.equal(result[3][0]._client.socketId, "sock-op", "Result popup goes to the client that pressed the button");

result = gateway({ topic: "orchid/command", payload: { relay: "mist", mode: "MANUAL", state: "ON", ttl_s: 60, source: "dashboard", user: "bob", role: "viewer" } });
assert.equal(result[5][0].payload.reason, "FORBIDDEN");
assert.equal(result[0], null, "Forbidden commands must not be published");
result = gateway({ topic: "orchid/command", payload: { relay: "mist", mode: "MANUAL", state: "ON", ttl_s: 0, source: "dashboard", role: "operator" } });
assert.equal(result[5][0].payload.reason, "INVALID_TTL");
result = gateway({ topic: "orchid/command", payload: { relay: "light", mode: "MANUAL", state: "ON", ttl_s: 60, source: "automation:light_schedule" } });
assert.equal(result[5][0].payload.reason, "AUTOMATION_SUSPENDED", "Automation must pause while the operator is in MANUAL");

// Firmware tu choi (vd. muc nuoc vua xuong) -> REJECTED hien thi kem ly do.
result = gateway({ topic: "orchid/command", payload: { relay: "mist", mode: "MANUAL", state: "ON", ttl_s: 60, source: "dashboard", user: "alice", role: "operator" } });
const mistId = JSON.parse(result[0][0].payload).request_id;
result = gateway({ topic: `${DEVICE}/ack`, payload: { request_id: mistId, result: "REJECTED", reason: "WATER_LOCKOUT" } });
assert.equal(result[5][0].payload.result, "REJECTED");
assert.equal(result[1].payload[0].detail, "WATER_LOCKOUT");
assert.equal(result[3][0].ui_update.color, "#c53030");

// Lenh khong co ACK -> NO_ACK sau 6 s, ACK den muon duoc ghi rieng.
result = gateway({ topic: "orchid/command", payload: { relay: "light", mode: "MANUAL", state: "ON", ttl_s: 60, source: "dashboard", user: "alice", role: "operator" } });
const lightId = JSON.parse(result[0][0].payload).request_id;
setNow(timestamp + 6000);
assert.equal(gateway({ topic: "gateway/tick" }), null, "NO_ACK must not fire before 6 s");
setNow(timestamp + 420 + 6000);
result = gateway({ topic: "gateway/tick" });
assert.equal(result[5][0].payload.result, "NO_ACK");
assert.equal(result[5][0].payload.request_id, lightId);
result = gateway({ topic: `${DEVICE}/ack`, payload: { request_id: lightId, result: "APPLIED" } });
assert.equal(lines(result[4])[0].event, "command_late_ack");
assert.equal(gateway({ topic: `${DEVICE}/ack`, payload: { request_id: "someone-else", result: "APPLIED" } }), null);

dashboard({ topic: `${DEVICE}/state`, payload: { water_lockout: true, mist_state: "WATER_LOCKOUT" } });
result = controlState({ topic: "control/refresh" });
assert.equal(result[0].enabled, false, "Mist ON must lock during water lockout");
assert.match(result[6].payload, /WATER_LOCKOUT/);
dashboard({ topic: `${DEVICE}/state`, payload: { water_lockout: false, mist_state: "IDLE" } });

result = controlUi({ topic: "control/mode", payload: "AUTO", _client: asOperator });
assert.deepEqual(result[0].map((item) => [item.payload.relay, item.payload.mode]), [["mist", "AUTO"], ["fan", "AUTO"], ["light", "AUTO"]],
  "Returning to AUTO must clear every firmware override");
result = gateway(result[0][0]);
assert.deepEqual(Object.keys(JSON.parse(result[0][0].payload)), ["request_id", "mode"]);
result = gateway({ topic: "orchid/command", payload: { relay: "fan", mode: "MANUAL", state: "ON", ttl_s: 60, source: "dashboard", role: "operator" } });
assert.equal(result[5][0].payload.reason, "LOCKED_AUTO_MODE", "Gateway must enforce the lock even if a button is bypassed");
dashboard({ topic: `${DEVICE}/availability`, payload: "offline" });
result = gateway({ topic: "orchid/command", payload: { relay: "fan", mode: "AUTO", source: "dashboard", role: "operator" } });
assert.equal(result[5][0].payload.reason, "DEVICE_OFFLINE");
const noSession = createRunner("orchid-control-ui", dashboardFlow, createContext());
result = noSession({ topic: "control/relay", payload: "fan:ON", _client: asOperator });
assert.equal(result[0][0].payload.role, null, "Without the login context there is no control role");

// ---------------- Week 7: config, rule clock ----------------
const ruleGlobals = createContext();
const configNode = byId("orchid-week7-config-load");
const defaultConfig = JSON.parse(configNode.payload);
const config = createRunner("orchid-week7-config", createContext(), ruleGlobals, { allowWarn: true });
setNow(Date.parse("2026-10-16T04:00:00.000Z"));
result = JSON.parse(config({ payload: defaultConfig }).payload);
assert.equal(result.event, "rule_config_loaded");
assert.equal(ruleGlobals.get("orchidRuleConfig").night_policy.allow_auto_mist_at_night, false, "Night AUTO mist is blocked by default");
result = JSON.parse(config({ payload: { ...defaultConfig, night_policy: { ...defaultConfig.night_policy, allow_auto_mist_at_night: true } } }).payload);
assert.equal(result.event, "rule_config_rejected", "Night mist needs team confirmation");
result = JSON.parse(config({ payload: { ...defaultConfig, light: { ...defaultConfig.light, bright_off_adc: 2500 } } }).payload);
assert.equal(result.event, "rule_config_rejected", "Light hysteresis must be valid");
assert.equal(config.warnings.length, 2, "Rejected configs are reported in the editor");
assert.equal(ruleGlobals.get("orchidRuleConfig").version, 1, "A rejected config keeps the last valid one");
const demoConfig = JSON.parse(byId("orchid-week7-config-demo-morning").payload);
config({ payload: demoConfig });
const clock = ruleGlobals.get("orchidRuleClock");
assert.equal(clock.speed, 60);
assert.equal(new TestDate(clock.ruleStart).getHours(), 5);
const context = createRunner("orchid-week7-context", createContext(), ruleGlobals);
ruleGlobals.set("orchidControlMode", "AUTO");
setNow(Date.parse("2026-10-16T04:00:10.000Z"));
result = context({ topic: `${DEVICE}/telemetry`, payload: JSON.stringify({ light_adc: 2400 }) });
assert.equal(result.kind, "telemetry");
assert.equal(result.ruleNow - clock.ruleStart, 600000, "10 real seconds = 10 rule minutes at x60");
assert.equal(result.device.connection, "ONLINE");
assert.equal(context({ topic: "control/refresh" }), null);
assert.equal(context({ topic: `${DEVICE}/availability`, payload: "offline" }).device.connection, "OFFLINE");
setNow(Date.parse("2026-10-16T04:00:40.000Z"));
assert.equal(context({ topic: `${DEVICE}/availability`, payload: "online" }).device.connection, "WAITING",
  "Right after reconnect the old telemetry must not raise a stale alarm");
assert.equal(context({ topic: `${DEVICE}/telemetry`, payload: { light_adc: 2400 } }).device.connection, "ONLINE");
setNow(Date.parse("2026-10-16T04:00:56.000Z"));
assert.equal(context({ topic: "week7/tick" }).device.connection, "STALE");

// Message giong dau ra cua node context, de test tung rule voi dong ho rule tuy y.
const ruleConfig = (overrides = {}) => ({ ...defaultConfig, version: 1, ...overrides });
const at = (hhmm, day = "2026-10-16") => new TestDate(`${day}T${hhmm}:00`).getTime();
function ruleMsg(kind, ruleNow, device, extra = {}) {
  return {
    kind, ruleNow, realNow: currentTime, speed: 1, config: ruleConfig(), controlMode: "AUTO", modeChanged: false,
    device: { connection: "ONLINE", telemetry: {}, state: {}, stateAt: currentTime, ...device }, ...extra,
  };
}
const commandsOf = (output) => asArray(output?.[0]).map((item) => item.payload);
const eventsOf = (output) => asArray(output?.[1]).map((item) => item.event);

// Rule 1: den
const light = createRunner("orchid-week7-light-rule");
const darkDevice = { telemetry: { light_adc: 2400 }, state: { light: "OFF", light_mode: "AUTO" } };
setNow(Date.parse("2026-10-16T00:00:00.000Z"));
result = light(ruleMsg("tick", at("05:59"), darkDevice));
assert.deepEqual(commandsOf(result)[0], { relay: "light", mode: "MANUAL", state: "OFF", ttl_s: 900, source: "automation:light_schedule", ref: "light-1", reason: "outside_schedule" },
  "Before the schedule the rule holds the light OFF (firmware LDR AUTO would light it all night)");
light(ruleMsg("command_result", at("05:59"), darkDevice, { payload: { relay: "light", ref: "light-1", result: "APPLIED", source: "automation:light_schedule" } }));
result = light(ruleMsg("tick", at("06:00"), darkDevice));
const lightOn = commandsOf(result)[0];
assert.equal(lightOn.state, "ON", "Dark inside the schedule turns the light on");
assert.equal(lightOn.ttl_s, 900);
assert(eventsOf(result).some((event) => event.event === "automation_action" && event.action === "ON"));
const lightOnDevice = { telemetry: { light_adc: 2400 }, state: { light: "ON", light_mode: "MANUAL" } };
light(ruleMsg("command_result", at("06:00"), lightOnDevice, { payload: { relay: "light", ref: lightOn.ref, result: "APPLIED", source: "automation:light_schedule" } }));
assert.equal(commandsOf(light(ruleMsg("state", at("06:01"), lightOnDevice))).length, 0, "No resend while the hold is fresh");
setNow(Date.parse("2026-10-16T00:07:30.000Z"));
result = light(ruleMsg("tick", at("06:08"), lightOnDevice));
assert.equal(commandsOf(result)[0].state, "ON", "The hold is refreshed at half its TTL");
assert.equal(eventsOf(result).length, 0, "Refreshes are not logged as new actions");
result = light(ruleMsg("tick", at("06:09"), { telemetry: { light_adc: 2000 }, state: lightOnDevice.state }));
assert.equal(commandsOf(result).length, 0, "Hysteresis keeps the light on between 1800 and 2200 ADC");
result = light(ruleMsg("tick", at("06:10"), { telemetry: { light_adc: 1700 }, state: lightOnDevice.state }));
assert.equal(commandsOf(result)[0].state, "OFF", "Bright enough turns the light off");
assert.equal(eventsOf(result)[0].reason, "bright_enough");

// Gioi han tong thoi luong bat trong ngay (240 phut), roi sang ngay moi thi reset.
const limited = createRunner("orchid-week7-light-rule");
let ruleClock = at("07:00");
limited(ruleMsg("tick", ruleClock, darkDevice));
let limitEvent = null;
// Tick 20 s; mot khoang trong >30 s (mat ket noi / restart) khong duoc cong vao thoi luong bat.
for (let step = 0; step < 900 && !limitEvent; step += 1) {
  ruleClock += 20000;
  setNow(currentTime + 20000);
  const output = limited(ruleMsg("state", ruleClock, lightOnDevice));
  limitEvent = eventsOf(output).find((event) => event.event === "light_daily_limit_reached") || null;
  if (limitEvent) {
    assert.equal(commandsOf(output)[0].state, "OFF", "Daily limit forces the light off");
    assert.equal(commandsOf(output)[0].reason, "daily_limit_reached");
  }
}
assert(limitEvent, "Daily limit must be reached");
assert.equal(limitEvent.on_min, 240);
result = limited(ruleMsg("tick", at("06:30", "2026-10-17"), darkDevice));
assert(eventsOf(result).some((event) => event.event === "light_daily_total" && event.on_min >= 240));
assert.equal(commandsOf(result)[0].state, "ON", "A new day restores the budget");

const offTime = createRunner("orchid-week7-light-rule");
result = offTime(ruleMsg("tick", at("20:55"), darkDevice));
assert.equal(commandsOf(result)[0].ttl_s, 300, "ON hold never outlives the off time");
result = offTime(ruleMsg("tick", at("21:00"), darkDevice));
assert.equal(commandsOf(result)[0].state, "OFF", "Light goes off at the configured off time");
assert.equal(commandsOf(result)[0].reason, "outside_schedule");
const suspended = createRunner("orchid-week7-light-rule");
assert.equal(commandsOf(suspended(ruleMsg("tick", at("10:00"), darkDevice, { controlMode: "MANUAL" }))).length, 0,
  "Rules must not command relays while the dashboard is in MANUAL");
const fast = createRunner("orchid-week7-light-rule");
result = fast(ruleMsg("tick", at("10:00"), darkDevice, { speed: 60 }));
assert.equal(commandsOf(result)[0].ttl_s, 15, "Compressed clock converts the TTL to real seconds");

// Rule 2: quat sau chu ky phun
const fan = createRunner("orchid-week7-fan-rule");
setNow(Date.parse("2026-10-16T05:00:00.000Z"));
assert.equal(commandsOf(fan(ruleMsg("state", at("12:00"), { state: { mist: "ON", fan: "OFF" } }))).length, 0);
result = fan(ruleMsg("state", at("12:01"), { state: { mist: "OFF", fan: "OFF" } }));
assert.deepEqual(commandsOf(result)[0], { relay: "fan", mode: "MANUAL", state: "ON", ttl_s: 60, source: "automation:fan_after_mist", ref: "fan-1", reason: "mist_cycle_finished" });
assert.equal(eventsOf(result)[0].duration_s, 60);
assert.equal(eventsOf(fan(ruleMsg("tick", at("12:01") + 59000, { state: { mist: "OFF" } }))).length, 0, "Fan assist must not end early");
result = fan(ruleMsg("tick", at("12:01") + 60000, { state: { mist: "OFF" } }));
assert.equal(eventsOf(result)[0].action, "RELEASE", "Fan assist ends after 60 s (firmware TTL)");
fan(ruleMsg("state", at("12:10"), { state: { mist: "ON" } }));
result = fan(ruleMsg("state", at("12:12"), { state: { mist: "OFF" } }, { controlMode: "MANUAL" }));
assert.equal(commandsOf(result).length, 0);
assert.equal(eventsOf(result)[0].reason, "dashboard_manual_mode");

// Chinh sach ban dem
const night = createRunner("orchid-week7-night-guard");
result = night(ruleMsg("tick", at("17:59"), { state: { mist: "OFF", mist_mode: "AUTO" } }));
assert.equal(commandsOf(result).length, 0, "No hold inside the care window");
result = night(ruleMsg("tick", at("18:00"), { state: { mist: "OFF", mist_mode: "AUTO" } }));
assert.deepEqual(commandsOf(result)[0], { relay: "mist", mode: "MANUAL", state: "OFF", ttl_s: 900, source: "automation:night_mist_policy", ref: "night-1", reason: "night_no_auto_mist" });
assert(eventsOf(result).some((event) => event.event === "care_window_changed" && event.auto_mist === "BLOCKED"));
result = night(ruleMsg("state", at("18:00"), { state: { mist: "ON", mist_mode: "AUTO" } }));
assert(!eventsOf(result).some((event) => event.event === "night_mist_observed"), "A cycle still finishing while the hold is in flight is not a violation");
night(ruleMsg("command_result", at("18:00"), {}, { payload: { relay: "mist", ref: "night-1", result: "APPLIED", source: "automation:night_mist_policy" } }));
const nightAfterHold = currentTime + 4000;
result = night(ruleMsg("state", at("18:01"), { state: { mist: "OFF", mist_mode: "MANUAL" }, stateAt: nightAfterHold }));
assert.equal(eventsOf(result).length, 0);
result = night(ruleMsg("state", at("18:02"), { state: { mist: "ON", mist_mode: "AUTO" }, stateAt: nightAfterHold }));
assert.equal(eventsOf(result).find((event) => event.event === "night_mist_observed").note, "AUTO mist at night despite the OFF hold");
night(ruleMsg("state", at("18:03"), { state: { mist: "OFF", mist_mode: "MANUAL" } }));
result = night(ruleMsg("state", at("22:00"), { state: { mist: "ON", mist_mode: "MANUAL" } }, { controlMode: "MANUAL" }));
assert(eventsOf(result).some((event) => event.event === "night_mist_observed" && event.note === "operator exception during night"));
result = night(ruleMsg("tick", at("06:00", "2026-10-17"), { state: { mist: "OFF", mist_mode: "MANUAL" } }, { modeChanged: false }));
assert.deepEqual(commandsOf(result)[0], { relay: "mist", mode: "AUTO", source: "automation:night_mist_policy", ref: "night-3", reason: "care_window" },
  "Morning releases the night hold back to firmware AUTO");

// Tinh huong bat thuong + trang thai an toan
const faults = createRunner("orchid-week7-fault-monitor");
const faultEvents = (output) => asArray(output?.[0]).map((item) => item.event);
setNow(Date.parse("2026-10-16T06:00:00.000Z"));
result = faults(ruleMsg("state", 0, { state: { mist: "OFF", dht_fault: false, water_lockout: false } }));
assert.match(result[1].payload, /^OK/);
result = faults(ruleMsg("state", 0, { telemetry: { temperature_c: null, dht_fail_streak: 3 }, state: { mist: "OFF", mist_state: "SENSOR_FAULT", dht_fault: true } }));
const dhtEvent = faultEvents(result).find((event) => event.fault === "dht_fault");
assert.equal(dhtEvent.event, "fault_active");
assert.match(dhtEvent.safe_state, /AUTO misting stopped/);
assert.match(result[1].payload, /dht_fault/);
result = faults(ruleMsg("state", 0, { state: { mist: "OFF", mist_state: "WATER_LOCKOUT", dht_fault: false, water_lockout: true } }));
assert.deepEqual(faultEvents(result).map((event) => [event.event, event.fault]), [["fault_cleared", "dht_fault"], ["fault_active", "water_low"]]);
result = faults(ruleMsg("state", 0, { state: { mist: "ON", water_lockout: true } }));
assert(faultEvents(result).some((event) => event.fault === "violation_mist_lockout" && event.severity === "critical"),
  "Mist ON during water lockout must be flagged as a firmware safety violation");
result = faults(ruleMsg("command_result", 0, { state: { mist: "OFF", water_lockout: false } }, { payload: { relay: "fan", result: "NO_ACK", request_id: "dash-1", source: "dashboard" } }));
assert(faultEvents(result).some((event) => event.event === "fault_command_no_ack"));
assert(faultEvents(result).some((event) => event.event === "fault_active" && event.fault === "ack_missing"));
result = faults(ruleMsg("command_result", 0, { state: { mist: "OFF" } }, { payload: { relay: "fan", result: "APPLIED" } }));
assert(faultEvents(result).some((event) => event.event === "fault_cleared" && event.fault === "ack_missing"));
result = faults(ruleMsg("availability", 0, { connection: "OFFLINE", state: { mist: "OFF" } }));
assert(faultEvents(result).some((event) => event.fault === "link_offline" && /local AUTO/.test(event.safe_state)));
faults(ruleMsg("availability", 0, { connection: "ONLINE", state: { mist: "ON" } }));
setNow(currentTime + 131000);
result = faults(ruleMsg("state", 0, { connection: "ONLINE", state: { mist: "ON" } }));
assert(faultEvents(result).some((event) => event.fault === "violation_mist_runtime"), "Mist ON beyond the firmware limit must be flagged");

// Gop rule: tab Nguoi 3 khong con rule/MQTT Out rieng; nut test di qua gateway.
assert.equal(defaultConfig.light.off_time, "21:00", "Team-agreed light off time");
assert.equal(defaultConfig.fan_assist.duration_s, 60, "Team-agreed fan assist duration");
for (const id of ["nguoi3-orchid-rule-light", "nguoi3-orchid-rule-light-tick", "nguoi3-orchid-rule-fan", "nguoi3-orchid-cmd-formatter", "nguoi3-orchid-mqtt-out-dynamic"]) {
  assert.equal(byId(id).d, true, `${id} must stay disabled (duplicate of the Week 7 rules / gateway)`);
}
const testButtons = nodes.filter((node) => node.id.startsWith("nguoi3-orchid-btn-"));
assert.equal(testButtons.length, 9);
for (const button of testButtons) assert.deepEqual(button.wires, [["nguoi3-orchid-to-gateway"]], `${button.id} must go through the gateway`);
assert.deepEqual(byId("nguoi3-orchid-to-gateway").wires, [["nguoi3-orchid-gateway-out"]]);
assert(byId("orchid-gateway-in").links.includes("nguoi3-orchid-gateway-out"));
const editorButtons = createRunner("nguoi3-orchid-to-gateway");
const mistOnButton = byId("nguoi3-orchid-btn-mist-on");
result = editorButtons({ payload: JSON.parse(mistOnButton.payload), relay: "mist", topic: "" });
assert.deepEqual(result.payload, { relay: "mist", mode: "MANUAL", source: "dashboard", user: "editor", role: "admin", reason: "editor_test_button", state: "ON", ttl_s: 60 });
result = editorButtons({ payload: { mode: "AUTO" }, relay: "fan", topic: "" });
assert.deepEqual(result.payload, { relay: "fan", mode: "AUTO", source: "dashboard", user: "editor", role: "admin", reason: "editor_test_button" });

const table = createRunner("orchid-week7-event-table");
result = table({ topic: "week7/event", event: { event: "automation_action", rule: "light_schedule", action: "ON", at: "2026-10-16T06:00:00.000Z", rule_time: "2026-10-16 06:00:00" } });
assert.equal(result.payload[0].rule_clock, "06:00:00");
assert.match(result.payload[0].detail, /action=ON/);

console.log("PASS: Node-RED structure, Week 5 rules, Week 6 dashboard + control/ACK gateway, Week 7 automation, night policy and fault monitor.");
