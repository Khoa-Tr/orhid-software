#include <Arduino.h>
#include <DHT.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
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
// TUẦN 1 & 2: CẤU HÌNH PHẦN CỨNG & SƠ ĐỒ CHÂN I/O (ESP32-S3 PHYSICAL)
// - Cảm biến: DHT22 (GPIO4), LDR Ánh sáng (GPIO1), Cảm biến mực nước (GPIO2)
// - Relay chấp hành: Đèn (GPIO5), Quạt (GPIO6), Bơm phun sương (GPIO7)
// - Màn hình OLED SSD1306 128x64 I2C: SDA (GPIO8), SCL (GPIO9)
// ============================================================================
namespace Pins {
constexpr uint8_t dht = 4;
constexpr uint8_t ldr = 1;
constexpr uint8_t water = 2;
constexpr uint8_t lightRelay = 5;
constexpr uint8_t fanRelay = 6;
constexpr uint8_t mistRelay = 7;
constexpr uint8_t oledSda = 8;
constexpr uint8_t oledScl = 9;
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
int lightOnAdc = 2200;
int lightOffAdc = 1800;
// [TAM THOI BO QUA RULE MUC NUOC DE TEST PHAN CUNG]
int waterLowAdc = 0;        // Goc: 1200
int waterRefilledAdc = 0;   // Goc: 1500
constexpr unsigned long maxMistDurationMs = 120000UL;
constexpr unsigned long mistCooldownMs = 60000UL;
constexpr unsigned long maxAutoLightOnMs = 4UL * 60UL * 60UL * 1000UL;
constexpr unsigned long sampleIntervalMs = 2500UL;
}

// ============================================================================
// TUẦN 3 & TUẦN 7: BẢO VỆ AN TOÀN & LỌC NHIỄU CẢM BIẾN (SAFETY & FILTERING)
// - 3 lần đọc DHT lỗi liên tiếp (~7.5s) -> SENSOR_FAULT: không phun AUTO, từ chối lệnh phun
// - rejectSpike(): Lọc loại bỏ mẫu nhảy vọt đột biến (chống xung nhiễu)
// - RunningAverage: Bộ lọc trung bình trượt cửa sổ 5 mẫu làm mượt dữ liệu
// ============================================================================
namespace Safety {
constexpr uint8_t dhtFaultAfterFailures = 3;
}

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
constexpr size_t mqttPacketBufferSize = 512;
}

// ============================================================================
// TUẦN 2: CẤU HÌNH HIỂN THỊ MÀN HÌNH OLED SSD1306 (128x64 I2C)
// ============================================================================
namespace DisplayConfig {
constexpr uint16_t width = 128;
constexpr uint16_t height = 64;
constexpr uint8_t i2cAddress = 0x3C;
constexpr int16_t labelWidth = 42;
constexpr int16_t firstRowY = 10;
constexpr int16_t rowHeight = 8;
}

// ============================================================================
// TUẦN 3: BỘ LỌC TÍN HIỆU & KHỞI TẠO ĐỐI TƯỢNG PHẦN CỨNG
// ============================================================================
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

enum class MistState : uint8_t { Idle, Running, Cooldown, WaterLockout, SensorFault };
enum class SwitchState : uint8_t { Off, On };

DHT dhtSensor(Pins::dht, DHT22);
Adafruit_SSD1306 display(DisplayConfig::width, DisplayConfig::height, &Wire, -1);
RunningAverage<float> temperatureFilter;
RunningAverage<float> humidityFilter;
RunningAverage<int> lightFilter;
RunningAverage<int> waterFilter;
MistState mistState = MistState::Idle;
SwitchState fanState = SwitchState::Off;
SwitchState lightState = SwitchState::Off;
unsigned long mistStateSince = 0;
unsigned long lastSampleAt = 0;
unsigned long lightOnSince = 0;
bool lightWaitingForDaylight = false;
uint8_t dhtFailStreak = 0;
bool dhtFault = false;
uint8_t temperatureRejects = 0;
uint8_t humidityRejects = 0;
uint8_t lightRejects = 0;
uint8_t waterRejects = 0;


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

bool anyManualOverride() {
  return mistOverride.active || fanOverride.active || lightOverride.active;
}

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
int latestWaterAdc = 0;
bool latestWaterValid = false;
bool wifiWasConnected = false;
bool mqttWasConnected = false;
bool mistRelayOn = false;
bool fanRelayOn = false;
bool lightRelayOn = false;

const char* overrideModeName(const RelayOverride& relayOverride) {
  return relayOverride.active ? "MANUAL" : "AUTO";
}

bool waterLockoutActive() {
  return mistState == MistState::WaterLockout ||
      (latestWaterValid && latestWaterAdc < Thresholds::waterLowAdc);
}

const char* displayMistState(MistState state) {
  switch (state) {
    case MistState::Idle: return "IDLE";
    case MistState::Running: return "RUN";
    case MistState::Cooldown: return "COOL";
    case MistState::WaterLockout: return "LOCK";
    case MistState::SensorFault: return "FLT";
  }
  return "?";
}


// ============================================================================
// TUẦN 2: KHỞI TẠO VÀ CẬP NHẬT GIAO DIỆN MÀN HÌNH OLED SSD1306
// - initializeDisplay(): Cấu hình I2C và vẽ logo khởi động
// - updateDisplay(): Hiển thị Nhiệt độ, Độ ẩm, Quang trở, Mực nước, Trạng thái bơm/quạt/đèn và Chế độ AUTO/MANUAL
// ============================================================================
void initializeDisplay() {
  Wire.begin(Pins::oledSda, Pins::oledScl);
  if (!display.begin(SSD1306_SWITCHCAPVCC, DisplayConfig::i2cAddress)) {
    Serial.println("ERROR: SSD1306 not found; check wiring");
    return;
  }
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(16, 0);
  display.print("ORCHID GARDEN");
  display.drawFastHLine(0, DisplayConfig::firstRowY - 2, DisplayConfig::width, SSD1306_WHITE);
  display.display();
}

void updateDisplay(const FilteredSensors& sensors) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  // Title
  display.setCursor(16, 0);
  display.print("ORCHID GARDEN");
  display.drawFastHLine(0, DisplayConfig::firstRowY - 2, DisplayConfig::width, SSD1306_WHITE);

  char line[22];
  int16_t y = DisplayConfig::firstRowY;

  // Row 0: Temperature
  if (sensors.dhtValid) {
    snprintf(line, sizeof(line), "TEMP  %.1f C", sensors.temperature);
  } else {
    snprintf(line, sizeof(line), "TEMP  ERROR");
  }
  display.setCursor(0, y);
  display.print(line);
  y += DisplayConfig::rowHeight;

  // Row 1: Humidity
  if (sensors.dhtValid) {
    snprintf(line, sizeof(line), "HUM   %.1f %%", sensors.humidity);
  } else {
    snprintf(line, sizeof(line), "HUM   ERROR");
  }
  display.setCursor(0, y);
  display.print(line);
  y += DisplayConfig::rowHeight;

  // Row 2: LDR
  snprintf(line, sizeof(line), "LDR   %d", sensors.lightFiltered);
  display.setCursor(0, y);
  display.print(line);
  y += DisplayConfig::rowHeight;

  // Row 3: Water
  snprintf(line, sizeof(line), "WATER %d", sensors.waterFiltered);
  display.setCursor(0, y);
  display.print(line);
  y += DisplayConfig::rowHeight;

  // Row 4: Mist state
  snprintf(line, sizeof(line), "MIST  %s",
           mistRelayOn ? "ON" : displayMistState(mistState));
  display.setCursor(0, y);
  display.print(line);
  y += DisplayConfig::rowHeight;

  // Row 5: Fan + Light on same row to save space
  snprintf(line, sizeof(line), "FAN %s  LIGHT %s",
           fanRelayOn ? "ON" : "--",
           lightRelayOn ? "ON" : "--");
  display.setCursor(0, y);
  display.print(line);
  y += DisplayConfig::rowHeight;

  // Row 6: Mode
  snprintf(line, sizeof(line), "MODE  %s",
           anyManualOverride() ? "MANUAL" : "AUTO");
  display.setCursor(0, y);
  display.print(line);

  display.display();
}

// ============================================================================
// TUẦN 1: ĐIỀU KHIỂN XUẤT TÍN HIỆU GPIO RELAY CHẤP HÀNH
// - Module Relay tích cực mức CAO (HIGH = Hút Relay bật thiết bị, LOW = Nhả Relay tắt)
// ============================================================================
void setRelay(uint8_t pin, bool on) {
  digitalWrite(pin, on ? HIGH : LOW);
}

// ============================================================================
// TUẦN 3: THUẬT TOÁN LỌC NHIỄU CẢM BIẾN (SPIKE REJECTION & RUNNING AVERAGE)
// - rejectSpike(): Kiểm tra độ chênh lệch giữa 2 mẫu liên tiếp, nếu vượt ngưỡng nhảy thì giữ mẫu cũ
// - readFilteredSensors(): Đọc các chân ADC và DHT22, sau đó đưa qua các bộ lọc trung bình trượt
// ============================================================================
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
    case MistState::SensorFault: return "SENSOR_FAULT";
  }
  return "?";
}

void setMistState(MistState next, unsigned long now);

// ============================================================================
// TUẦN 4: ĐÓNG GÓI DỮ LIỆU JSON & XUẤT BẢN MQTT TELEMETRY / TRẠNG THÁI (UPLINK)
// - publishJson(): Hàm nền tảng tuần tự hóa JSON và gửi qua MQTT
// - publishAck(): Phản hồi xác nhận lệnh từ Node-RED (APPLIED / REJECTED)
// - publishState(): Đẩy trạng thái relay, FSM mode và các ngưỡng hiện tại
// - publishTelemetry(): Đẩy số liệu cảm biến môi trường theo chu kỳ
// ============================================================================
void publishJson(const char* topic, JsonDocument& document, bool retained = false) {
  char payload[NetworkConfig::mqttPacketBufferSize];
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
  document["water_lockout"] = waterLockoutActive();
  document["dht_fault"] = dhtFault;
  document["mode"] = anyManualOverride() ? "MANUAL" : "AUTO";
  document["mist_rh_on"] = Thresholds::mistHumidityOn;
  document["fan_temp_on"] = Thresholds::fanTemperatureOn;
  document["mist_mode"] = overrideModeName(mistOverride);
  document["fan_mode"] = overrideModeName(fanOverride);
  document["light_mode"] = overrideModeName(lightOverride);
  publishJson(stateTopic, document, true);
}

void publishTelemetry(const FilteredSensors& sensors) {
  if (!mqttClient.connected()) return;
  JsonDocument document;
  if (!dhtFault && (sensors.dhtValid || temperatureFilter.count > 0)) {
    document["temperature_c"] = sensors.temperature;
    document["humidity_pct"] = sensors.humidity;
  } else {
    document["temperature_c"] = nullptr;
    document["humidity_pct"] = nullptr;
  }
  document["light_adc"] = sensors.lightFiltered;
  document["water_adc"] = sensors.waterFiltered;
  document["dht_fail_streak"] = dhtFailStreak;
  publishJson(telemetryTopic, document);
}

// ============================================================================
// TUẦN 6: TẦNG CHẤP HÀNH RELAY KÈM KHÓA LIÊN ĐỘNG AN TOÀN (SAFETY INTERLOCK)
// - Bơm phun sương: Tuyệt đối không bật nếu bể cạn nước (WaterLockout), Cooldown hoặc SensorFault
// - Quạt & Đèn: Tự động điều khiển theo cảm biến hoặc cưỡng bức theo lệnh MANUAL
// ============================================================================
void applyRelayOutputs() {
  const bool mistSafetyAllowsOn = !waterLockoutActive() &&
      mistState != MistState::Cooldown && mistState != MistState::SensorFault;
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
// - cancelManualOverrides(): Hủy toàn bộ ghi đè khi mất kết nối mạng hoặc khẩn cấp
// - expireManualOverrides(): Kiểm tra timeout TTL từng relay, trả về AUTO
// ============================================================================
void cancelManualOverrides(const char* reason) {
  mistOverride.active = false;
  fanOverride.active = false;
  lightOverride.active = false;
  Serial.printf("SAFETY %s; manual overrides cleared -> AUTO\n", reason);
  applyRelayOutputs();
}

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
    Serial.println("MQTT mist override cancelled: WATER_LOCKOUT");
  }
}

// ============================================================================
// TUẦN 6 & TUẦN 7: XỬ LÝ LỆNH DOWNLINK TỪ NODE-RED (ĐIỀU KHIỂN & CẤU HÌNH NGƯỠNG)
// - Topic /config (Tuần 7): Nhận và áp dụng giá trị ngưỡng động mới vào Thresholds
// - Topic /cmd/{mist,fan,light} (Tuần 6): Xử lý bật/tắt thủ công (MANUAL) hoặc trả về AUTO
// - Kiểm tra tính hợp lệ và xuất bản phản hồi ACK
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
// - initializeMqttTopics(): Tạo định danh các topic theo ID thiết bị
// - serviceNetwork(): Duy trì kết nối Wi-Fi và MQTT Client; tự động kết nối lại khi mất mạng
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
    cancelManualOverrides("MQTT link lost");
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
// - updateMist(): Máy trạng thái FSM (IDLE -> RUNNING -> COOLDOWN hoặc WATER_LOCKOUT / SENSOR_FAULT)
// - updateFan(): Điều khiển quạt với trễ nhiệt độ (ON khi > 33°C, OFF khi < 31°C)
// - updateLight(): Điều khiển đèn theo ngưỡng quang trở LDR (ON khi trời tối, OFF khi sáng)
// ============================================================================
void setMistState(MistState next, unsigned long now) {
  if (next == mistState) return;
  Serial.printf("STATE mist %s -> %s\n", mistStateName(mistState), mistStateName(next));
  mistState = next;
  mistStateSince = now;
}

void updateDhtHealth(bool dhtValid) {
  if (dhtValid) {
    if (dhtFault) Serial.println("RECOVERED DHT22 readings valid again");
    dhtFailStreak = 0;
    dhtFault = false;
    return;
  }
  if (dhtFailStreak < UINT8_MAX) dhtFailStreak++;
  Serial.printf("DHT22 read failed (%u consecutive)\n", dhtFailStreak);
  if (!dhtFault && dhtFailStreak >= Safety::dhtFaultAfterFailures) {
    dhtFault = true;
    Serial.printf("FAULT DHT22 %u consecutive read failures; mist AUTO blocked\n", dhtFailStreak);
  }
}

void updateMist(unsigned long now, bool climateValid, float humidity, int waterAdc) {
  const bool waterLow = waterAdc < Thresholds::waterLowAdc;
  const bool waterRefilled = waterAdc >= Thresholds::waterRefilledAdc;
  const bool autoMistHeld = mistOverride.active && !mistOverride.on;
  const unsigned long elapsed = now - mistStateSince;
  switch (mistState) {
    case MistState::Idle:
      if (waterLow) setMistState(MistState::WaterLockout, now);
      else if (dhtFault) setMistState(MistState::SensorFault, now);
      else if (climateValid && !autoMistHeld && humidity < Thresholds::mistHumidityOn) {
        setMistState(MistState::Running, now);
      }
      break;
    case MistState::Running:
      if (waterLow) setMistState(MistState::WaterLockout, now);
      else if (dhtFault) setMistState(MistState::SensorFault, now);
      else if (autoMistHeld) setMistState(MistState::Cooldown, now);
      else if (humidity >= Thresholds::mistHumidityOff) setMistState(MistState::Idle, now);
      else if (elapsed >= Thresholds::maxMistDurationMs) setMistState(MistState::Cooldown, now);
      break;
    case MistState::Cooldown:
      if (waterLow) setMistState(MistState::WaterLockout, now);
      else if (elapsed >= Thresholds::mistCooldownMs) setMistState(MistState::Idle, now);
      break;
    case MistState::WaterLockout:
      if (waterRefilled) setMistState(MistState::Idle, now);
      break;
    case MistState::SensorFault:
      if (waterLow) setMistState(MistState::WaterLockout, now);
      else if (!dhtFault) setMistState(MistState::Cooldown, now);
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

void updateLight(unsigned long now, int lightAdc) {
  if (lightAdc < Thresholds::lightOffAdc) lightWaitingForDaylight = false;
  if (lightState == SwitchState::Off && lightAdc > Thresholds::lightOnAdc && !lightWaitingForDaylight) {
    lightState = SwitchState::On;
    lightOnSince = now;
    Serial.println("STATE light -> ON");
  } else if (lightState == SwitchState::On && lightAdc < Thresholds::lightOffAdc) {
    lightState = SwitchState::Off;
    Serial.println("STATE light -> OFF");
  } else if (lightState == SwitchState::On && now - lightOnSince >= Thresholds::maxAutoLightOnMs) {
    lightState = SwitchState::Off;
    lightWaitingForDaylight = true;
    Serial.println("SAFETY light AUTO on-time limit reached; off until daylight is seen");
  }
}

// ============================================================================
// KHỞI TẠO HỆ THỐNG TOÀN DIỆN (SETUP TUẦN 1 -> 7)
// - Cấu hình chân I/O, độ phân giải ADC 12-bit, khởi tạo màn hình OLED SSD1306, DHT22 và MQTT
// ============================================================================
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
  Serial.printf("Display: SSD1306 128x64 I2C SDA=GPIO%u SCL=GPIO%u ADDR=0x%02X\n",
                Pins::oledSda, Pins::oledScl, DisplayConfig::i2cAddress);
  Serial.println("Thresholds: mist RH<65/stop>=80, water lock<1200/refill>=1500");
  Serial.printf("MQTT device=%s broker=%s:%u\n",
                ORCHID_DEVICE_ID, NetworkConfig::brokerHost, NetworkConfig::brokerPort);
  Serial.println("MQTT topics: telemetry/state/availability/cmd/{mist,fan,light}/ack");
  Serial.println("MQTT Wi-Fi defaults to Wokwi-GUEST; configure orchid_secrets.h for a local network");
}

// ============================================================================
// CHU TRÌNH ĐIỀU KHIỂN THỜI GIAN THỰC ĐỒNG BỘ NON-BLOCKING (LOOP TUẦN 1 -> 7)
// - Duy trì MQTT, kiểm tra timeout ghi đè, lấy mẫu định kỳ 2500ms
// - Chạy giải thuật tự động, cập nhật màn hình OLED cục bộ và xuất bản dữ liệu lên MQTT Broker
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
  updateDhtHealth(sensors.dhtValid);

  const bool climateValid = !dhtFault && (sensors.dhtValid || temperatureFilter.count > 0);

  Serial.printf("RAW ldr=%d water=%d temp=%.1f humidity=%.1f | AVG ldr=%d water=%d temp=%.1f humidity=%.1f\n",
                sensors.lightRaw, sensors.waterRaw, sensors.temperatureRaw, sensors.humidityRaw,
                sensors.lightFiltered, sensors.waterFiltered, sensors.temperature, sensors.humidity);

  updateMist(now, climateValid, sensors.humidity, sensors.waterFiltered);
  if (climateValid) updateFan(sensors.temperature, sensors.humidity);
  updateLight(now, sensors.lightFiltered);
  expireManualOverrides(now);
  applyRelayOutputs();
  updateDisplay(sensors);
  Serial.printf("STATE mist=%s fan=%s light=%s water_lockout=%s dht_fault=%s\n",
                mistStateName(mistState), fanState == SwitchState::On ? "ON" : "OFF",
                lightState == SwitchState::On ? "ON" : "OFF",
                waterLockoutActive() ? "YES" : "NO",
                dhtFault ? "YES" : "NO");
  Serial.printf("OUTPUT mist=%s fan=%s light=%s\n",
                mistRelayOn ? "ON" : "OFF",
                fanRelayOn ? "ON" : "OFF",
                lightRelayOn ? "ON" : "OFF");
  publishTelemetry(sensors);
  publishState();
}