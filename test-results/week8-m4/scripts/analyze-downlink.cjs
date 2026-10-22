// Dong thoi gian tung lenh: gateway gui -> broker -> firmware nhan (CMD rx) -> relay doi -> ACK -> ket qua dashboard.
const fs = require("node:fs");
const path = require("node:path");
// Thu muc lam viec: W8_DIR (mac dinh: thu muc chua script); log doc/ghi o W8_OUT (mac dinh: $W8_DIR/out).
const OUT = process.env.W8_OUT || path.join(process.env.W8_DIR || __dirname, "out");
const read = (file) => fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
const serial = read(path.join(OUT, "serial.log")).map((line) => ({ at: Date.parse(line.slice(0, 24)), text: line.slice(25) }));
const wire = read(path.join(OUT, "mqtt-wire.log")).map((line) => ({ at: Date.parse(line.slice(0, 24)), text: line.slice(25) }));
const history = read(process.env.W8_HISTORY || path.join(process.env.W8_DIR || __dirname, "data", "orchid-history.jsonl")).map((line) => JSON.parse(line));
const driverLines = read(path.join(OUT, "driver.log"));
const downStart = Date.parse(driverLines.findLast((line) => line.includes("PHASE D downlink")).slice(0, 24));

const sent = history.filter((event) => event.event === "command_sent");
const results = new Map(history.filter((event) => event.event === "command_result").map((event) => [event.request_id || event.at, event]));
const blocked = history.filter((event) => event.event === "command_result" && !event.request_id);
const ms = (from, to) => (from && to ? `${to - from}` : "");
const clock = (time) => (time ? new Date(time).toISOString().slice(11, 23) : "—");

const rows = [];
for (const command of sent) {
  const id = command.request_id;
  const sentAt = Date.parse(command.at);
  const onWire = wire.find((line) => line.text.includes("/cmd/") && line.text.includes(`"${id}"`));
  const received = serial.find((line) => line.text.startsWith("CMD rx") && line.text.includes(`"${id}"`));
  const dropped = serial.find((line) => line.text.startsWith("TEST command dropped") && line.at >= sentAt && line.at <= sentAt + 3000 && line.text.includes(`/cmd/${command.relay}`));
  const ackSerial = serial.find((line) => line.text.startsWith(`ACK ${id} `));
  const ackWire = wire.find((line) => line.text.includes("/ack ") && line.text.includes(`"${id}"`));
  // Firmware in theo thu tu: CMD rx -> (RELAY ...) -> ACK. Chi tinh dong RELAY nam giua hai dong nay.
  const rxIndex = received ? serial.indexOf(received) : -1;
  const ackIndex = ackSerial ? serial.indexOf(ackSerial) : -1;
  const relayLine = rxIndex >= 0 && ackIndex > rxIndex ? serial.slice(rxIndex + 1, ackIndex).find((line) => line.text.startsWith(`RELAY ${command.relay} `)) : null;
  const result = results.get(id);
  rows.push({
    id, relay: command.relay, source: command.source, user: command.user,
    command: command.payload.mode === "AUTO" ? "AUTO" : `${command.payload.state} ttl ${command.payload.ttl_s}s`,
    sent: sentAt, wire: onWire && onWire.at, rx: received && received.at, relay_change: relayLine ? relayLine.text.replace(/^RELAY \S+ /, "") : dropped ? "(lệnh bị bỏ – giả lập mất lệnh)" : "không đổi",
    ack: ackSerial && ackSerial.at, ack_wire: ackWire && ackWire.at,
    result: result ? `${result.result}${result.reason ? ` (${result.reason})` : ""}` : "?", latency: result && result.latency_ms,
    phase: sentAt >= downStart ? "downlink" : "uplink",
  });
}

const header = "| Gửi (UTC) | Nguồn | Relay | Lệnh | request_id | Lên broker | Firmware nhận | Relay | ACK firmware | Kết quả dashboard |";
const table = [header, "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"];
for (const row of rows.filter((item) => item.phase === "downlink")) {
  const source = row.source === "dashboard" ? `dashboard (${row.user})` : row.source.replace("automation:", "rule ");
  table.push(`| ${clock(row.sent)} | ${source} | ${row.relay} | ${row.command} | \`${row.id}\` | +${ms(row.sent, row.wire)} ms | ${row.rx ? `+${ms(row.sent, row.rx)} ms` : "—"} | ${row.relay_change} | ${row.ack ? `+${ms(row.sent, row.ack)} ms` : "—"} | ${row.result}${row.latency ? `, ${row.latency} ms` : ""} |`);
}
const blockedRows = blocked.filter((event) => Date.parse(event.at) >= downStart).map((event) => `| ${clock(Date.parse(event.at))} | ${event.source === "dashboard" ? `dashboard (${event.user})` : event.source} | ${event.relay} | ${event.mode === "AUTO" ? "AUTO" : `${event.state} ttl ${event.ttl_s}s`} | — | không gửi | — | không đổi | — | BLOCKED (${event.reason}) |`);
fs.writeFileSync(path.join(OUT, "downlink-table.md"), [...table, ...blockedRows].join("\n") + "\n");

const csv = ["sent_utc,source,user,relay,command,request_id,wire_ms,rx_ms,relay_change,ack_ms,result,gateway_latency_ms,phase"];
for (const row of rows) csv.push([new Date(row.sent).toISOString(), row.source, row.user || "", row.relay, row.command, row.id, ms(row.sent, row.wire), ms(row.sent, row.rx), `"${row.relay_change}"`, ms(row.sent, row.ack), `"${row.result}"`, row.latency ?? "", row.phase].join(","));
fs.writeFileSync(path.join(OUT, "downlink-commands.csv"), csv.join("\n") + "\n");

const all = rows.filter((row) => row.phase === "downlink");
const counts = all.reduce((acc, row) => ({ ...acc, [row.result.split(" ")[0]]: (acc[row.result.split(" ")[0]] || 0) + 1 }), {});
const uplinkAuto = rows.filter((row) => row.phase === "uplink");
console.log(`downlink commands sent: ${all.length} ${JSON.stringify(counts)}; blocked locally: ${blockedRows.length}; automation commands during uplink: ${uplinkAuto.length} (${uplinkAuto.filter((row) => row.result.startsWith("APPLIED")).length} APPLIED)`);
const missingRx = all.filter((row) => !row.rx && !row.result.startsWith("NO_ACK"));
if (missingRx.length) console.log("NO CMD rx for", missingRx.map((row) => row.id).join(", "));
