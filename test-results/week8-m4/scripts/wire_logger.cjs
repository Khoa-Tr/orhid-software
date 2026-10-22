// Ghi moi goi MQTT cua thiet bi tren broker that, kem thoi diem nhan.
const fs = require("node:fs");
const path = require("node:path");
const mqtt = require(process.env.W8_NODE_MODULES ? path.join(process.env.W8_NODE_MODULES, "mqtt") : "mqtt");
const out = fs.createWriteStream(process.argv[2], { flags: "a" });
const stamp = () => new Date().toISOString();
const client = mqtt.connect("mqtt://broker.emqx.io:1883", { clientId: `orchid-w8-logger-${Math.random().toString(16).slice(2, 8)}`, reconnectPeriod: 2000 });
client.on("connect", () => { out.write(`${stamp()} # logger connected\n`); client.subscribe("garden/orchid/orchid-01/#", { qos: 1 }); });
client.on("message", (topic, payload, packet) => out.write(`${stamp()} ${packet.retain ? "R" : "-"} ${topic} ${payload.toString()}\n`));
client.on("error", (error) => out.write(`${stamp()} # error ${error.message}\n`));
client.on("close", () => out.write(`${stamp()} # logger closed\n`));
