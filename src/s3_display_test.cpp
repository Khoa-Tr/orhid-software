#include <Arduino.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>

namespace Pins {
constexpr uint8_t displaySck = 12;
constexpr uint8_t displayMosi = 11;
constexpr uint8_t displayCs = 10;
constexpr uint8_t displayDc = 9;
constexpr uint8_t displayRst = 8;
}

namespace DisplayConfig {
constexpr uint16_t width = 240;
constexpr uint16_t height = 240;
constexpr unsigned long colorIntervalMs = 1500UL;
}

struct ColorTest {
  uint16_t color;
  const char* name;
};

constexpr ColorTest colorTests[] = {
    {ST77XX_RED, "RED"},
    {ST77XX_GREEN, "GREEN"},
    {ST77XX_BLUE, "BLUE"},
    {ST77XX_WHITE, "WHITE"},
    {ST77XX_BLACK, "BLACK"},
};

Adafruit_ST7789 display(&SPI, Pins::displayCs, Pins::displayDc, Pins::displayRst);
size_t currentColor = 0;
unsigned long lastColorChangeAt = 0;

void showColorTest(const ColorTest& test) {
  display.fillScreen(test.color);
  display.setTextSize(3);
  display.setTextWrap(false);
  display.setTextColor(test.color == ST77XX_WHITE || test.color == ST77XX_GREEN
                           ? ST77XX_BLACK
                           : ST77XX_WHITE);
  display.setCursor(45, 108);
  display.print(test.name);
  Serial.printf("DISPLAY_TEST color=%s\n", test.name);
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("ST7789 240x240 display-only test; relays are not controlled");
  Serial.println("Pins: SCK=GPIO12 MOSI=GPIO11 CS=GPIO10 DC=GPIO9 RST=GPIO8");

  SPI.begin(Pins::displaySck, -1, Pins::displayMosi, Pins::displayCs);
  display.init(DisplayConfig::width, DisplayConfig::height);
  display.setRotation(0);
  showColorTest(colorTests[currentColor]);
  lastColorChangeAt = millis();
}

void loop() {
  const unsigned long now = millis();
  if (now - lastColorChangeAt < DisplayConfig::colorIntervalMs) return;

  lastColorChangeAt = now;
  currentColor = (currentColor + 1) % (sizeof(colorTests) / sizeof(colorTests[0]));
  showColorTest(colorTests[currentColor]);
}
