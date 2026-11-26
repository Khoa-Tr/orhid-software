#include <Arduino.h>
#include <Wire.h>

namespace Pins {
constexpr uint8_t oledSda = 8;
constexpr uint8_t oledScl = 9;
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("I2C SCANNER - scanning for OLED and other I2C devices");
  Serial.printf("Pins: SDA=GPIO%u SCL=GPIO%u\n", Pins::oledSda, Pins::oledScl);

  Wire.begin(Pins::oledSda, Pins::oledScl);
}

void loop() {
  Serial.println("\nScanning I2C bus...");
  uint8_t found = 0;
  for (uint8_t address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    const uint8_t error = Wire.endTransmission();
    if (error == 0) {
      Serial.printf("  I2C device found at 0x%02X", address);
      if (address == 0x3C || address == 0x3D) {
        Serial.print(" <-- SSD1306 OLED");
      }
      Serial.println();
      found++;
    }
  }
  if (found == 0) {
    Serial.println("  No I2C devices found! Check GND/VDD/SCK/SDA wiring.");
  } else {
    Serial.printf("  Total: %u device(s) found\n", found);
  }
  delay(3000);
}
