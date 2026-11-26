#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

namespace Pins {
constexpr uint8_t oledSda = 8;
constexpr uint8_t oledScl = 9;
}

namespace DisplayConfig {
constexpr uint16_t width = 128;
constexpr uint16_t height = 64;
constexpr uint8_t i2cAddress = 0x3C;
constexpr unsigned long patternIntervalMs = 2000UL;
}

Adafruit_SSD1306 display(DisplayConfig::width, DisplayConfig::height, &Wire, -1);
size_t currentPattern = 0;
unsigned long lastPatternChangeAt = 0;

struct PatternTest {
  const char* name;
  void (*draw)(Adafruit_SSD1306&);
};

void drawAllWhite(Adafruit_SSD1306& d) {
  d.fillScreen(SSD1306_WHITE);
  d.setTextColor(SSD1306_BLACK);
  d.setTextSize(2);
  d.setCursor(16, 24);
  d.print("WHITE");
}

void drawAllBlack(Adafruit_SSD1306& d) {
  d.fillScreen(SSD1306_BLACK);
  d.setTextColor(SSD1306_WHITE);
  d.setTextSize(2);
  d.setCursor(16, 24);
  d.print("BLACK");
}

void drawCheckerboard(Adafruit_SSD1306& d) {
  d.fillScreen(SSD1306_BLACK);
  for (int y = 0; y < DisplayConfig::height; y += 8) {
    for (int x = 0; x < DisplayConfig::width; x += 8) {
      if ((x / 8 + y / 8) % 2 == 0) {
        d.fillRect(x, y, 8, 8, SSD1306_WHITE);
      }
    }
  }
}

void drawTextDemo(Adafruit_SSD1306& d) {
  d.fillScreen(SSD1306_BLACK);
  d.setTextColor(SSD1306_WHITE);
  d.setTextSize(1);
  d.setCursor(0, 0);
  d.println("ORCHID GARDEN");
  d.println("SSD1306 128x64");
  d.println("I2C OLED Test");
  d.println();
  d.print("Addr: 0x");
  d.println(DisplayConfig::i2cAddress, HEX);
  d.print("SDA=GPIO");
  d.print(Pins::oledSda);
  d.print(" SCL=GPIO");
  d.println(Pins::oledScl);
}

constexpr PatternTest patternTests[] = {
    {"ALL_WHITE", drawAllWhite},
    {"ALL_BLACK", drawAllBlack},
    {"CHECKERBOARD", drawCheckerboard},
    {"TEXT_DEMO", drawTextDemo},
};

void showPattern(const PatternTest& test) {
  test.draw(display);
  display.display();
  Serial.printf("DISPLAY_TEST pattern=%s\n", test.name);
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("SSD1306 128x64 I2C OLED display-only test; relays are not controlled");
  Serial.printf("Pins: SDA=GPIO%u SCL=GPIO%u I2C_ADDR=0x%02X\n",
                Pins::oledSda, Pins::oledScl, DisplayConfig::i2cAddress);

  Wire.begin(Pins::oledSda, Pins::oledScl);

  if (!display.begin(SSD1306_SWITCHCAPVCC, DisplayConfig::i2cAddress)) {
    Serial.println("ERROR: SSD1306 not found at 0x3C; check wiring and I2C address");
    Serial.println("Try running I2C scanner or check GND/VDD/SCK/SDA connections");
    while (true) delay(1000);
  }

  Serial.println("SSD1306 initialized OK");
  showPattern(patternTests[currentPattern]);
  lastPatternChangeAt = millis();
}

void loop() {
  const unsigned long now = millis();
  if (now - lastPatternChangeAt < DisplayConfig::patternIntervalMs) return;

  lastPatternChangeAt = now;
  currentPattern = (currentPattern + 1) % (sizeof(patternTests) / sizeof(patternTests[0]));
  showPattern(patternTests[currentPattern]);
}
