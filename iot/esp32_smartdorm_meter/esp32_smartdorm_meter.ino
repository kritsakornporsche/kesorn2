/*
 * ============================================================================
 * KESORN 2 SMART DORM - ESP32 + PZEM-004T v3.0 + SMART RELAY FIRMWARE
 * Module 4: Hybrid IoT Smart Meter & One-Click Auto Billing Pipeline
 * ============================================================================
 * 
 * การต่อสายวงจร (Hardware Wiring - สำคัญมาก):
 *   1. PZEM-004T ฝั่งไฟต่ำ (Low-Voltage Side ต่อกับ ESP32):
 *      - PZEM 5V (VCC) ---> ESP32 5V (VIN)
 *      - PZEM GND      ---> ESP32 GND
 *      - PZEM TX       ---> ESP32 GPIO 16 (RX2)  *** ห้ามต่อเข้าขา TX0/TX หลัก ***
 *      - PZEM RX       ---> ESP32 GPIO 17 (TX2)  *** ห้ามต่อเข้าขา RX0/RX หลัก ***
 * 
 *   2. PZEM-004T ฝั่งไฟสูง (High-Voltage 220V AC Side):
 *      - ขั้วสกรู L (Line) และ N (Neutral) ต้องต่อเข้ากับไฟบ้าน 220V AC 
 *        (เพราะวงจรออปโต้และชิปวัดไฟใน PZEM ต้องใช้ไฟจาก 220V เลี้ยงชิป จึงจะอ่านค่าแรงดันได้)
 *      - คล้องหม้อแปลง CT เข้ากับสายไฟ L (Line) 1 เส้นที่ต้องการวัดกระแส
 * 
 *   3. อุปกรณ์เสริม:
 *      - Relay Module IN ---> ESP32 GPIO 26
 *      - Built-in LED    ---> ESP32 GPIO 2
 * ============================================================================
 */

#include <WiFi.h>
#include <WiFiMulti.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <PZEM004Tv30.h>
#include <ArduinoJson.h>

// ---------------- 1. ตั้งค่าการเชื่อมต่อ Wi-Fi และ Server ----------------
WiFiMulti wifiMulti;

const char* SERVER_URL    = "https://kesorn.phannext.com/api/features/iot-meter";
const char* ROOM_NUMBER   = "101";
const char* DEVICE_ID     = "ESP32-PZEM-101";
const char* IOT_API_KEY   = "KESORN2-ESP32-SMARTMETER-2026";

// ---------------- 2. ตั้งค่าขาพิน GPIO บนบอร์ด ESP32 ---------------------
#define PZEM_RX_PIN   16  // GPIO 16 (RX2) ต่อเข้า TX ของ PZEM
#define PZEM_TX_PIN   17  // GPIO 17 (TX2) ต่อเข้า RX ของ PZEM
#define RELAY_PIN     26
#define STATUS_LED    2

PZEM004Tv30 pzem(Serial2, PZEM_RX_PIN, PZEM_TX_PIN);

// ---------------- 3. ตัวแปรสถานะการทำงาน ---------------------------------
bool relayStateOn = true;
unsigned long telemetryIntervalMs = 3000;
unsigned long lastTelemetrySent = 0;

void setRelayState(bool turnOn) {
  relayStateOn = turnOn;
  digitalWrite(RELAY_PIN, turnOn ? HIGH : LOW);
  digitalWrite(STATUS_LED, turnOn ? HIGH : LOW);
  Serial.printf("[RELAY] Room %s Breaker -> %s\n", ROOM_NUMBER, turnOn ? "ON (จ่ายไฟ)" : "OFF (ตัดไฟ)");
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.println("\n[WiFi] Scanning & Connecting to configured networks...");
  int attempts = 0;
  while (wifiMulti.run() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WiFi] Connected to: %s\n", WiFi.SSID().c_str());
    Serial.printf("[WiFi] IP: %s | RSSI: %d dBm | MAC: %s\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI(), WiFi.macAddress().c_str());
  } else {
    Serial.println("\n[WiFi] Still waiting for Wi-Fi connection...");
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
    Serial.println("🔄 [PZEM] Energy counter reset executed!");
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

  bool isPzemConnected = !isnan(voltage) && (voltage > 40.0);

  // 2. จัดการค่าตัวเลขเพื่อความถูกต้อง
  if (!isPzemConnected) {
    voltage   = 0.0;
    current   = 0.0;
    power     = 0.0;
    energy    = 0.0;
    frequency = 0.0;
    pf        = 0.0;
    Serial.println("⚠️ [PZEM-004T] No reading: Sensor not detected or waiting 220V AC power.");
  } else {
    if (isnan(current)) current = 0.0;
    if (isnan(power)) power = 0.0;
    if (isnan(energy)) energy = 0.0;
    if (isnan(frequency)) frequency = 50.0;
    if (isnan(pf)) pf = 1.0;
    Serial.printf("⚡ [PZEM-004T] V: %.1f V | I: %.2f A | P: %.1f W | E: %.2f kWh\n",
                  voltage, current, power, energy);
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
  doc["espStatus"]    = "ONLINE";
  doc["sensorStatus"] = isPzemConnected ? "PZEM_HARDWARE" : "WAITING_AC";
  doc["pzemStatus"]   = isPzemConnected ? "CONNECTED" : "WAITING_AC";

  String requestBody;
  serializeJson(doc, requestBody);

  WiFiClientSecure client;
  client.setInsecure(); // ข้ามการตรวจ SSL เพื่อความรวดเร็วและรองรับทุก Domain
  HTTPClient http;
  http.begin(client, SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-iot-api-key", IOT_API_KEY);

  int httpCode = http.POST(requestBody);
  if (httpCode > 0) {
    String response = http.getString();
    Serial.printf("[HTTP %d] Telemetry sent! (ESP32: ONLINE | PZEM: %s)\n",
                  httpCode, isPzemConnected ? "CONNECTED" : "WAITING_AC");

    // ตรวจสอบคำสั่ง Downlink จากเซิร์ฟเวอร์
    StaticJsonDocument<512> resDoc;
    DeserializationError err = deserializeJson(resDoc, response);
    if (!err && resDoc.containsKey("command") && !resDoc["command"].isNull()) {
      String cmd = resDoc["command"].as<String>();
      handleServerCommand(cmd);
    }
  } else {
    Serial.printf("[HTTP ERROR] Failed to POST: %s (code %d)\n",
                  http.errorToString(httpCode).c_str(), httpCode);
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(STATUS_LED, OUTPUT);
  setRelayState(true);

  Serial.println("\n====================================================");
  Serial.println("  KESORN 2 SMART DORM - ESP32 SMART METER NODE INIT ");
  Serial.println("  Room: 101 | PZEM Pins: RX=16, TX=17 | Relay: Pin 26 ");
  Serial.println("====================================================");

  // ตั้งค่า Wi-Fi AP ที่รองรับ
  wifiMulti.addAP("Buain_2.4G", "2535372188");
  wifiMulti.addAP("Buain_5G", "2535372188");
  wifiMulti.addAP("Kesorn_Wifi", "");
  wifiMulti.addAP("Kesorn_Wifi2", "");

  connectWiFi();
}

void loop() {
  unsigned long now = millis();
  if (lastTelemetrySent == 0 || (now - lastTelemetrySent >= telemetryIntervalMs)) {
    lastTelemetrySent = now;
    sendTelemetryToServer();
  }
  delay(10);
}
