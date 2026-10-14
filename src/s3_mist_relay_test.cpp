#include <Arduino.h>

namespace Pins {
constexpr uint8_t mistRelay = 7;
}

namespace TestTiming {
constexpr unsigned long waitBeforePulseMs = 3000UL;
constexpr unsigned long pulseDurationMs = 2000UL;
}

enum class TestState : uint8_t {
  Waiting,
  Pulsing,
  Complete,
};

TestState testState = TestState::Waiting;
unsigned long stateStartedAt = 0;

void setup() {
  Serial.begin(115200);
  pinMode(Pins::mistRelay, OUTPUT);
  digitalWrite(Pins::mistRelay, LOW);
  stateStartedAt = millis();
  Serial.println("Mist relay one-shot test; GPIO7 starts LOW");
  Serial.println("Relay will turn ON once for 2 seconds, then stay OFF");
  Serial.println("Verify pump is submerged and its supply is correctly rated");
}

void loop() {
  const unsigned long now = millis();
  if (testState == TestState::Waiting &&
      now - stateStartedAt >= TestTiming::waitBeforePulseMs) {
    digitalWrite(Pins::mistRelay, HIGH);
    testState = TestState::Pulsing;
    stateStartedAt = now;
    Serial.println("RELAY_TEST GPIO7=HIGH pump relay ON for 2 seconds");
  } else if (testState == TestState::Pulsing &&
             now - stateStartedAt >= TestTiming::pulseDurationMs) {
    digitalWrite(Pins::mistRelay, LOW);
    testState = TestState::Complete;
    Serial.println("RELAY_TEST GPIO7=LOW pump relay OFF; test complete");
  }
}
