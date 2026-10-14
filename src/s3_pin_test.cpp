#include <Arduino.h>

namespace Pins {
constexpr uint8_t displaySck = 12;
constexpr uint8_t displayMosi = 11;
constexpr uint8_t displayCs = 10;
constexpr uint8_t displayDc = 9;
constexpr uint8_t displayRst = 8;
constexpr uint8_t loopbackInput = 13;
}

namespace TestConfig {
constexpr unsigned long settleTimeMs = 100UL;
constexpr unsigned long reportIntervalMs = 500UL;
}

struct SignalPin {
  uint8_t gpio;
  const char* signal;
};

constexpr SignalPin signalPins[] = {
    {Pins::displaySck, "SCL/SCK"},
    {Pins::displayMosi, "SDA/MOSI"},
    {Pins::displayCs, "CS"},
    {Pins::displayDc, "DC"},
    {Pins::displayRst, "RST"},
};

size_t currentPin = 0;
unsigned long lastTestAt = 0;

void testSignalPin(const SignalPin& pin) {
  for (size_t index = 0; index < sizeof(signalPins) / sizeof(signalPins[0]); index++) {
    digitalWrite(signalPins[index].gpio, LOW);
  }

  digitalWrite(pin.gpio, HIGH);
  delay(TestConfig::settleTimeMs);
  const int highRead = digitalRead(Pins::loopbackInput);

  digitalWrite(pin.gpio, LOW);
  delay(TestConfig::settleTimeMs);
  const int lowRead = digitalRead(Pins::loopbackInput);

  Serial.printf(
      "DISPLAY_PIN signal=%s gpio=%u loopback_high=%d %s loopback_low=%d %s\n",
      pin.signal, pin.gpio, highRead, highRead == HIGH ? "PASS" : "FAIL",
      lowRead, lowRead == LOW ? "PASS" : "FAIL");
}

void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(Pins::loopbackInput, INPUT_PULLDOWN);
  for (size_t index = 0; index < sizeof(signalPins) / sizeof(signalPins[0]); index++) {
    pinMode(signalPins[index].gpio, OUTPUT);
    digitalWrite(signalPins[index].gpio, LOW);
  }

  Serial.println("DISPLAY PIN LOOPBACK TEST; relay control is not used");
  Serial.println("GPIO13 must be jumpered to ONE display signal pin at a time.");
  Serial.println("A HIGH PASS on the matching scan means the signal reaches that module pin.");
}

void loop() {
  const unsigned long now = millis();
  if (now - lastTestAt < TestConfig::reportIntervalMs) return;

  lastTestAt = now;
  testSignalPin(signalPins[currentPin]);
  currentPin = (currentPin + 1) % (sizeof(signalPins) / sizeof(signalPins[0]));
}
