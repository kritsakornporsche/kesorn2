/*
 * ============================================================================
 * KESORN 2 SMART DORM - ESP32 + PZEM-004T v3.0 + SMART RELAY FIRMWARE
 * Module 4: Hybrid IoT Smart Meter & One-Click Auto Billing Pipeline
 * ============================================================================
 * ไฟล์นี้สามารถเปิดด้วยโปรแกรม Arduino IDE หรือ PlatformIO เพื่ออัปโหลดลงบอร์ด ESP32 ได้ทันที
 *
 * ไลบรารีที่ต้องติดตั้งใน Arduino IDE (Sketch -> Include Library -> Manage Libraries):
 *   1. PZEM004Tv30 by Jakub Mandula
 *   2. ArduinoJson by Benoit Blanchon (v6 หรือ v7)
 *
 * การต่อสายวงจร (Hardware Wiring):
 *   - PZEM-004T VCC (5V)  ---> ESP32 5V (VIN)
 *   - PZEM-004T GND       ---> ESP32 GND
 *   - PZEM-004T TX        ---> ESP32 GPIO 16 (RX2)
 *   - PZEM-004T RX        ---> ESP32 GPIO 17 (TX2)
 *   - Relay Module IN     ---> ESP32 GPIO 26
 *   - Built-in Status LED ---> ESP32 GPIO 2
 *
 * หมายเหตุพิเศษ:
 *   หากยังไม่ได้ต่อเซนเซอร์ PZEM-004T จริง บอร์ด ESP32 จะสลับเข้าสู่โหมด
 *   Fallback Simulation อัตโนมัติ เพื่อให้ทดสอบส่งค่าเข้าเว็บและสั่งเปิด-ปิดไฟ (Relay) ได้ทันที!
 * ============================================================================
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <PZEM004Tv30.h>
#include <ArduinoJson.h>

// ---------------- 1. ตั้งค่าการเชื่อมต่อ Wi-Fi และ Server ----------------
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* SERVER_URL    = "https://kesorn.phannext.com/api/features/iot-meter";
const char* ROOM_NUMBER   = "101";
const char* DEVICE_ID     = "ESP32-PZEM-101";
const char* IOT_API_KEY   = "KESORN2-ESP32-SMARTMETER-2026";

// ---------------- 2. ตั้งค่าขาพิน GPIO บนบอร์ด ESP32 ---------------------
#define PZEM_RX_PIN   16
#define PZEM_TX_PIN   17
#define RELAY_PIN     26
#define STATUS_LED    2

PZEM004Tv30 pzem(Serial2, PZEM_RX_PIN, PZEM_TX_PIN);

// ---------------- 3. ตัวแปรสถานะการทำงานของบอร์ด ------------------------
bool relayStateOn = true;
unsigned long telemetryIntervalMs = 3000;
unsigned long lastTelemetrySent = 0;

// ตัวแปรสำรองกรณีทดสอบเฉพาะบอร์ด ESP32 โดยยังไม่ต่อหัววัด PZEM-004T
float fallbackEnergyKwh = 1568.90;
bool simulateSpikeMode = false;

void setRelayState(bool turnOn) {
  relayStateOn = turnOn;
  digitalWrite(RELAY_PIN, turnOn ? HIGH : LOW);
  digitalWrite(STATUS_LED, turnOn ? HIGH : LOW);
  Serial.printf("[RELAY] Room %s Breaker -> %s\n", ROOM_NUMBER, turnOn ? "ON (จ่ายไฟปกติ)" : "OFF (ตัดกระแสไฟ)");
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.printf("\n[WiFi] Connecting to %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WiFi] Connected! IP: %s | RSSI: %d dBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.println("\n[WiFi] Connection Failed! Will retry...");
  }
}

void handleServerCommand(const String& cmd) {
  if (cmd.length() == 0 || cmd == "null") return;
  Serial.printf("⚡ [DOWNLINK COMMAND] Received from Kesorn Server: %s\n", cmd.c_str());

  if (cmd == "RELAY_ON") {
    setRelayState(true);
  } else if (cmd == "RELAY_OFF") {
    setRelayState(false);
  } else if (cmd == "RESET_KWH_COUNTER") {
    pzem.resetEnergy();
    fallbackEnergyKwh = 1420.50;
    Serial.println("🔄 [PZEM] Energy counter reset!");
  } else if (cmd == "SET_INTERVAL_2S") {
    telemetryIntervalMs = 2000;
    Serial.println("⏱️ [CONFIG] Telemetry interval set to 2,000 ms");
  } else if (cmd == "SET_INTERVAL_5S") {
    telemetryIntervalMs = 5000;
    Serial.println("⏱️ [CONFIG] Telemetry interval set to 5,000 ms");
  } else if (cmd == "FORCE_READ_NOW") {
    lastTelemetrySent = 0;
  } else if (cmd == "REBOOT_ESP32") {
    Serial.println("♻️ [SYSTEM] Rebooting ESP32 now...");
    delay(500);
    ESP.restart();
  }
}

void sendTelemetryToServer() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    if (WiFi.status() != WL_CONNECTED) return;
  }

  // 1. อ่านค่าจริงจากโมดูล PZEM-004T v3.0
  float voltage   = pzem.voltage();
  float current   = pzem.current();
  float power     = pzem.power();
  float energy    = pzem.energy();
  float frequency = pzem.frequency();
  float pf        = pzem.pf();

  bool isSensorConnected = !isnan(voltage) && voltage > 50.0;

  // 2. หากยังไม่ต่อสาย PZEM-004T ให้สร้างสัญญาณจำลองจากบอร์ด ESP32 เพื่อให้ทดสอบระบบได้ครบวงจร
  if (!isSensorConnected) {
    voltage   = 229.0 + (random(-15, 15) / 10.0);
    frequency = 50.0;
    if (!relayStateOn) {
      current = 0.0;
      power   = 0.0;
      pf      = 1.0;
    } else if (simulateSpikeMode) {
      power   = 4650.0 + random(0, 350);
      pf      = 0.92;
      current = power / (voltage * pf);
      fallbackEnergyKwh += 0.08;
    } else {
      power   = 1180.0 + random(-80, 120);
      pf      = 0.95;
      current = power / (voltage * pf);
      fallbackEnergyKwh += 0.02;
    }
    energy = fallbackEnergyKwh;
  }

  // 3. สร้าง JSON Payload ส่งไปยัง Next.js API (/api/features/iot-meter)
  StaticJsonDocument<512> doc;
  doc["action"]       = "esp32_telemetry";
  doc["apiKey"]       = IOT_API_KEY;
  doc["roomNumber"]   = ROOM_NUMBER;
  doc["deviceId"]     = DEVICE_ID;
  doc["voltage"]      = serialized(String(voltage, 1));
  doc["current"]      = serialized(String(current, 2));
  doc["power"]        = serialized(String(power, 0));
  doc["energyKwh"]    = serialized(String(energy, 2));
  doc["pf"]           = serialized(String(pf, 2));
  doc["frequency"]    = serialized(String(frequency, 1));
  doc["relayState"]   = relayStateOn ? "ON" : "OFF";
  doc["rssi"]         = WiFi.RSSI();
  doc["ip"]           = WiFi.localIP().toString();
  doc["mac"]          = WiFi.macAddress();
  doc["sensorStatus"] = isSensorConnected ? "PZEM_HARDWARE" : "ESP32_FALLBACK_SIM";

  String requestBody;
  serializeJson(doc, requestBody);

  WiFiClientSecure client;
  client.setInsecure(); // ไม่ต้องตรวจสอบ SSL Certificate สามารถส่ง HTTPS ได้ทันที
  HTTPClient http;
  http.begin(client, SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-iot-api-key", IOT_API_KEY);

  int httpCode = http.POST(requestBody);
  if (httpCode > 0) {
    String response = http.getString();
    Serial.printf("[HTTP %d] Sent Room %s -> V:%.1fV I:%.2fA P:%.0fW E:%.2fkWh Relay:%s\n",
                  httpCode, ROOM_NUMBER, voltage, current, power, energy,
                  relayStateOn ? "ON" : "OFF");

    // 4. ตรวจสอบคำสั่งตอบกลับ (Downlink Command) จากหน้าเว็บ Researcher Lab
    StaticJsonDocument<512> resDoc;
    DeserializationError err = deserializeJson(resDoc, response);
    if (!err && resDoc.containsKey("command") && !resDoc["command"].isNull()) {
      String cmd = resDoc["command"].as<String>();
      handleServerCommand(cmd);
    }
  } else {
    Serial.printf("[HTTP ERROR] Failed to POST telemetry: %s\n",
                  http.errorToString(httpCode).c_str());
  }
  http.end();
}

void checkSerialCommands() {
  if (!Serial.available()) return;
  String input = Serial.readStringUntil('\n');
  input.trim();
  input.toUpperCase();

  if (input == "ON") {
    setRelayState(true);
    sendTelemetryToServer();
  } else if (input == "OFF") {
    setRelayState(false);
    sendTelemetryToServer();
  } else if (input == "SPIKE") {
    simulateSpikeMode = true;
    Serial.println("🔥 [TEST] Enabled High-Load Spike Mode!");
    sendTelemetryToServer();
  } else if (input == "NORMAL") {
    simulateSpikeMode = false;
    Serial.println("✅ [TEST] Restored Normal Load Mode.");
    sendTelemetryToServer();
  } else if (input == "READ") {
    sendTelemetryToServer();
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(STATUS_LED, OUTPUT);
  setRelayState(true);

  Serial.println("====================================================");
  Serial.println(" KESORN 2 SMART DORM - ESP32 SMART METER NODE INIT ");
  Serial.println(" Commands via Serial Monitor: ON, OFF, SPIKE, NORMAL, READ");
  Serial.println("====================================================");

  connectWiFi();
}

void loop() {
  checkSerialCommands();

  unsigned long now = millis();
  if (lastTelemetrySent == 0 || (now - lastTelemetrySent >= telemetryIntervalMs)) {
    lastTelemetrySent = now;
    sendTelemetryToServer();
  }
}
