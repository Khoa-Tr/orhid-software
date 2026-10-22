// Tuan 8 (M4): firmware that tren Wokwi (VS Code) + broker.emqx.io + Node-RED + dashboard, cung mot may.
// Uplink 12 phut doc so tren dashboard; downlink bam nut dashboard / nut test, ghi lai tung lenh.
const fs = require("node:fs");
const path = require("node:path");
// Can puppeteer-core + Chrome. W8_NODE_MODULES tro toi thu muc node_modules co puppeteer-core (neu khong cai cuc bo).
const NR = process.env.W8_NODE_MODULES;
const puppeteer = require(NR ? path.join(NR, "puppeteer-core") : "puppeteer-core");
const ROOT = process.env.W8_DIR || __dirname;

const BASE = "http://127.0.0.1:18800";
const OUT = path.join(ROOT, "out");
const SERIAL = path.join(OUT, "serial.log");
const SERIAL_TX = path.join(OUT, "serial-tx.txt");
const HISTORY = path.join(ROOT, "data", "orchid-history.jsonl"); // Node-RED chay voi cwd = $W8_DIR/data
const PASS = process.env.W8_PASSWORD || fs.readFileSync(path.join(ROOT, "pass.txt"), "utf8").trim(); // mat khau chung cua admin/op1 trong orchid-auth.json thu nghiem
const UPLINK_SECONDS = Number(process.env.UPLINK_SECONDS || 720);
const runLog = path.join(OUT, "driver.log");
const log = (line) => {
  const text = `${new Date().toISOString()} ${line}`;
  console.log(text);
  fs.appendFileSync(runLog, text + "\n");
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const serialText = () => (fs.existsSync(SERIAL) ? fs.readFileSync(SERIAL, "utf8") : "");
const serialSince = (offset) => serialText().slice(offset);
const tx = (command) => {
  log(`SERIAL TX ${command}`);
  fs.appendFileSync(SERIAL_TX, command + "\n");
};
const history = () => (fs.existsSync(HISTORY) ? fs.readFileSync(HISTORY, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []);

// Wokwi dung mo phong khi tab bi an: Serial im lang > 6 s thi khong tinh thoi gian cho (timeout theo "gio mo phong").
const serialFresh = () => {
  try {
    const stat = fs.statSync(SERIAL);
    return Date.now() - stat.mtimeMs < 6000;
  } catch {
    return true;
  }
};
let pausedMs = 0;
async function waitFor(description, check, timeout = 30000, quiet = false) {
  let waited = 0;
  let last = Date.now();
  let pausedHere = 0;
  for (;;) {
    const value = await check();
    if (value) {
      if (!quiet) log(`OK  ${description}${pausedHere > 1000 ? ` (Wokwi paused ${Math.round(pausedHere / 1000)} s meanwhile)` : ""}`);
      return value;
    }
    const now = Date.now();
    if (serialFresh()) waited += now - last;
    else {
      pausedHere += now - last;
      pausedMs += now - last;
    }
    last = now;
    if (waited > timeout) throw new Error(`Timed out: ${description}`);
    if (pausedHere > 600000) throw new Error(`Wokwi paused > 10 min during: ${description}`);
    await sleep(300);
  }
}
const widgetText = (page, label) => page.evaluate((wanted) => {
  for (const element of document.querySelectorAll(".nrdb-ui-text")) {
    const [name, ...rest] = element.innerText.split("\n");
    if (name.trim() === wanted) return rest.join(" ").trim();
  }
  return null;
}, label);
const buttonDisabled = (page, label) => page.evaluate((wanted) => {
  const button = [...document.querySelectorAll("button")].find((item) => item.innerText.trim() === wanted);
  return button ? button.disabled : null;
}, label);
// Wokwi tam dung khi tab bi an -> dashboard STALE va khoa nut (dung thiet ke). Truoc moi thao tac cho link ONLINE lai.
let pausedWaits = 0;
// Serial moi trong 4 s (telemetry 2,5 s mo phong ~ 3,3 s that) => Wokwi dang chay.
const serialLive = () => {
  try {
    return Date.now() - fs.statSync(SERIAL).mtimeMs < 4000;
  } catch {
    return false;
  }
};
async function online(page, why) {
  if (serialLive() && (await widgetText(page, "Device link")) === "ONLINE") return;
  pausedWaits += 1;
  log(`WAIT Wokwi paused or link not ONLINE before ${why}`);
  const start = Date.now();
  for (;;) {
    if (serialLive() && (await widgetText(page, "Device link")) === "ONLINE") break;
    if (Date.now() - start > 900000) throw new Error(`Wokwi not running for 15 min before ${why}`);
    await sleep(500);
  }
  log(`OK  Wokwi running and link ONLINE again before ${why}`);
}
let mainPage = null;
async function click(page, label) {
  await online(page, `click ${label}`);
  const handle = await page.evaluateHandle((wanted) => [...document.querySelectorAll("button")].find((item) => item.innerText.trim() === wanted), label);
  await handle.asElement().click();
  log(`CLICK ${label}`);
}
async function shot(page, name) {
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, name), fullPage: true, type: "jpeg", quality: 72 });
  log(`SHOT ${name}`);
}
async function adminToken() {
  const response = await fetch(`${BASE}/auth/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `client_id=node-red-admin&grant_type=password&scope=*&username=admin&password=${PASS}`,
  });
  return (await response.json()).access_token;
}
let token = null;
async function inject(id, label) {
  await online(mainPage, label || id);
  const response = await fetch(`${BASE}/inject/${id}`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  if (response.status !== 200) throw new Error(`inject ${id} -> ${response.status}`);
  log(`INJECT ${label || id}`);
}
const lastResult = (relay, sinceMs) => history().filter((event) => event.event === "command_result" && event.relay === relay && Date.parse(event.at) >= sinceMs).pop();
const waitResult = (description, relay, sinceMs, predicate, timeout = 15000) =>
  waitFor(description, () => {
    const result = lastResult(relay, sinceMs);
    return result && predicate(result) ? result : null;
  }, timeout);

(async () => {
  token = await adminToken();
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const page = await browser.newPage();
  mainPage = page;
  await page.setViewport({ width: 1360, height: 1000 });
  await page.authenticate({ username: "op1", password: PASS });
  await page.goto(`${BASE}/dashboard/orchid`, { waitUntil: "networkidle2" });

  log("PHASE 0 waiting for the real firmware on Wokwi (Serial \"MQTT connected\") and dashboard ONLINE");
  await waitFor("Wokwi firmware connected to broker.emqx.io", () => /MQTT connected; subscriptions=OK/.test(serialText()), Number(process.env.WAIT_MINUTES || 15) * 60 * 1000);
  await waitFor("dashboard shows ONLINE from fresh telemetry", async () => (await widgetText(page, "Device link")) === "ONLINE", 60000);
  if (!process.env.SKIP_UPLINK) await shot(page, "w8-01-online-auto.jpg");

  // ---------------- Uplink ----------------
  if (!process.env.SKIP_UPLINK) {
  log(`PHASE U uplink ${UPLINK_SECONDS}s: sample dashboard every 5 s`);
  const samples = fs.createWriteStream(path.join(OUT, "dashboard-samples.jsonl"), { flags: "a" });
  const uplinkStart = Date.now();
  const plan = [
    [180, () => tx("FAULT WATER LOW")], [240, () => tx("FAULT WATER OFF")],
    [420, () => tx("FAULT DHT ON")], [450, () => tx("FAULT DHT OFF")],
  ];
  const shots = [UPLINK_SECONDS / 3, (2 * UPLINK_SECONDS) / 3];
  for (let elapsed = 0; elapsed < UPLINK_SECONDS; elapsed = (Date.now() - uplinkStart) / 1000) {
    while (plan.length && elapsed >= plan[0][0]) plan.shift()[1]();
    while (shots.length && elapsed >= shots[0]) await shot(page, `w8-02-uplink-${Math.round(shots.shift() / 60)}min.jpg`);
    const sample = { at: new Date().toISOString() };
    for (const [key, label] of [["temperature", "Temperature"], ["humidity", "Humidity"], ["light_adc", "Light sensor (ADC)"], ["water_adc", "Water sensor (ADC)"],
      ["mist", "Mist"], ["fan", "Fan relay"], ["light", "Grow light relay"], ["link", "Device link"], ["mode", "Firmware mode"]]) {
      sample[key] = await widgetText(page, label);
    }
    samples.write(JSON.stringify(sample) + "\n");
    await sleep(5000);
  }
  samples.end();
  await shot(page, "w8-03-uplink-end.jpg");
  }

  // ---------------- Downlink ----------------
  // Moi kich ban chay trong step(): neu Wokwi tam dung giua chung (Serial im > 6 s) thi chay lai kich ban do (toi da 3 lan).
  const serialLinesSince = (offset) => serialSince(offset).split("\n").filter(Boolean).map((line) => Date.parse(line.slice(0, 24))).filter((time) => !Number.isNaN(time));
  const pauseDuring = (offset, startedAt) => {
    let previous = startedAt;
    for (const time of [...serialLinesSince(offset), Date.now()]) {
      if (time - previous > 6000) return Math.round((time - previous) / 1000);
      previous = Math.max(previous, time);
    }
    return 0;
  };
  async function step(name, body) {
    for (let attempt = 1; ; attempt += 1) {
      const offset = serialText().length;
      const startedAt = Date.now();
      try {
        return await body();
      } catch (error) {
        const paused = pauseDuring(offset, startedAt);
        if (!paused || attempt >= 3) throw error;
        log(`RETRY ${name} (attempt ${attempt + 1}): Wokwi paused ${paused} s during the step -> ${error.message}`);
        await online(page, `retry ${name}`);
      }
    }
  }

  log("PHASE D downlink tests");
  await step("MANUAL", async () => {
    await click(page, "MANUAL");
    await waitFor("MANUAL unlocks the relay buttons", async () => (await buttonDisabled(page, "Fan ON")) === false, 120000);
  });

  await step("D1", async () => {
    const since = Date.now();
    const offset = serialText().length;
    await click(page, "Fan ON");
    await waitResult("D1 Fan ON from dashboard -> APPLIED", "fan", since, (result) => result.result === "APPLIED");
    await waitFor("D1 Serial shows relay fan GPIO26 -> ON", () => /RELAY fan GPIO26 OFF -> ON/.test(serialSince(offset)), 10000);
    await shot(page, "w8-04-fan-on-applied.jpg");
  });

  await step("D2", async () => {
    const since = Date.now();
    await waitFor("Fan OFF button ready", async () => (await buttonDisabled(page, "Fan OFF")) === false);
    await click(page, "Fan OFF");
    await waitResult("D2 Fan OFF from dashboard -> APPLIED", "fan", since, (result) => result.result === "APPLIED" && result.state === "OFF");
  });

  await step("D3", async () => {
    const since = Date.now();
    await click(page, "Light ON");
    await waitResult("D3 Light ON from dashboard -> APPLIED", "light", since, (result) => result.result === "APPLIED" && result.state === "ON");
  });

  await step("D4", async () => {
    const since = Date.now();
    const offset = serialText().length;
    await click(page, "AUTO");
    await waitFor("D4 AUTO: three AUTO commands APPLIED", () => history().filter((event) => event.event === "command_result" && event.mode === "AUTO" && event.source === "dashboard" && event.result === "APPLIED" && Date.parse(event.at) >= since).length >= 3, 20000);
    await waitFor("D4 firmware reports mode AUTO for every relay", () => (serialSince(offset).match(/MQTT command \S+: mode=AUTO/g) || []).length >= 3, 15000);
    await shot(page, "w8-05-back-to-auto.jpg");
  });

  // TTL: lenh 60 s tu nut test (di qua gateway) -> firmware tu het han ve AUTO.
  await step("D5", async () => {
    await click(page, "MANUAL");
    await waitFor("MANUAL again", async () => (await buttonDisabled(page, "Fan ON")) === false, 120000);
    const since = Date.now();
    const offset = serialText().length;
    await inject("nguoi3-orchid-btn-fan-on", "editor test button ON fan (60s)");
    await waitResult("D5 Fan ON ttl 60 s -> APPLIED", "fan", since, (result) => result.result === "APPLIED" && result.ttl_s === 60);
    // Wokwi chay ~77% toc do that: 60 s mo phong ~ 80 s dong ho may.
    await waitFor("D5 firmware expires the override after 60 s", () => /MQTT override expired: fan -> AUTO/.test(serialSince(offset)), 150000);
  });

  // LOCKOUT: dashboard khoa nut, lenh ep di van bi firmware tu choi.
  await step("D6", async () => {
    const offset = serialText().length;
    tx("FAULT WATER LOW");
    await waitFor("D6 dashboard shows WATER_LOCKOUT", async () => (await widgetText(page, "Mist")) === "WATER_LOCKOUT", 30000);
    await waitFor("D6 Mist ON button locked during lockout", async () => (await buttonDisabled(page, "Mist ON")) === true, 10000);
    await shot(page, "w8-06-lockout-button-locked.jpg");
    const since = Date.now();
    await inject("nguoi3-orchid-btn-mist-on", "editor test button ON mist (60s) while LOCKOUT");
    const rejected = await waitResult("D6 forced Mist ON -> firmware REJECTED WATER_LOCKOUT", "mist", since, (result) => result.result === "REJECTED");
    log(`    reason=${rejected.reason}`);
    if (/RELAY mist GPIO25 OFF -> ON/.test(serialSince(offset))) throw new Error("mist relay turned on during lockout");
    log("OK  D6 mist relay never switched on during lockout");
    tx("FAULT WATER OFF");
    await waitFor("D6 water refilled, lockout cleared", async () => !["WATER_LOCKOUT"].includes(await widgetText(page, "Mist")), 40000);
  });

  // Lenh lap lien tuc: mist ON lap lai moi ~3 s khong keo dai thoi gian phun (build test: toi da 15 s).
  await step("D7", async () => {
    await waitFor("Mist ON button ready", async () => (await buttonDisabled(page, "Mist ON")) === false, 60000);
    const offset = serialText().length;
    const since = Date.now();
    await click(page, "Mist ON");
    await waitResult("D7 Mist ON -> APPLIED", "mist", since, (result) => result.result === "APPLIED");
    for (let index = 0; index < 7; index += 1) {
      await sleep(3000);
      await inject("nguoi3-orchid-btn-mist-on", `repeat Mist ON #${index + 1}`);
    }
    await waitFor("D7 firmware still cuts the mist at the run limit", () => /MQTT mist safety limit reached; entering cooldown/.test(serialSince(offset)), 60000);
    await sleep(4000);
    const mistResults = history().filter((event) => event.event === "command_result" && event.relay === "mist" && Date.parse(event.at) >= since);
    log(`    repeated mist results: ${mistResults.map((event) => `${event.result}${event.reason ? `(${event.reason})` : ""}`).join(", ")}`);
  });

  // Hai lenh trung nhau lien tiep: lenh thu hai bi chan BUSY, khong gui trung xuong firmware.
  await step("D8", async () => {
    const since = Date.now();
    await Promise.all([inject("nguoi3-orchid-btn-fan-on", "duplicate Fan ON #1"), inject("nguoi3-orchid-btn-fan-on", "duplicate Fan ON #2")]);
    await waitFor("D8 one Fan ON applied, the duplicate BLOCKED BUSY", () => {
      const results = history().filter((event) => event.event === "command_result" && event.relay === "fan" && Date.parse(event.at) >= since);
      return results.some((event) => event.result === "APPLIED") && results.some((event) => event.reason === "BUSY");
    }, 15000);
  });

  // Lenh mat tren duong di: NO_ACK sau 6 s, relay khong doi.
  await step("D9", async () => {
    tx("FAULT CMD DROP ON");
    await sleep(1500);
    const since = Date.now();
    const offset = serialText().length;
    await waitFor("Light ON button ready", async () => (await buttonDisabled(page, "Light ON")) === false, 15000);
    await click(page, "Light ON");
    await waitResult("D9 dropped command -> NO_ACK after 6 s", "light", since, (result) => result.result === "NO_ACK", 15000);
    if (/RELAY light GPIO27/.test(serialSince(offset))) throw new Error("light relay changed although the command was dropped");
    if (!/TEST command dropped/.test(serialSince(offset))) throw new Error("NO_ACK but firmware did not log the dropped command (Wokwi paused?)");
    log("OK  D9 light relay unchanged");
    await shot(page, "w8-07-no-ack.jpg");
    tx("FAULT CMD DROP OFF");
    await sleep(1500);
  });

  // Mat ket noi roi tu noi lai: lenh sau khi noi lai van chay.
  await step("D10", async () => {
    const offset = serialText().length;
    tx("FAULT MQTT DROP");
    await waitFor("D10 firmware clears overrides on link loss", () => /SAFETY MQTT link lost/.test(serialSince(offset)), 20000);
    await waitFor("D10 dashboard OFFLINE (LWT)", async () => (await widgetText(page, "Device link")) === "OFFLINE", 30000);
    await shot(page, "w8-08-offline.jpg");
    await waitFor("D10 firmware reconnects", () => /MQTT connected; subscriptions=OK/.test(serialSince(offset)), 120000);
    await waitFor("D10 dashboard ONLINE again", async () => (await widgetText(page, "Device link")) === "ONLINE", 30000);
    const since = Date.now();
    await waitFor("Fan ON button ready after reconnect", async () => (await buttonDisabled(page, "Fan ON")) === false, 15000);
    await click(page, "Fan ON");
    await waitResult("D10 command after reconnect -> APPLIED", "fan", since, (result) => result.result === "APPLIED");
  });

  await click(page, "AUTO");
  await sleep(4000);
  await shot(page, "w8-09-final.jpg");
  log(`PASS week 8 run (waited for Wokwi to resume ${pausedWaits} time(s), ${Math.round(pausedMs / 1000)} s paused in total)`);
  await browser.close();
  process.exit(0);
})().catch((error) => {
  log(`FAIL ${error.stack || error}`);
  process.exit(1);
});
