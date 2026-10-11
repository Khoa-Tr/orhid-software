const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const flowPath = path.join(__dirname, "orchid-flow.json");
const nodes = JSON.parse(fs.readFileSync(flowPath, "utf8"));
const ids = new Set(nodes.map((node) => node.id));
const tabs = nodes.filter((node) => node.type === "tab");

assert.equal(ids.size, nodes.length, "Node IDs must be unique");
assert.equal(tabs.length, 3, "Expected monitor, climate, and water tabs");

for (const node of nodes) {
  if (node.z) assert(ids.has(node.z), `${node.id} must reference an existing tab`);
  for (const output of node.wires || []) {
    for (const target of output) assert(ids.has(target), `${node.id} has dangling wire ${target}`);
  }
  if (node.type === "mqtt in") {
    assert(ids.has(node.broker), `${node.id} must reference an existing MQTT broker`);
  }
}

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

console.log("PASS: Node-RED flow structure, climate/light/water/mist rules, and five-minute offline alert.");
