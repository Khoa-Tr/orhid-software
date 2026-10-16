const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const flowPath = path.join(__dirname, "orchid-flow.json");
const nodes = JSON.parse(fs.readFileSync(flowPath, "utf8"));
const ids = new Set(nodes.map((node) => node.id));
const tabs = nodes.filter((node) => node.type === "tab");

assert.equal(ids.size, nodes.length, "Node IDs must be unique");
assert(tabs.length >= 5, "Expected at least 5 tabs (Monitor, Climate, Water, Dashboard, Week 7, and Người 3)");

for (const node of nodes) {
  if (node.z) assert(ids.has(node.z), `${node.id} must reference an existing tab`);
  for (const output of node.wires || []) {
    for (const target of output) assert(ids.has(target), `${node.id} has dangling wire ${target}`);
  }
  if (node.type === "mqtt in") {
    assert(ids.has(node.broker), `${node.id} must reference an existing MQTT broker`);
  }
  if (node.type === "function") {
    assert.equal(node.outputs, node.wires.length, `${node.id} output count must match its wires`);
  }
}
// Controls enabled for interactive testing and demonstration
assert.equal(nodes.filter((node) => node.type === "ui-chart").length, 2, "Dashboard must include two history charts");

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

function createRunner(id, context = createContext()) {
  const node = nodes.find((item) => item.id === id);
  assert(node && node.type === "function", `${id} must be a Function node`);
  let currentTime = Date.now();
  class TestDate extends Date {
    constructor(...args) {
      super(...(args.length > 0 ? args : [currentTime]));
    }

    static now() {
      return currentTime;
    }
  }
  const execute = new Function("msg", "flow", "node", "Buffer", "Date", node.func);
  const run = (input) => {
    const message =
      input && (Object.hasOwn(input, "topic") || Object.hasOwn(input, "payload"))
        ? input
        : { payload: input };
    return execute(message, context, { warn: (warning) => assert.fail(warning) }, Buffer, TestDate);
  };
  run.withPayload = (payload) => run(payload);
  run.setNow = (timestamp) => {
    currentTime = timestamp;
  };
  run.context = context;
  return run;
}

function emittedEvents(result) {
  return result?.[0]?.events || [];
}

function eventExists(events, event, rule) {
  return events.some((item) => item.event === event && (!rule || item.rule === rule));
}

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
monitor.setNow(timestamp);
let result = monitor({
  topic: "garden/orchid/test/availability",
  payload: "offline",
});
assert.equal(result[1].length, 1);
assert.equal(JSON.parse(result[1][0].payload).event, "availability");

watchdog.context.set("orchidOnline", "offline");
watchdog.context.set("orchidOfflineSince", timestamp);
watchdog.setNow(timestamp + 299999);
result = watchdog.withPayload({});
assert(
  !result.some((item) => JSON.parse(item.payload).event === "device_offline_over_5m"),
  "Five-minute alert must not fire early",
);
watchdog.setNow(timestamp + 300000);
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
monitor.setNow(timestamp);
result = monitor({
  topic: "garden/orchid/test/availability",
  payload: "online",
});
assert.equal(result[1].length, 1);
watchdog.context.set("orchidOnline", "online");
watchdog.context.set("orchidOfflineSince", 0);
watchdog.context.set("orchidOfflineFiveMinuteLogged", false);
watchdog.setNow(timestamp + 300000);
assert.equal(watchdog.withPayload({}).length, 0, "Online device must not get an offline alert");

timestamp += 360000;
monitor.setNow(timestamp);
monitor({
  topic: "garden/orchid/test/availability",
  payload: "offline",
});
watchdog.setNow(timestamp + 300000);
result = watchdog.withPayload({});
assert(
  result.some((item) => JSON.parse(item.payload).event === "device_offline_over_5m"),
  "A later offline period must raise a fresh five-minute alert",
);

const dashboard = createRunner("orchid-dashboard-render");
timestamp = Date.parse("2026-10-09T12:00:00.000Z");
dashboard.setNow(timestamp);
result = dashboard({
  topic: "garden/orchid/orchid-01/telemetry",
  payload: JSON.stringify({
    temperature_c: 29.5,
    humidity_pct: 74,
    light_adc: 2300,
    water_adc: 1650,
  }),
});
assert.equal(result[0].payload, "29.5 °C");
assert.equal(result[1].payload, "74 %");
assert.equal(result[2].payload, "2300");
assert.equal(result[3].payload, "1650");
assert.equal(result[7].payload, "ONLINE");
assert.deepEqual(result[9].map((point) => point.payload), [29.5, 74]);
assert.deepEqual(result[10].map((point) => point.payload), [2300, 1650]);
result = dashboard({
  topic: "garden/orchid/orchid-01/state",
  payload: JSON.stringify({
    mist: "OFF",
    fan: "ON",
    light: "OFF",
    mist_state: "COOLDOWN",
    mode: "AUTO",
  }),
});
assert.equal(result[4].payload, "COOLDOWN");
assert.equal(result[5].payload, "ON");
assert.equal(result[6].payload, "OFF");
assert.equal(result[8].payload, "AUTO");
dashboard.setNow(timestamp + 15001);
result = dashboard({ topic: "dashboard/refresh", payload: {} });
assert.equal(result[7].payload, "STALE", "Telemetry older than 15 seconds must be marked stale");
result = dashboard({ topic: "garden/orchid/orchid-01/availability", payload: "offline" });
assert.equal(result[7].payload, "OFFLINE");

const lightSchedule = createRunner("orchid-week7-light-rule");
const lightAt = (time, lightAdc = 2300) => lightSchedule({
  topic: "garden/orchid/orchid-01/telemetry",
  payload: { light_adc: lightAdc },
  testTime: time,
});
result = lightAt("07:59");
assert.equal(result.event.action, "OFF", "Light must be off before the demo schedule");
result = lightAt("08:00");
assert.equal(result.event.action, "ON", "Dark conditions during the schedule must recommend light on");
assert.equal(lightAt("08:01"), null, "Unchanged on recommendation must not be repeated");
assert.equal(lightAt("20:00").event.action, "OFF", "Light must be off at the schedule end");
lightSchedule.context.set("orchidWeek7LightRecommendation", "ON");
result = lightAt("08:00", 2000);
assert.equal(result.event.action, "OFF", "Bright conditions must prevent the light-on recommendation");

const fanAssist = createRunner("orchid-week7-fan-rule");
timestamp = Date.parse("2026-10-09T12:00:00.000Z");
fanAssist.setNow(timestamp);
assert.equal(fanAssist({
  topic: "garden/orchid/orchid-01/state",
  payload: { mist_state: "RUNNING", fan: "OFF" },
}), null);
fanAssist.setNow(timestamp + 1000);
result = fanAssist({
  topic: "garden/orchid/orchid-01/state",
  payload: { mist_state: "COOLDOWN", fan: "OFF" },
});
assert.equal(result[0].event.action, "ON");
assert.equal(result[0].event.duration_s, 180);
fanAssist.setNow(timestamp + 180999);
assert.equal(fanAssist({ topic: "week7/rule_tick", payload: {} }), null, "Fan assist must not expire early");
fanAssist.setNow(timestamp + 181000);
result = fanAssist({ topic: "week7/rule_tick", payload: {} });
assert.equal(result[0].event.action, "OFF", "Fan assist must expire after three minutes");
assert.equal(fanAssist({ topic: "week7/rule_tick", payload: {} }), null, "Fan off recommendation must emit once");

console.log("PASS: Node-RED structure, existing rules, dashboard rendering, Week 7 recommendations, and read-only safety.");
