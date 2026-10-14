#include <Arduino.h>
#include <DHT.h>

namespace Pins {
constexpr uint8_t dht = 4;
constexpr uint8_t ldr = 1;
constexpr uint8_t water = 2;
}

namespace TestConfig {
constexpr size_t windowSize = 5;
constexpr unsigned long sampleIntervalMs = 2500UL;
}

template <typename T>
struct RunningAverage {
  T values[TestConfig::windowSize] = {};
  size_t count = 0;
  size_t next = 0;

  T add(T value) {
    values[next] = value;
    next = (next + 1) % TestConfig::windowSize;
    if (count < TestConfig::windowSize) count++;
    T total = 0;
    for (size_t index = 0; index < count; index++) total += values[index];
    return total / count;
  }
};

DHT dhtSensor(Pins::dht, DHT22);
RunningAverage<int> ldrAverage;
RunningAverage<int> waterAverage;
RunningAverage<float> temperatureAverage;
RunningAverage<float> humidityAverage;
unsigned long lastSampleAt = 0;

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  pinMode(Pins::ldr, INPUT);
  pinMode(Pins::water, INPUT);
  dhtSensor.begin();
  Serial.println("ESP32-S3 sensor test - NO RELAYS CONTROLLED");
  Serial.println("Expected wiring: LDR AO -> GPIO1, water S/AO -> GPIO2, DHT22 DATA -> GPIO4");
  Serial.println("Format: RAW ldr/water/temp/humidity | AVG5 ldr/water/temp/humidity");
}

void loop() {
  const unsigned long now = millis();
  if (now - lastSampleAt < TestConfig::sampleIntervalMs) return;
  lastSampleAt = now;

  const int ldrRaw = analogRead(Pins::ldr);
  const int waterRaw = analogRead(Pins::water);
  const float temperatureRaw = dhtSensor.readTemperature();
  const float humidityRaw = dhtSensor.readHumidity();
  const int ldrFiltered = ldrAverage.add(ldrRaw);
  const int waterFiltered = waterAverage.add(waterRaw);

  if (isnan(temperatureRaw) || isnan(humidityRaw)) {
    Serial.printf("RAW ldr=%d water=%d DHT=ERROR | AVG5 ldr=%d water=%d; check GPIO4/DHT wiring\n",
                  ldrRaw, waterRaw, ldrFiltered, waterFiltered);
    return;
  }

  const float temperatureFiltered = temperatureAverage.add(temperatureRaw);
  const float humidityFiltered = humidityAverage.add(humidityRaw);
  Serial.printf("RAW ldr=%d water=%d T=%.1f RH=%.1f | AVG5 ldr=%d water=%d T=%.1f RH=%.1f\n",
                ldrRaw, waterRaw, temperatureRaw, humidityRaw,
                ldrFiltered, waterFiltered, temperatureFiltered, humidityFiltered);
}