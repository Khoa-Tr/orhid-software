#include <Arduino.h>

namespace Pins {
constexpr uint8_t ldr = 1;
constexpr uint8_t lightRelay = 5;
constexpr uint8_t fanRelay = 6;
constexpr uint8_t mistRelay = 7;
}

namespace Thresholds {
constexpr int lightOnAdc = 2200;
constexpr int lightOffAdc = 1800;
}

namespace TestConfig {
constexpr size_t averageWindowSize = 5;
constexpr unsigned long sampleIntervalMs = 500UL;
}

enum class LightState : uint8_t { Off, On };

int samples[TestConfig::averageWindowSize] = {};
size_t sampleCount = 0;
size_t nextSample = 0;
unsigned long lastSampleAt = 0;
LightState lightState = LightState::Off;

void setLightState(LightState next, int rawAdc, int filteredAdc) {
  if (next == lightState) return;
  lightState = next;
  digitalWrite(Pins::lightRelay, lightState == LightState::On ? HIGH : LOW);
  Serial.printf("LIGHT state=%s relay_gpio=%u input=%s raw_adc=%d avg_adc=%d\n",
                lightState == LightState::On ? "ON" : "OFF",
                Pins::lightRelay,
                lightState == LightState::On ? "HIGH" : "LOW",
                rawAdc, filteredAdc);
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  pinMode(Pins::ldr, INPUT);

  pinMode(Pins::mistRelay, OUTPUT);
  pinMode(Pins::fanRelay, OUTPUT);
  pinMode(Pins::lightRelay, OUTPUT);
  digitalWrite(Pins::mistRelay, LOW);
  digitalWrite(Pins::fanRelay, LOW);
  digitalWrite(Pins::lightRelay, LOW);

  Serial.println("LDR-to-light relay test only; no pump/fan load is controlled");
  Serial.printf("LDR=GPIO%u light relay IN=GPIO%u; ON when bright (ADC > %d), OFF when dark (ADC < %d)\n",
                Pins::ldr, Pins::lightRelay,
                Thresholds::lightOnAdc, Thresholds::lightOffAdc);
}

void loop() {
  const unsigned long now = millis();
  if (now - lastSampleAt < TestConfig::sampleIntervalMs) return;
  lastSampleAt = now;

  const int rawAdc = analogRead(Pins::ldr);
  samples[nextSample] = rawAdc;
  nextSample = (nextSample + 1) % TestConfig::averageWindowSize;
  if (sampleCount < TestConfig::averageWindowSize) sampleCount++;

  int total = 0;
  for (size_t index = 0; index < sampleCount; index++) total += samples[index];
  const int filteredAdc = total / static_cast<int>(sampleCount);

  if (lightState == LightState::Off && filteredAdc > Thresholds::lightOnAdc) {
    setLightState(LightState::On, rawAdc, filteredAdc);
  } else if (lightState == LightState::On && filteredAdc < Thresholds::lightOffAdc) {
    setLightState(LightState::Off, rawAdc, filteredAdc);
  }

  Serial.printf("LDR raw_adc=%d avg_adc=%d light=%s\n",
                rawAdc, filteredAdc,
                lightState == LightState::On ? "ON" : "OFF");
}
