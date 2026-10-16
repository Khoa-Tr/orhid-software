#include <Arduino.h>
#include <DHT.h>
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

// ============================================================================
// TUẦN 1: CẤU HÌNH PHẦN CỨNG & SƠ ĐỒ CHÂN I/O (ESP32 MÔ PHỎNG WOKWI)
// - Cảm biến: DHT22 (GPIO15), LDR Ánh sáng (GPIO34), Cảm biến mực nước (GPIO35)
// - Relay chấp hành: Bơm phun sương (GPIO25), Quạt (GPIO26), Đèn sưởi (GPIO27)
// ============================================================================
namespace Pins {
constexpr uint8_t dht = 15;
constexpr uint8_t ldr = 34;
constexpr uint8_t water = 35;
constexpr uint8_t mistRelay = 25;
constexpr uint8_t fanRelay = 26;
constexpr uint8_t lightRelay = 27;
}

// ============================================================================
// TUẦN 3 & TUẦN 7: NGƯỠNG ĐIỀU KHIỂN & CẤU HÌNH ĐỘNG (DYNAMIC THRESHOLDS)
// - Tuần 3: Các ngưỡng hysteresis cơ bản (RH 65/80%, Temp 33/31°C, LDR 2200/1800, Water 1200/1500)
// - Tuần 7: Chuyển sang biến động để Node-RED có thể điều chỉnh qua MQTT topic /config
// ============================================================================
namespace Thresholds {
float mistHumidityOn = 65.0f;
float mistHumidityOff = 80.0f;
float fanTemperatureOn = 33.0f;
float fanTemperatureOff = 31.0f;
float fanHumidityOn = 90.0f;
float fanHumidityOff = 85.0f;
// LDR Wokwi: ADC cang CAO khi cang TOI (LDR noi tiep dien tro 10k, AO o giua)
// Den bat khi ADC > lightOnAdc (troi toi), tat khi ADC < lightOffAdc (du sang)
int lightOnAdc = 2200;
int lightOffAdc = 1800;
int waterLowAdc = 1200;
int waterRefilledAdc = 1500;
#ifdef ORCHID_TIMER_TEST
constexpr unsigned long maxMistDurationMs = 15000UL;
constexpr unsigned long mistCooldownMs = 10000UL;
#else
constexpr unsigned long maxMistDurationMs = 120000UL;
constexpr unsigned long mistCooldownMs = 60000UL;
#endif
constexpr unsigned long sampleIntervalMs = 2500UL;
}

// ============================================================================
// TUẦN 3: LỌC NHIỄU CẢM BIẾN & HIỆU CHUẨN TÍN HIỆU (NOISE FILTERING)
// - rejectSpike(): Lọc loại bỏ mẫu nhảy vọt đột biến (chống xung nhiễu)
// - RunningAverage: Bộ lọc trung bình trượt cửa sổ 5 mẫu làm mượt dữ liệu
// ============================================================================
namespace Filtering {
constexpr size_t windowSize = 5;
constexpr float maxTemperatureJump = 8.0f;
constexpr float maxHumidityJump = 20.0f;
constexpr int maxAdcJump = 1200;
constexpr uint8_t maxConsecutiveRejects = 3;
}

// ============================================================================
// TUẦN 4: THÔNG SỐ KẾT NỐI MẠNG WI-FI & MQTT BROKER
// - Broker công khai: broker.emqx.io:1883
// - Thời gian thử lại kết nối, timeout và kích thước bộ đệm lệnh
// ============================================================================
namespace NetworkConfig {
constexpr char brokerHost[] = "broker.emqx.io";
constexpr uint16_t brokerPort = 1883;
constexpr unsigned long wifiRetryIntervalMs = 10000UL;
constexpr unsigned long mqttRetryIntervalMs = 5000UL;
constexpr uint32_t maxManualTtlSeconds = 3600;
constexpr size_t commandBufferSize = 256;
}

// ============================================================================
// TUẦN 3: BỘ LỌC TÍN HIỆU & KHỞI TẠO ĐỐI TƯỢNG PHẦN CỨNG
// ============================================================================
struct FilteredSensors {
  float temperatureRaw;
  float temperature;
  float humidityRaw;
  float humidity;
  int lightRaw;
  int lightFiltered;
  int waterRaw;
  int waterFiltered;
  bool dhtValid;
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

DHT dhtSensor(Pins::dht, DHT22);
RunningAverage<float> temperatureFilter;
RunningAverage<float> humidityFilter;
RunningAverage<int> lightFilter;
RunningAverage<int> waterFilter;

// ============================================================================
// TUẦN 3: MÁY TRẠNG THÁI HỮU HẠN (FINITE STATE MACHINE - FSM)
// Mist : Idle -> Running -> (Idle | Cooldown) ; mọi trạng thái -> WaterLockout khi cạn nước
// Fan / Light : Off <-> On (hysteresis)
// ============================================================================
enum class MistState : uint8_t { Idle, Running, Cooldown, WaterLockout };
enum class SwitchState : uint8_t { Off, On };

MistState mistState = MistState::Idle;
SwitchState fanState = SwitchState::Off;
SwitchState lightState = SwitchState::Off;
unsigned long mistStateSince = 0;
unsigned long lastSampleAt = 0;

// ============================================================================
// TUẦN 6: ĐIỀU KHIỂN TỪ XA AN TOÀN & GHI ĐÈ THỦ CÔNG (NGƯỜI 3)
// - Quản lý chế độ ghi đè thủ công (MANUAL Override) kèm thời gian sống (TTL)
// - anyManualOverride(): Kiểm tra xem có thiết bị nào đang bị can thiệp tay không
// ============================================================================
struct RelayOverride {
  bool active = false;
  bool on = false;
  unsigned long startedAt = 0;
  unsigned long ttlMs = 0;
};

RelayOverride mistOverride;
RelayOverride fanOverride;
RelayOverride lightOverride;

// ============================================================================
// TUẦN 4: ĐỊA CHỈ TOPIC MQTT (UPLINK & DOWNLINK)
// - Telemetry, State, Availability, Command topics, ACK, Config
// ============================================================================
WiFiClient networkSocket;
PubSubClient mqttClient(networkSocket);
char telemetryTopic[96];
char stateTopic[96];
char availabilityTopic[96];
char commandTopics[3][96];
char ackTopic[96];
char configTopic[96];
unsigned long lastWifiAttemptAt = 0;
unsigned long lastMqttAttemptAt = 0;
unsigned long lastManualSafetyWarningAt = 0;
int latestWaterAdc = 0;
bool latestWaterValid = false;
bool wifiWasConnected = false;
bool mqttWasConnected = false;
bool mistRelayOn = false;
bool fanRelayOn = false;
bool lightRelayOn = false;

// ============================================================================
// TUẦN 1: ĐIỀU KHIỂN XUẤT TÍN HIỆU GPIO RELAY CHẤP HÀNH
// ============================================================================
void setRelay(uint8_t pin, bool on) {
  digitalWrite(pin, on ? HIGH : LOW);
}

// ============================================================================
// TUẦN 3: THUẬT TOÁN LỌC NHIỄU CẢM BIẾN (SPIKE REJECTION & RUNNING AVERAGE)
// - Loại bỏ mẫu nhiễu (nhảy đột biến). Nếu bị loại liên tiếp maxConsecutiveRejects lần
//   thì coi đó là thay đổi thật và chấp nhận giá trị mới (tránh kẹt mãi ở giá trị cũ).
// ============================================================================
template <typename T>
T rejectSpike(T rawValue, T previousValue, T maximumJump, bool hasPrevious, uint8_t& rejectCount) {
  if (hasPrevious && abs(rawValue - previousValue) > maximumJump) {
    if (++rejectCount < Filtering::maxConsecutiveRejects) {
      return previousValue;
    }
  }
  rejectCount = 0;
  return rawValue;
}

uint8_t temperatureRejects = 0;
uint8_t humidityRejects = 0;
uint8_t lightRejects = 0;
uint8_t waterRejects = 0;

// ============================================================================
// TUẦN 2 & TUẦN 3: ĐỌC TÍN HIỆU CẢM BIẾN & QUA BỘ LỌC CHỐNG NHIỄU
// ============================================================================
FilteredSensors readFilteredSensors() {
  FilteredSensors sensors{};
  sensors.lightRaw = analogRead(Pins::ldr);
  sensors.waterRaw = analogRead(Pins::water);
  const float temperatureRaw = dhtSensor.readTemperature();
  const float humidityRaw = dhtSensor.readHumidity();

  sensors.temperatureRaw = temperatureRaw;
  sensors.humidityRaw = humidityRaw;
  sensors.dhtValid = !isnan(temperatureRaw) && !isnan(humidityRaw);
  if (sensors.dhtValid) {
    const bool hasDhtPrevious = temperatureFilter.count > 0 && humidityFilter.count > 0;
    const float acceptedTemperature = rejectSpike(
        temperatureRaw, temperatureFilter.last(), Filtering::maxTemperatureJump, hasDhtPrevious,
        temperatureRejects);
    const float acceptedHumidity = rejectSpike(
        humidityRaw, humidityFilter.last(), Filtering::maxHumidityJump, hasDhtPrevious,
        humidityRejects);
    sensors.temperature = temperatureFilter.add(acceptedTemperature);
    sensors.humidity = humidityFilter.add(acceptedHumidity);
  } else {
    sensors.temperatureRaw = NAN;
    sensors.humidityRaw = NAN;
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

// ============================================================================
// TUẦN 4: ĐÓNG GÓI DỮ LIỆU JSON & XUẤT BẢN MQTT TELEMETRY / TRẠNG THÁI (UPLINK)
// ============================================================================
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
  document["mist_rh_on"] = Thresholds::mistHumidityOn;
  document["fan_temp_on"] = Thresholds::fanTemperatureOn;
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

// ============================================================================
// TUẦN 6: TẦNG CHẤP HÀNH RELAY KÈM KHÓA LIÊN ĐỘNG AN TOÀN (SAFETY INTERLOCK)
// ============================================================================
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

// ============================================================================
// TUẦN 6: QUẢN LÝ THỜI GIAN GHI ĐÈ THỦ CÔNG (TTL TIMEOUT VỀ AUTO & BẢO VỆ CHỐNG CHÁY)
// ============================================================================
void expireManualOverrides(unsigned long now) {
  RelayOverride* overrides[] = {&mistOverride, &fanOverride, &lightOverride};
  const char* names[] = {"mist", "fan", "light"};
  for (size_t index = 0; index < sizeof(overrides) / sizeof(overrides[0]); index++) {
    RelayOverride& relayOverride = *overrides[index];
    if (relayOverride.active && now - relayOverride.startedAt >= relayOverride.ttlMs) {
      relayOverride.active = false;
      Serial.printf("MQTT override expired: %s -> AUTO\n", names[index]);
    }
  }

  if (mistOverride.active && mistOverride.on &&
      now - mistOverride.startedAt >= Thresholds::maxMistDurationMs) {
    mistOverride.active = false;
    setMistState(MistState::Cooldown, now);
    Serial.println("MQTT mist safety limit reached; entering cooldown");
  }

  if (mistOverride.active && mistOverride.on &&
      (mistState == MistState::WaterLockout ||
       (latestWaterValid && latestWaterAdc < Thresholds::waterLowAdc))) {
    mistOverride.active = false;
    if (now - lastManualSafetyWarningAt >= 1000UL) {
      Serial.println("MQTT mist override cancelled: WATER_LOCKOUT");
      lastManualSafetyWarningAt = now;
    }
  }
}

// ============================================================================
// TUẦN 6 & TUẦN 7: XỬ LÝ LỆNH DOWNLINK TỪ NODE-RED (ĐIỀU KHIỂN & CẤU HÌNH NGƯỠNG)
// ============================================================================
void handleMqttMessage(char* topic, byte* payload, unsigned int length) {
  if (length == 0 || length >= NetworkConfig::commandBufferSize) {
    Serial.printf("MQTT command rejected: invalid payload length=%u\n", length);
    return;
  }

  JsonDocument document;
  const DeserializationError error = deserializeJson(document, payload, length);
  if (error) {
    Serial.printf("MQTT command rejected: invalid JSON (%s)\n", error.c_str());
    return;
  }

  if (strcmp(topic, configTopic) == 0) {
    if (!document["mist_rh_on"].isNull()) Thresholds::mistHumidityOn = document["mist_rh_on"].as<float>();
    if (!document["mist_rh_off"].isNull()) Thresholds::mistHumidityOff = document["mist_rh_off"].as<float>();
    if (!document["fan_temp_on"].isNull()) Thresholds::fanTemperatureOn = document["fan_temp_on"].as<float>();
    if (!document["fan_temp_off"].isNull()) Thresholds::fanTemperatureOff = document["fan_temp_off"].as<float>();
    if (!document["light_on_adc"].isNull()) Thresholds::lightOnAdc = document["light_on_adc"].as<int>();
    if (!document["light_off_adc"].isNull()) Thresholds::lightOffAdc = document["light_off_adc"].as<int>();
    if (!document["water_low_adc"].isNull()) Thresholds::waterLowAdc = document["water_low_adc"].as<int>();
    if (!document["water_refilled_adc"].isNull()) Thresholds::waterRefilledAdc = document["water_refilled_adc"].as<int>();
    Serial.printf("CONFIG updated: mist_rh_on=%.1f mist_rh_off=%.1f fan_temp_on=%.1f light_on=%d\n",
                  Thresholds::mistHumidityOn, Thresholds::mistHumidityOff,
                  Thresholds::fanTemperatureOn, Thresholds::lightOnAdc);
    const char* reqId = document["request_id"] | "cfg";
    publishAck(reqId, "APPLIED", "CONFIG");
    publishState();
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
    Serial.printf("MQTT command %s: mode=AUTO\n", requestId);
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

// ============================================================================
// TUẦN 4: QUẢN LÝ KẾT NỐI MẠNG WI-FI & MQTT BROKER TỰ ĐỘNG PHỤC HỒI
// ============================================================================
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
  snprintf(configTopic, sizeof(configTopic),
           "garden/orchid/%s/config", ORCHID_DEVICE_ID);
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
  if (!mqttClient.subscribe(configTopic, 1)) {
    Serial.printf("MQTT subscribe failed: %s\n", configTopic);
    subscribed = false;
  }
  Serial.printf("MQTT connected; subscriptions=%s\n", subscribed ? "OK" : "ERROR");
  publishState();
}

// ============================================================================
// TUẦN 3: GIẢI THUẬT ĐIỀU KHIỂN TỰ ĐỘNG (FSM BƠM PHUN SƯƠNG, HYSTERESIS QUẠT & ĐÈN)
// ============================================================================
void setMistState(MistState next, unsigned long now) {
  if (next == mistState) return;
  Serial.printf("STATE mist %s -> %s\n", mistStateName(mistState), mistStateName(next));
  mistState = next;
  mistStateSince = now;
}

void updateMist(unsigned long now, float humidity, int waterAdc) {
  const bool waterLow = waterAdc < Thresholds::waterLowAdc;
  const bool waterRefilled = waterAdc >= Thresholds::waterRefilledAdc;
  const unsigned long elapsed = now - mistStateSince;

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
      if (waterRefilled) setMistState(MistState::Idle, now);  // hysteresis: >= waterRefilledAdc
      break;
  }
}

void updateFan(float temperature, float humidity) {
  const SwitchState before = fanState;
  if (fanState == SwitchState::Off &&
      (temperature > Thresholds::fanTemperatureOn || humidity > Thresholds::fanHumidityOn)) {
    fanState = SwitchState::On;
  } else if (fanState == SwitchState::On &&
             temperature < Thresholds::fanTemperatureOff && humidity < Thresholds::fanHumidityOff) {
    fanState = SwitchState::Off;
  }
  if (fanState != before) Serial.printf("STATE fan -> %s\n", fanState == SwitchState::On ? "ON" : "OFF");
}

void updateLight(int lightAdc) {
  const SwitchState before = lightState;
  if (lightState == SwitchState::Off && lightAdc > Thresholds::lightOnAdc) {
    lightState = SwitchState::On;
  } else if (lightState == SwitchState::On && lightAdc < Thresholds::lightOffAdc) {
    lightState = SwitchState::Off;
  }
  if (lightState != before) Serial.printf("STATE light -> %s\n", lightState == SwitchState::On ? "ON" : "OFF");
}

void printCalibrationRow(const FilteredSensors& sensors) {
  Serial.printf("CAL raw_light=%d filtered_light=%d raw_water=%d filtered_water=%d raw_temp=%.1f filtered_temp=%.1f raw_humidity=%.1f filtered_humidity=%.1f\n",
                sensors.lightRaw, sensors.lightFiltered,
                sensors.waterRaw, sensors.waterFiltered,
                sensors.temperatureRaw, sensors.temperature,
                sensors.humidityRaw, sensors.humidity);
}

// ============================================================================
// KHỞI TẠO HỆ THỐNG TOÀN DIỆN (SETUP TUẦN 1 -> 7)
// ============================================================================
void setup() {
  Serial.begin(115200);
  initializeMqttTopics();
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  mqttClient.setServer(NetworkConfig::brokerHost, NetworkConfig::brokerPort);
  mqttClient.setCallback(handleMqttMessage);
  mqttClient.setBufferSize(NetworkConfig::commandBufferSize);
  mqttClient.setSocketTimeout(1);
  mqttClient.setKeepAlive(30);
  lastWifiAttemptAt = millis() - NetworkConfig::wifiRetryIntervalMs;

  pinMode(Pins::ldr, INPUT);
  pinMode(Pins::water, INPUT);
  pinMode(Pins::mistRelay, OUTPUT);
  pinMode(Pins::fanRelay, OUTPUT);
  pinMode(Pins::lightRelay, OUTPUT);
  setRelay(Pins::mistRelay, false);
  setRelay(Pins::fanRelay, false);
  setRelay(Pins::lightRelay, false);
  dhtSensor.begin();
  Serial.println("Orchid garden controller started");
  Serial.println("CAL columns: raw_light filtered_light raw_water filtered_water raw_temp filtered_temp raw_humidity filtered_humidity");
  Serial.printf("MQTT device=%s broker=%s:%u\n",
                ORCHID_DEVICE_ID, NetworkConfig::brokerHost, NetworkConfig::brokerPort);
  Serial.println("MQTT topics: telemetry/state/availability/cmd/{mist,fan,light}/ack");
  Serial.println("MQTT Wi-Fi defaults to Wokwi-GUEST; configure orchid_secrets.h for a local network");
}

// ============================================================================
// CHU TRÌNH ĐIỀU KHIỂN THỜI GIAN THỰC ĐỒNG BỘ NON-BLOCKING (LOOP TUẦN 1 -> 7)
// ============================================================================
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

  if (!sensors.dhtValid && temperatureFilter.count == 0) {
    Serial.println("DHT22 read failed; outputs unchanged");
    publishTelemetry(sensors);
    publishState();
    return;
  }

  const float humidity = sensors.humidity;
  const float temperature = sensors.temperature;
  const int lightRaw = sensors.lightFiltered;
  const int waterRaw = sensors.waterFiltered;
  printCalibrationRow(sensors);

  updateMist(now, humidity, waterRaw);
  updateFan(temperature, humidity);
  updateLight(lightRaw);

  expireManualOverrides(now);
  applyRelayOutputs();
  Serial.printf("T: %.1f C | RH: %.1f %% | Light ADC: %d | Water ADC: %d | Mist: %s | Fan: %s | Grow light: %s\n",
                temperature, humidity, lightRaw, waterRaw,
                mistStateName(mistState),
                fanState == SwitchState::On ? "ON" : "OFF",
                lightState == SwitchState::On ? "ON" : "OFF");
  Serial.printf("OUTPUT mist=%s fan=%s light=%s\n",
                mistRelayOn ? "ON" : "OFF",
                fanRelayOn ? "ON" : "OFF",
                lightRelayOn ? "ON" : "OFF");
  publishTelemetry(sensors);
  publishState();
}

