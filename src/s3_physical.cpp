#include <Arduino.h>
#include <DHT.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

#if __has_include("orchid_secrets.h")
#include "orchid_secrets.h"
#endif

#ifndef ORCHID_WIFI_SSID
#define ORCHID_WIFI_SSID "Wokwi-GUEST"
#endif

#ifndef ORCHID_WIFI_PASSWORD
#define ORCHID_WIFI_PASSWORD ""
#endif

#ifndef ORCHID_DEVICE_ID
#define ORCHID_DEVICE_ID "orchid-01"
#endif

namespace Pins {
constexpr uint8_t dht = 4;
constexpr uint8_t ldr = 1;
constexpr uint8_t water = 2;
constexpr uint8_t lightRelay = 5;
constexpr uint8_t fanRelay = 6;
constexpr uint8_t mistRelay = 7;
constexpr uint8_t displaySck = 12;
constexpr uint8_t displayMosi = 11;
constexpr uint8_t displayCs = 10;
constexpr uint8_t displayDc = 9;
constexpr uint8_t displayRst = 8;
}

namespace Thresholds {
constexpr float mistHumidityOn = 65.0f;
constexpr float mistHumidityOff = 80.0f;
constexpr float fanTemperatureOn = 33.0f;
constexpr float fanTemperatureOff = 31.0f;
constexpr float fanHumidityOn = 90.0f;
constexpr float fanHumidityOff = 85.0f;
constexpr int lightOnAdc = 2200;
constexpr int lightOffAdc = 1800;
constexpr int waterLowAdc = 1200;
constexpr int waterRefilledAdc = 1500;
constexpr unsigned long maxMistDurationMs = 120000UL;
constexpr unsigned long mistCooldownMs = 60000UL;
constexpr unsigned long sampleIntervalMs = 2500UL;
}

namespace Filtering {
constexpr size_t windowSize = 5;
constexpr float maxTemperatureJump = 8.0f;
constexpr float maxHumidityJump = 20.0f;
constexpr int maxAdcJump = 1200;
constexpr uint8_t maxConsecutiveRejects = 3;
}

namespace NetworkConfig {
constexpr char brokerHost[] = "broker.emqx.io";
constexpr uint16_t brokerPort = 1883;
constexpr unsigned long wifiRetryIntervalMs = 10000UL;
constexpr unsigned long mqttRetryIntervalMs = 5000UL;
constexpr uint32_t maxManualTtlSeconds = 3600;
constexpr size_t commandBufferSize = 384;  // payload lenh/config toi da 383 byte; dai hon -> ACK REJECTED PAYLOAD_TOO_LARGE
constexpr size_t maxAckRequestIdLength = 96;
constexpr size_t mqttPacketBufferSize = 512;  // goi MQTT gom header + topic + payload, phai lon hon commandBufferSize
}

namespace DisplayConfig {
constexpr uint16_t width = 240;
constexpr uint16_t height = 240;
constexpr int16_t valueX = 108;
constexpr uint16_t valueWidth = width - valueX - 4;
constexpr int16_t firstRowY = 34;
constexpr int16_t rowHeight = 28;
}

struct FilteredSensors {
  float temperatureRaw = NAN;
  float temperature = 0;
  float humidityRaw = NAN;
  float humidity = 0;
  int lightRaw = 0;
  int lightFiltered = 0;
  int waterRaw = 0;
  int waterFiltered = 0;
  bool dhtValid = false;
};

template <typename T>
struct RunningAverage {
  T values[Filtering::windowSize] = {};
  size_t count = 0;
  size_t next = 0;

  T add(T value) {
    values[next] = value;
    next = (next + 1) % Filtering::windowSize;
    if (count < Filtering::windowSize) count++;
    T total = 0;
    for (size_t index = 0; index < count; index++) total += values[index];
    return total / count;
  }

  T last() const {
    return count == 0 ? T{} : values[(next + Filtering::windowSize - 1) % Filtering::windowSize];
  }
};

enum class MistState : uint8_t { Idle, Running, Cooldown, WaterLockout };
enum class SwitchState : uint8_t { Off, On };

DHT dhtSensor(Pins::dht, DHT22);
Adafruit_ST7789 display(&SPI, Pins::displayCs, Pins::displayDc, Pins::displayRst);
RunningAverage<float> temperatureFilter;
RunningAverage<float> humidityFilter;
RunningAverage<int> lightFilter;
RunningAverage<int> waterFilter;
MistState mistState = MistState::Idle;
SwitchState fanState = SwitchState::Off;
SwitchState lightState = SwitchState::Off;
unsigned long mistStateSince = 0;
unsigned long lastSampleAt = 0;
uint8_t temperatureRejects = 0;
uint8_t humidityRejects = 0;
uint8_t lightRejects = 0;
uint8_t waterRejects = 0;

struct RelayOverride {
  bool active = false;
  bool on = false;
  unsigned long startedAt = 0;
  unsigned long ttlMs = 0;
};

RelayOverride mistOverride;
RelayOverride fanOverride;
RelayOverride lightOverride;
WiFiClient networkSocket;
PubSubClient mqttClient(networkSocket);
char telemetryTopic[96];
char stateTopic[96];
char availabilityTopic[96];
char commandTopics[3][96];
char ackTopic[96];
unsigned long lastWifiAttemptAt = 0;
unsigned long lastMqttAttemptAt = 0;
int latestWaterAdc = 0;
bool latestWaterValid = false;
bool wifiWasConnected = false;
bool mqttWasConnected = false;
bool mistRelayOn = false;
bool fanRelayOn = false;
bool lightRelayOn = false;

void drawDisplayValue(uint8_t row, const char* value, uint16_t color = ST77XX_CYAN) {
  const int16_t y = DisplayConfig::firstRowY + row * DisplayConfig::rowHeight;
  display.fillRect(DisplayConfig::valueX, y, DisplayConfig::valueWidth, 20, ST77XX_BLACK);
  display.setTextColor(color, ST77XX_BLACK);
  display.setCursor(DisplayConfig::valueX, y);
  display.print(value);
}

void initializeDisplay() {
  SPI.begin(Pins::displaySck, -1, Pins::displayMosi, Pins::displayCs);
  display.init(DisplayConfig::width, DisplayConfig::height);
  display.setRotation(0);
  display.fillScreen(ST77XX_BLACK);
  display.setTextSize(2);
  display.setTextWrap(false);
  display.setTextColor(ST77XX_YELLOW, ST77XX_BLACK);
  display.setCursor(8, 8);
  display.print("ORCHID GARDEN");
  display.drawFastHLine(8, 28, DisplayConfig::width - 16, ST77XX_BLUE);

  const char* labels[] = {"TEMP", "HUM", "LDR", "WATER", "MIST", "FAN", "LIGHT"};
  for (uint8_t row = 0; row < sizeof(labels) / sizeof(labels[0]); row++) {
    display.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
    display.setCursor(8, DisplayConfig::firstRowY + row * DisplayConfig::rowHeight);
    display.print(labels[row]);
  }
}

const char* displayMistState(MistState state) {
  switch (state) {
    case MistState::Idle: return "IDLE";
    case MistState::Running: return "RUNNING";
    case MistState::Cooldown: return "COOLDOWN";
    case MistState::WaterLockout: return "LOW WATER";
  }
  return "UNKNOWN";
}

void updateDisplay(const FilteredSensors& sensors) {
  char value[20];
  if (sensors.dhtValid) {
    snprintf(value, sizeof(value), "%.1f C", sensors.temperature);
  } else {
    snprintf(value, sizeof(value), "DHT ERROR");
  }
  drawDisplayValue(0, value, sensors.dhtValid ? ST77XX_CYAN : ST77XX_RED);

  if (sensors.dhtValid) {
    snprintf(value, sizeof(value), "%.1f %%", sensors.humidity);
  } else {
    snprintf(value, sizeof(value), "DHT ERROR");
  }
  drawDisplayValue(1, value, sensors.dhtValid ? ST77XX_CYAN : ST77XX_RED);

  snprintf(value, sizeof(value), "%d", sensors.lightFiltered);
  drawDisplayValue(2, value);
  snprintf(value, sizeof(value), "%d", sensors.waterFiltered);
  drawDisplayValue(3, value);
  drawDisplayValue(4, mistRelayOn ? "ON" : displayMistState(mistState),
                   mistRelayOn ? ST77XX_GREEN : ST77XX_CYAN);
  drawDisplayValue(5, fanRelayOn ? "ON" : "OFF",
                   fanRelayOn ? ST77XX_GREEN : ST77XX_CYAN);
  drawDisplayValue(6, lightRelayOn ? "ON" : "OFF",
                   lightRelayOn ? ST77XX_GREEN : ST77XX_CYAN);
}

// Thoi gian da troi qua tu moc 'since' toi 'now'. Lenh MQTT xu ly trong cung vong loop() dat moc
// bang millis() (muon hon 'now' lay o dau vong); 'now - since' am se tran thanh so rat lon (unsigned)
// va lenh MANUAL bi coi la het TTL ngay. Moc nam sau 'now' thi tinh la 0 ms.
unsigned long elapsedMs(unsigned long now, unsigned long since) {
  const unsigned long diff = now - since;
  return diff > 0x7FFFFFFFUL ? 0UL : diff;
}

void setRelay(uint8_t pin, bool on) {
  digitalWrite(pin, on ? HIGH : LOW);
}

template <typename T>
T rejectSpike(T rawValue, T previousValue, T maximumJump, bool hasPrevious, uint8_t& rejects) {
  if (hasPrevious && abs(rawValue - previousValue) > maximumJump &&
      ++rejects < Filtering::maxConsecutiveRejects) {
    return previousValue;
  }
  rejects = 0;
  return rawValue;
}

FilteredSensors readFilteredSensors() {
  FilteredSensors sensors;
  sensors.lightRaw = analogRead(Pins::ldr);
  sensors.waterRaw = analogRead(Pins::water);
  sensors.temperatureRaw = dhtSensor.readTemperature();
  sensors.humidityRaw = dhtSensor.readHumidity();
  sensors.dhtValid = !isnan(sensors.temperatureRaw) && !isnan(sensors.humidityRaw);

  if (sensors.dhtValid) {
    const bool hasPrevious = temperatureFilter.count > 0 && humidityFilter.count > 0;
    sensors.temperature = temperatureFilter.add(rejectSpike(
        sensors.temperatureRaw, temperatureFilter.last(), Filtering::maxTemperatureJump,
        hasPrevious, temperatureRejects));
    sensors.humidity = humidityFilter.add(rejectSpike(
        sensors.humidityRaw, humidityFilter.last(), Filtering::maxHumidityJump,
        hasPrevious, humidityRejects));
  } else {
    sensors.temperature = temperatureFilter.last();
    sensors.humidity = humidityFilter.last();
  }

  sensors.lightFiltered = lightFilter.add(rejectSpike(
      sensors.lightRaw, lightFilter.last(), Filtering::maxAdcJump, lightFilter.count > 0,
      lightRejects));
  sensors.waterFiltered = waterFilter.add(rejectSpike(
      sensors.waterRaw, waterFilter.last(), Filtering::maxAdcJump, waterFilter.count > 0,
      waterRejects));
  return sensors;
}

const char* mistStateName(MistState state) {
  switch (state) {
    case MistState::Idle: return "IDLE";
    case MistState::Running: return "RUNNING";
    case MistState::Cooldown: return "COOLDOWN";
    case MistState::WaterLockout: return "WATER_LOCKOUT";
  }
  return "?";
}

void setMistState(MistState next, unsigned long now);

bool anyManualOverride() {
  return mistOverride.active || fanOverride.active || lightOverride.active;
}

void publishJson(const char* topic, JsonDocument& document, bool retained = false) {
  char payload[NetworkConfig::commandBufferSize];
  const size_t length = serializeJson(document, payload, sizeof(payload));
  if (length == 0 || length >= sizeof(payload)) {
    Serial.printf("MQTT publish failed: JSON too large for %s\n", topic);
    return;
  }
  if (!mqttClient.publish(topic, payload, retained)) {
    Serial.printf("MQTT publish failed: topic=%s\n", topic);
  }
}

void publishAck(const char* requestId, const char* result, const char* reason = "") {
  if (!mqttClient.connected()) return;
  JsonDocument document;
  document["request_id"] = requestId;
  document["result"] = result;
  if (reason[0] != '\0') document["reason"] = reason;
  publishJson(ackTopic, document);
}

void publishState() {
  if (!mqttClient.connected()) return;
  JsonDocument document;
  document["mist"] = mistRelayOn ? "ON" : "OFF";
  document["fan"] = fanRelayOn ? "ON" : "OFF";
  document["light"] = lightRelayOn ? "ON" : "OFF";
  document["mist_state"] = mistStateName(mistState);
  document["water_lockout"] = mistState == MistState::WaterLockout;
  document["mode"] = anyManualOverride() ? "MANUAL" : "AUTO";
  publishJson(stateTopic, document, true);
}

void publishTelemetry(const FilteredSensors& sensors) {
  if (!mqttClient.connected()) return;
  JsonDocument document;
  if (sensors.dhtValid || temperatureFilter.count > 0) {
    document["temperature_c"] = sensors.temperature;
    document["humidity_pct"] = sensors.humidity;
  } else {
    document["temperature_c"] = nullptr;
    document["humidity_pct"] = nullptr;
  }
  document["light_adc"] = sensors.lightFiltered;
  document["water_adc"] = sensors.waterFiltered;
  publishJson(telemetryTopic, document);
}

void applyRelayOutputs() {
  const bool waterLockout = mistState == MistState::WaterLockout ||
      (latestWaterValid && latestWaterAdc < Thresholds::waterLowAdc);
  const bool mistSafetyAllowsOn = !waterLockout && mistState != MistState::Cooldown;
  const bool requestedMistOn = mistOverride.active
      ? mistOverride.on
      : mistState == MistState::Running;
  mistRelayOn = requestedMistOn && (!mistOverride.active || mistSafetyAllowsOn);
  fanRelayOn = fanOverride.active ? fanOverride.on : fanState == SwitchState::On;
  lightRelayOn = lightOverride.active ? lightOverride.on : lightState == SwitchState::On;

  setRelay(Pins::mistRelay, mistRelayOn);
  setRelay(Pins::fanRelay, fanRelayOn);
  setRelay(Pins::lightRelay, lightRelayOn);
}

void expireManualOverrides(unsigned long now) {
  RelayOverride* overrides[] = {&mistOverride, &fanOverride, &lightOverride};
  const char* names[] = {"mist", "fan", "light"};
  for (size_t index = 0; index < sizeof(overrides) / sizeof(overrides[0]); index++) {
    RelayOverride& relayOverride = *overrides[index];
    if (relayOverride.active && elapsedMs(now, relayOverride.startedAt) >= relayOverride.ttlMs) {
      relayOverride.active = false;
      Serial.printf("MQTT override expired: %s -> AUTO\n", names[index]);
    }
  }

  if (mistOverride.active && mistOverride.on &&
      elapsedMs(now, mistOverride.startedAt) >= Thresholds::maxMistDurationMs) {
    mistOverride.active = false;
    setMistState(MistState::Cooldown, now);
    Serial.println("MQTT mist safety limit reached; entering cooldown");
  }

  if (mistOverride.active && mistOverride.on &&
      (mistState == MistState::WaterLockout ||
       (latestWaterValid && latestWaterAdc < Thresholds::waterLowAdc))) {
    mistOverride.active = false;
    Serial.println("MQTT mist override cancelled: WATER_LOCKOUT");
  }
}

void handleMqttMessage(char* topic, byte* payload, unsigned int length) {
  if (length == 0) {
    Serial.println("MQTT command rejected: empty payload");
    return;
  }
  if (length >= NetworkConfig::commandBufferSize) {
    // BUG-02: khong bo lenh lang le. Doc rieng request_id (bo loc ArduinoJson, it RAM) roi ACK REJECTED
    // de dashboard biet ly do thay vi chi thay NO_ACK.
    Serial.printf("MQTT command rejected: payload too large length=%u (max %u)\n", length,
                  static_cast<unsigned>(NetworkConfig::commandBufferSize - 1));
    JsonDocument filter;
    filter["request_id"] = true;
    JsonDocument idOnly;
    if (deserializeJson(idOnly, payload, length, DeserializationOption::Filter(filter))) return;
    const char* requestId = idOnly["request_id"] | "";
    if (requestId[0] != '\0' && strlen(requestId) <= NetworkConfig::maxAckRequestIdLength) {
      publishAck(requestId, "REJECTED", "PAYLOAD_TOO_LARGE");
    }
    return;
  }

  JsonDocument document;
  const DeserializationError error = deserializeJson(document, payload, length);
  if (error) {
    Serial.printf("MQTT command rejected: invalid JSON (%s)\n", error.c_str());
    return;
  }

  const char* requestId = document["request_id"] | "";
  const char* mode = document["mode"] | "";
  RelayOverride* target = nullptr;
  if (strcmp(topic, commandTopics[0]) == 0) target = &mistOverride;
  else if (strcmp(topic, commandTopics[1]) == 0) target = &fanOverride;
  else if (strcmp(topic, commandTopics[2]) == 0) target = &lightOverride;
  if (target == nullptr) return;

  if (requestId[0] == '\0') {
    Serial.println("MQTT command rejected: request_id is required");
    return;
  }

  if (strcmp(mode, "AUTO") == 0) {
    target->active = false;
    applyRelayOutputs();
    publishAck(requestId, "APPLIED", "AUTO");
    publishState();
    return;
  }

  if (strcmp(mode, "MANUAL") != 0) {
    publishAck(requestId, "REJECTED", "INVALID_MODE");
    return;
  }

  const char* state = document["state"] | "";
  if (strcmp(state, "ON") != 0 && strcmp(state, "OFF") != 0) {
    publishAck(requestId, "REJECTED", "INVALID_STATE");
    return;
  }
  const uint32_t ttlSeconds = document["ttl_s"] | 0U;
  if (ttlSeconds == 0 || ttlSeconds > NetworkConfig::maxManualTtlSeconds) {
    publishAck(requestId, "REJECTED", "INVALID_TTL");
    return;
  }

  const bool turnOn = strcmp(state, "ON") == 0;
  if (target == &mistOverride && turnOn) {
    if (!latestWaterValid || latestWaterAdc < Thresholds::waterLowAdc ||
        mistState == MistState::WaterLockout) {
      publishAck(requestId, "REJECTED", "WATER_LOCKOUT");
      return;
    }
    if (mistState == MistState::Cooldown) {
      publishAck(requestId, "REJECTED", "MIST_COOLDOWN");
      return;
    }
  }

  target->active = true;
  target->on = turnOn;
  target->startedAt = millis();
  target->ttlMs = static_cast<unsigned long>(ttlSeconds) * 1000UL;
  applyRelayOutputs();
  publishAck(requestId, "APPLIED");
  publishState();
  Serial.printf("MQTT command %s: mode=MANUAL state=%s ttl_s=%lu\n",
                requestId, state, static_cast<unsigned long>(ttlSeconds));
}

void initializeMqttTopics() {
  snprintf(telemetryTopic, sizeof(telemetryTopic),
           "garden/orchid/%s/telemetry", ORCHID_DEVICE_ID);
  snprintf(stateTopic, sizeof(stateTopic),
           "garden/orchid/%s/state", ORCHID_DEVICE_ID);
  snprintf(availabilityTopic, sizeof(availabilityTopic),
           "garden/orchid/%s/availability", ORCHID_DEVICE_ID);
  snprintf(commandTopics[0], sizeof(commandTopics[0]),
           "garden/orchid/%s/cmd/mist", ORCHID_DEVICE_ID);
  snprintf(commandTopics[1], sizeof(commandTopics[1]),
           "garden/orchid/%s/cmd/fan", ORCHID_DEVICE_ID);
  snprintf(commandTopics[2], sizeof(commandTopics[2]),
           "garden/orchid/%s/cmd/light", ORCHID_DEVICE_ID);
  snprintf(ackTopic, sizeof(ackTopic),
           "garden/orchid/%s/ack", ORCHID_DEVICE_ID);
}

void serviceNetwork(unsigned long now) {
  const bool wifiConnected = WiFi.status() == WL_CONNECTED;
  if (!wifiConnected) {
    if (mqttClient.connected()) mqttClient.disconnect();
    if (wifiWasConnected) Serial.println("NET Wi-Fi disconnected; retrying");
    wifiWasConnected = false;
    if (now - lastWifiAttemptAt >= NetworkConfig::wifiRetryIntervalMs) {
      lastWifiAttemptAt = now;
      Serial.printf("NET Wi-Fi connecting to %s\n", ORCHID_WIFI_SSID);
      WiFi.begin(ORCHID_WIFI_SSID, ORCHID_WIFI_PASSWORD);
    }
    return;
  }

  if (!wifiWasConnected) {
    wifiWasConnected = true;
    Serial.printf("NET Wi-Fi connected; IP=%s\n", WiFi.localIP().toString().c_str());
  }

  if (mqttClient.connected()) {
    mqttClient.loop();
    return;
  }

  if (mqttWasConnected) {
    Serial.println("MQTT disconnected; retrying");
    mqttWasConnected = false;
  }
  if (now - lastMqttAttemptAt < NetworkConfig::mqttRetryIntervalMs) return;
  lastMqttAttemptAt = now;

  char clientId[48];
  snprintf(clientId, sizeof(clientId), "orchid-%s-%08lx",
           ORCHID_DEVICE_ID, static_cast<unsigned long>(ESP.getEfuseMac() & 0xffffffffUL));
  Serial.printf("MQTT connecting to %s:%u\n", NetworkConfig::brokerHost, NetworkConfig::brokerPort);
  if (!mqttClient.connect(clientId, availabilityTopic, 1, true, "offline")) {
    Serial.printf("MQTT connect failed; state=%d\n", mqttClient.state());
    return;
  }

  mqttWasConnected = true;
  if (!mqttClient.publish(availabilityTopic, "online", true)) {
    Serial.println("MQTT publish failed: online availability");
  }
  bool subscribed = true;
  for (const char* commandTopic : commandTopics) {
    if (!mqttClient.subscribe(commandTopic, 1)) {
      Serial.printf("MQTT subscribe failed: %s\n", commandTopic);
      subscribed = false;
    }
  }
  Serial.printf("MQTT connected; subscriptions=%s\n", subscribed ? "OK" : "ERROR");
  publishState();
}

void setMistState(MistState next, unsigned long now) {
  if (next == mistState) return;
  Serial.printf("STATE mist %s -> %s\n", mistStateName(mistState), mistStateName(next));
  mistState = next;
  mistStateSince = now;
}

void updateMist(unsigned long now, float humidity, int waterAdc) {
  const bool waterLow = waterAdc < Thresholds::waterLowAdc;
  const unsigned long elapsed = elapsedMs(now, mistStateSince);
  switch (mistState) {
    case MistState::Idle:
      if (waterLow) setMistState(MistState::WaterLockout, now);
      else if (humidity < Thresholds::mistHumidityOn) setMistState(MistState::Running, now);
      break;
    case MistState::Running:
      if (waterLow) setMistState(MistState::WaterLockout, now);
      else if (humidity >= Thresholds::mistHumidityOff) setMistState(MistState::Idle, now);
      else if (elapsed >= Thresholds::maxMistDurationMs) setMistState(MistState::Cooldown, now);
      break;
    case MistState::Cooldown:
      if (waterLow) setMistState(MistState::WaterLockout, now);
      else if (elapsed >= Thresholds::mistCooldownMs) setMistState(MistState::Idle, now);
      break;
    case MistState::WaterLockout:
      if (waterAdc >= Thresholds::waterRefilledAdc) setMistState(MistState::Idle, now);
      break;
  }
}

void updateFan(float temperature, float humidity) {
  if (fanState == SwitchState::Off &&
      (temperature > Thresholds::fanTemperatureOn || humidity > Thresholds::fanHumidityOn)) {
    fanState = SwitchState::On;
    Serial.println("STATE fan -> ON");
  } else if (fanState == SwitchState::On &&
             temperature < Thresholds::fanTemperatureOff &&
             humidity < Thresholds::fanHumidityOff) {
    fanState = SwitchState::Off;
    Serial.println("STATE fan -> OFF");
  }
}

void updateLight(int lightAdc) {
  if (lightState == SwitchState::Off && lightAdc > Thresholds::lightOnAdc) {
    lightState = SwitchState::On;
    Serial.println("STATE light -> ON");
  } else if (lightState == SwitchState::On && lightAdc < Thresholds::lightOffAdc) {
    lightState = SwitchState::Off;
    Serial.println("STATE light -> OFF");
  }
}

void setup() {
  Serial.begin(115200);
  initializeMqttTopics();
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  mqttClient.setServer(NetworkConfig::brokerHost, NetworkConfig::brokerPort);
  mqttClient.setCallback(handleMqttMessage);
  mqttClient.setBufferSize(NetworkConfig::mqttPacketBufferSize);
  mqttClient.setSocketTimeout(1);
  mqttClient.setKeepAlive(30);
  lastWifiAttemptAt = millis() - NetworkConfig::wifiRetryIntervalMs;

  analogReadResolution(12);
  pinMode(Pins::ldr, INPUT);
  pinMode(Pins::water, INPUT);
  pinMode(Pins::mistRelay, OUTPUT);
  pinMode(Pins::fanRelay, OUTPUT);
  pinMode(Pins::lightRelay, OUTPUT);
  setRelay(Pins::mistRelay, false);
  setRelay(Pins::fanRelay, false);
  setRelay(Pins::lightRelay, false);
  initializeDisplay();
  dhtSensor.begin();
  Serial.println("Orchid garden controller - ESP32-S3 physical");
  Serial.println("Pins: DHT=GPIO4 LDR_AO=GPIO1 WATER_S=GPIO2 RELAYS light=GPIO5 fan=GPIO6 mist=GPIO7");
  Serial.println("Display: ST7789 240x240 SCK=GPIO12 MOSI=GPIO11 CS=GPIO10 DC=GPIO9 RST=GPIO8");
  Serial.println("Thresholds: mist RH<65/stop>=80, water lock<1200/refill>=1500");
  Serial.printf("MQTT device=%s broker=%s:%u\n",
                ORCHID_DEVICE_ID, NetworkConfig::brokerHost, NetworkConfig::brokerPort);
  Serial.println("MQTT topics: telemetry/state/availability/cmd/{mist,fan,light}/ack");
  Serial.println("MQTT Wi-Fi defaults to Wokwi-GUEST; configure orchid_secrets.h for a local network");
}

void loop() {
  const unsigned long now = millis();
  serviceNetwork(now);
  expireManualOverrides(now);
  applyRelayOutputs();

  if (now - lastSampleAt < Thresholds::sampleIntervalMs) return;
  lastSampleAt = now;

  const FilteredSensors sensors = readFilteredSensors();
  latestWaterAdc = sensors.waterFiltered;
  latestWaterValid = true;
  Serial.printf("RAW ldr=%d water=%d temp=%.1f humidity=%.1f | AVG ldr=%d water=%d temp=%.1f humidity=%.1f\n",
                sensors.lightRaw, sensors.waterRaw, sensors.temperatureRaw, sensors.humidityRaw,
                sensors.lightFiltered, sensors.waterFiltered, sensors.temperature, sensors.humidity);
  if (!sensors.dhtValid && temperatureFilter.count == 0) {
    Serial.println("DHT22 read failed; outputs remain OFF until first valid sample");
    updateDisplay(sensors);
    publishTelemetry(sensors);
    publishState();
    return;
  }

  updateMist(now, sensors.humidity, sensors.waterFiltered);
  updateFan(sensors.temperature, sensors.humidity);
  updateLight(sensors.lightFiltered);
  expireManualOverrides(now);
  applyRelayOutputs();
  updateDisplay(sensors);
  Serial.printf("STATE mist=%s fan=%s light=%s water_lockout=%s\n",
                mistStateName(mistState), fanState == SwitchState::On ? "ON" : "OFF",
                lightState == SwitchState::On ? "ON" : "OFF",
                mistState == MistState::WaterLockout ? "YES" : "NO");
  Serial.printf("OUTPUT mist=%s fan=%s light=%s\n",
                mistRelayOn ? "ON" : "OFF",
                fanRelayOn ? "ON" : "OFF",
                lightRelayOn ? "ON" : "OFF");
  publishTelemetry(sensors);
  publishState();
}