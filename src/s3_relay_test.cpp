#include <Arduino.h>

namespace Pins {
constexpr uint8_t relayInput = 5;
}

namespace TestConfig {
constexpr unsigned long phaseDurationMs = 2000UL;
}

enum class RelayPhase : uint8_t { Off, On };

RelayPhase phase = RelayPhase::Off;
unsigned long phaseStartedAt = 0;

void setRelayPhase(RelayPhase next) {
  phase = next;
  phaseStartedAt = millis();
  const bool energized = phase == RelayPhase::On;
  digitalWrite(Pins::relayInput, energized ? HIGH : LOW);
  Serial.printf("RELAY_TEST gpio=%u input=%s relay_expected=%s\n",
                Pins::relayInput, energized ? "HIGH" : "LOW",
                energized ? "ENERGIZED" : "RELEASED");
}

void setup() {
  Serial.begin(115200);
  pinMode(Pins::relayInput, OUTPUT);
  digitalWrite(Pins::relayInput, LOW);

  Serial.println("5V HIGH-trigger relay test; GPIO5; no pump/lamp load");
  Serial.println("Expected: relay releases for 2s, energizes for 2s, then repeats.");
  Serial.println("Do not connect 5V to GPIO5. Relay supply must use a secure 5V connection.");
  setRelayPhase(RelayPhase::Off);
}

void loop() {
  if (millis() - phaseStartedAt < TestConfig::phaseDurationMs) return;
  setRelayPhase(phase == RelayPhase::Off ? RelayPhase::On : RelayPhase::Off);
}
