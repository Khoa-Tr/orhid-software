const crypto = require("node:crypto");
const net = require("node:net");

const host = process.env.MQTT_HOST || "broker.emqx.io";
const port = Number(process.env.MQTT_PORT || 1883);
const runId = crypto.randomBytes(6).toString("hex");
const topic = `garden/orchid/week45-validation/${runId}/echo`;

function encodeUtf8(value) {
  const bytes = Buffer.from(value);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(bytes.length);
  return Buffer.concat([length, bytes]);
}

function encodeRemainingLength(length) {
  const bytes = [];
  do {
    let digit = length % 128;
    length = Math.floor(length / 128);
    if (length > 0) digit |= 0x80;
    bytes.push(digit);
  } while (length > 0);
  return Buffer.from(bytes);
}

function encodePacket(header, body) {
  return Buffer.concat([Buffer.from([header]), encodeRemainingLength(body.length), body]);
}

function waitForPacket(socket) {
  return new Promise((resolve, reject) => {
    let buffered = Buffer.alloc(0);
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for MQTT packet"));
    }, 8000);

    function cleanup() {
      clearTimeout(timeout);
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    function onClose() {
      cleanup();
      reject(new Error("Broker closed the MQTT connection"));
    }

    function onData(chunk) {
      buffered = Buffer.concat([buffered, chunk]);
      if (buffered.length < 2) return;

      let multiplier = 1;
      let remainingLength = 0;
      let offset = 1;
      let digit;
      do {
        if (offset >= buffered.length) return;
        digit = buffered[offset++];
        remainingLength += (digit & 0x7f) * multiplier;
        multiplier *= 128;
      } while (digit & 0x80);

      const packetLength = offset + remainingLength;
      if (buffered.length < packetLength) return;
      const packet = buffered.subarray(0, packetLength);
      const extra = buffered.subarray(packetLength);
      cleanup();
      if (extra.length > 0) socket.unshift(extra);
      resolve({ header: packet[0], body: packet.subarray(offset) });
    }

    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

function connectTcp() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`TCP connection to ${host}:${port} timed out`));
    }, 8000);
    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function verifyPublishSubscribe(sequence) {
  const socket = await connectTcp();
  try {
    const clientId = `orchid-check-${runId}-${sequence}`;
    const connectBody = Buffer.concat([
      encodeUtf8("MQTT"),
      Buffer.from([4, 2, 0, 30]),
      encodeUtf8(clientId),
    ]);
    socket.write(encodePacket(0x10, connectBody));

    let response = await waitForPacket(socket);
    if ((response.header >> 4) !== 2 || response.body[1] !== 0) {
      throw new Error(`MQTT CONNECT rejected (${response.body.toString("hex")})`);
    }

    const subscribeBody = Buffer.concat([
      Buffer.from([0, sequence]),
      encodeUtf8(topic),
      Buffer.from([0]),
    ]);
    socket.write(encodePacket(0x82, subscribeBody));
    response = await waitForPacket(socket);
    if ((response.header >> 4) !== 9) throw new Error("MQTT SUBSCRIBE failed");

    const payload = JSON.stringify({
      check: "week4-publish-subscribe",
      run_id: runId,
      sequence,
    });
    socket.write(encodePacket(0x30, Buffer.concat([encodeUtf8(topic), Buffer.from(payload)])));
    response = await waitForPacket(socket);
    if ((response.header >> 4) !== 3) throw new Error("MQTT publish echo not received");

    const topicLength = response.body.readUInt16BE(0);
    const receivedTopic = response.body.subarray(2, 2 + topicLength).toString();
    const receivedPayload = response.body.subarray(2 + topicLength).toString();
    if (receivedTopic !== topic || receivedPayload !== payload) {
      throw new Error("MQTT echo topic or payload did not match");
    }

    socket.end(Buffer.from([0xe0, 0]));
    return payload;
  } catch (error) {
    socket.destroy();
    throw error;
  }
}

(async () => {
  const first = await verifyPublishSubscribe(1);
  console.log(`PASS connect/subscribe/publish echo: ${first}`);

  const second = await verifyPublishSubscribe(2);
  console.log(`PASS reconnect/resubscribe/publish echo: ${second}`);
  console.log(`Broker: ${host}:${port}`);
  console.log(`Isolated temporary topic: ${topic}`);
  console.log("Note: This checks broker connectivity only; it does not exercise the ESP32 firmware.");
})().catch((error) => {
  console.error(`FAIL MQTT broker check: ${error.message}`);
  process.exitCode = 1;
});
