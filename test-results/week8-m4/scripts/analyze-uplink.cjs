// Doi chieu uplink: dong "T: ..." tren Serial <-> goi telemetry tren broker <-> so tren dashboard.
const fs = require("node:fs");
const path = require("node:path");
// Thu muc lam viec: W8_DIR (mac dinh: thu muc chua script); log doc/ghi o W8_OUT (mac dinh: $W8_DIR/out).
const OUT = process.env.W8_OUT || path.join(process.env.W8_DIR || __dirname, "out");
const read = (name) => fs.readFileSync(path.join(OUT, name), "utf8").split("\n").filter(Boolean);
const driverLines = read("driver.log");
const startLine = driverLines.find((line) => line.includes("PHASE U uplink"));
const endLine = driverLines.find((line) => line.includes("PHASE D downlink"));
const windowStart = Date.parse(startLine.slice(0, 24));
const windowEnd = Date.parse(endLine.slice(0, 24));
const inWindow = (time) => time >= windowStart && time <= windowEnd;

const serial = read("serial.log").map((line) => {
  const match = line.match(/^(\S+) T: (\S+) C \| RH: (\S+) % \| Light ADC: (\d+) \| Water ADC: (\d+) \| Mist: (\S+) \| Fan: (\S+) \| Grow light: (\S+)/);
  if (!match) return null;
  const number = (text) => (text === "nan" ? null : Number(text));
  return { at: Date.parse(match[1]), iso: match[1], temperature: number(match[2]), humidity: number(match[3]), light: Number(match[4]), water: Number(match[5]), mist: match[6] };
}).filter((row) => row && inWindow(row.at));

const allTelemetry = read("mqtt-wire.log").map((line) => {
  const match = line.match(/^(\S+) - garden\/orchid\/orchid-01\/telemetry (.*)$/);
  if (!match) return null;
  const body = JSON.parse(match[2]);
  return { at: Date.parse(match[1]), iso: match[1], ...body };
}).filter(Boolean);
const telemetry = allTelemetry.filter((row) => inWindow(row.at));

// Ghep moi dong Serial voi goi telemetry dau tien den sau no (trong 3 s).
const used = new Set();
const pairs = [];
for (const row of serial) {
  const index = telemetry.findIndex((item, position) => !used.has(position) && item.at >= row.at - 200 && item.at <= row.at + 3000);
  if (index < 0) {
    pairs.push({ serial: row, telemetry: null });
    continue;
  }
  used.add(index);
  pairs.push({ serial: row, telemetry: telemetry[index] });
}
const sameNumber = (a, b) => (a === null || b === null ? a === b : Math.abs(a - b) < 0.051);
const matched = pairs.filter(({ serial: s, telemetry: t }) => t && sameNumber(s.temperature, t.temperature_c) && sameNumber(s.humidity, t.humidity_pct) && s.light === t.light_adc && s.water === t.water_adc);
const mismatched = pairs.filter((pair) => pair.telemetry && !matched.includes(pair));
const missing = pairs.filter((pair) => !pair.telemetry);
const latencies = matched.map(({ serial: s, telemetry: t }) => t.at - s.at).sort((a, b) => a - b);
const percentile = (list, p) => list[Math.min(list.length - 1, Math.floor((list.length - 1) * p))];

// Dashboard: so voi goi telemetry moi nhat (hoac goi lien truoc) da toi may truoc thoi diem doc
// (ke ca goi den truoc luc bat dau cua so, cho mau dau tien).
const samples = read("dashboard-samples.jsonl").map((line) => JSON.parse(line));
const fmt = (value, suffix) => (value === null || value === undefined ? "—" : `${value}${suffix}`);
let dashboardMatches = 0;
const dashboardRows = samples.map((sample) => {
  const at = Date.parse(sample.at);
  const before = allTelemetry.filter((item) => item.at <= at);
  const candidates = before.slice(-2);
  const expectations = candidates.map((item) => ({
    temperature: sample.temperature === "DHT fault" ? "DHT fault" : fmt(item.temperature_c, " °C"),
    humidity: sample.humidity === "DHT fault" ? "DHT fault" : fmt(item.humidity_pct, " %"),
    light: String(item.light_adc), water: String(item.water_adc),
  }));
  const ok = expectations.some((expected) => expected.temperature === sample.temperature && expected.humidity === sample.humidity && expected.light === sample.light_adc && expected.water === sample.water_adc);
  if (ok) dashboardMatches += 1;
  return { sample, ok, expected: expectations.at(-1) };
});
const unitsOk = samples.every((sample) => sample.temperature === "DHT fault" || sample.temperature === "—" || / °C$/.test(sample.temperature))
  && samples.every((sample) => sample.humidity === "DHT fault" || sample.humidity === "—" || / %$/.test(sample.humidity));
const links = samples.reduce((counts, sample) => ({ ...counts, [sample.link]: (counts[sample.link] || 0) + 1 }), {});

const minutes = ((windowEnd - windowStart) / 60000).toFixed(1);
const lines = [];
lines.push(`- Thời gian uplink: ${new Date(windowStart).toISOString()} → ${new Date(windowEnd).toISOString()} (${minutes} phút)`);
lines.push(`- Dòng \`T: …\` trên Serial: ${serial.length}; gói \`telemetry\` trên broker: ${telemetry.length}`);
lines.push(`- Serial ↔ MQTT khớp đủ 4 giá trị (nhiệt độ, độ ẩm, ADC ánh sáng, ADC nước): **${matched.length}/${pairs.length}**; lệch: ${mismatched.length}; Serial không có gói MQTT: ${missing.length}`);
if (latencies.length) lines.push(`- Độ trễ Serial → broker → máy ghi: trung vị ${percentile(latencies, 0.5)} ms, p95 ${percentile(latencies, 0.95)} ms, lớn nhất ${latencies.at(-1)} ms`);
lines.push(`- Mẫu dashboard (5 s/lần): ${samples.length}; khớp với gói telemetry mới nhất: **${dashboardMatches}/${samples.length}**; đơn vị °C và % đúng: ${unitsOk ? "có" : "KHÔNG"}`);
lines.push(`- Trạng thái kết nối trên dashboard trong lúc đọc: ${Object.entries(links).map(([key, value]) => `${key} ${value}`).join(", ")}`);
fs.writeFileSync(path.join(OUT, "uplink-summary.md"), lines.join("\n") + "\n");

const table = ["| Thời điểm (UTC) | Serial | MQTT `telemetry` | Dashboard | Khớp |", "| --- | --- | --- | --- | --- |"];
let lastMinute = -1;
for (const { sample, ok } of dashboardRows) {
  const at = Date.parse(sample.at);
  const minute = Math.floor((at - windowStart) / 60000);
  const interesting = !ok || sample.temperature === "DHT fault" || Number(sample.water_adc) < 1500;
  if (minute === lastMinute && !interesting) continue;
  lastMinute = minute;
  const serialRow = serial.filter((row) => row.at <= at).at(-1);
  const telemetryRow = allTelemetry.filter((row) => row.at <= at).at(-1);
  if (!serialRow || !telemetryRow) continue;
  const serialText = `${serialRow.temperature ?? "nan"} °C, ${serialRow.humidity ?? "nan"} %, L ${serialRow.light}, W ${serialRow.water}, ${serialRow.mist}`;
  const mqttText = `${telemetryRow.temperature_c ?? "null"}, ${telemetryRow.humidity_pct ?? "null"}, ${telemetryRow.light_adc}, ${telemetryRow.water_adc}`;
  const dashboardText = `${sample.temperature}, ${sample.humidity}, ${sample.light_adc}, ${sample.water_adc}, ${sample.mist}, ${sample.link}`;
  table.push(`| ${sample.at.slice(11, 19)} | ${serialText} | ${mqttText} | ${dashboardText} | ${ok ? "✓" : "✗"} |`);
}
fs.writeFileSync(path.join(OUT, "uplink-table.md"), table.join("\n") + "\n");
const csv = ["serial_time,serial_temp,serial_rh,serial_light,serial_water,mqtt_time,mqtt_temp,mqtt_rh,mqtt_light,mqtt_water,latency_ms,match"];
for (const pair of pairs) {
  const s = pair.serial;
  const t = pair.telemetry || {};
  csv.push([s.iso, s.temperature, s.humidity, s.light, s.water, t.iso || "", t.temperature_c ?? "", t.humidity_pct ?? "", t.light_adc ?? "", t.water_adc ?? "", t.at ? t.at - s.at : "", matched.includes(pair) ? 1 : 0].join(","));
}
fs.writeFileSync(path.join(OUT, "uplink-serial-vs-mqtt.csv"), csv.join("\n") + "\n");
console.log(lines.join("\n"));
if (mismatched.length) console.log("MISMATCH", JSON.stringify(mismatched.slice(0, 3)));
const badDashboard = dashboardRows.filter((row) => !row.ok).slice(0, 5);
if (badDashboard.length) console.log("DASHBOARD MISMATCH", JSON.stringify(badDashboard));
