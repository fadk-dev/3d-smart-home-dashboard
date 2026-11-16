// NODE-R03-001 — ESP32 firmware, Chiller / Freezer (R03)
// IIoT Catering Monitoring, SRS v1.1 §6 / FR-02.
//
// Publisher-only: memublikasikan telemetri ke topik
//   iiot/catering/R03/NODE-R03-001/telemetry
// QoS 1, retain true, tiap 60 detik (interval sampling SRS).
// Dashboard adalah subscriber-only dan tidak pernah mengirim perintah,
// jadi sketch ini tidak subscribe topik apa pun.
//
// Payload (harus persis seperti ini — validator dashboard menolak
// field yang tidak sesuai, lihat src/lib/validate.ts):
//   {"device_id":"NODE-R03-001","room_id":"R03",
//    "timestamp":"2026-11-16T05:00:00Z",
//    "humidity":68.0,"temperature":-12.0}
//   - TANPA field pressure: pressure hanya boleh ada di NODE-R06-001.
//     Mengirim pressure dari node ini = Invalid Sensor Data.
//   - timestamp ISO-8601 UTC dari NTP (bukan waktu lokal WIB).
//   - humidity 0..100 %RH, temperature -30..60 C wajib ada;
//     bila sensor gagal baca, JANGAN publish (null = invalid).
//
// Perangkat keras (asumsi — sesuaikan bila hardwarenya beda):
//   ESP32 DevKit + DHT22 di GPIO 4 (DHT22: -40..80 C, 0..100 %RH,
//   cocok untuk chiller ~-12 C; baseline simulasi R03: 68 %RH / -12 C,
//   threshold contoh awal R03: 40-85 %RH, -22..4 C).
//   Bila memakai SHT31/SHT40, ganti library DHT dengan library
//   sensor tersebut dan sesuaikan fungsi readSensor() saja.
//
// Library Arduino IDE (Library Manager):
//   - "DHT sensor library" by Adafruit (+ Adafruit Unified Sensor)
//   - "ArduinoMqttClient" by Arduino
//     (dipilih karena mendukung QoS 1 + retain secara eksplisit;
//      PubSubClient hanya publish QoS 0)
//   - "ArduinoJson" by Benoit Blanchon (v7)
//
// Catatan: file ini di luar cakupan MVP dashboard (README: "tidak ada
// firmware di repo ini"). Ini sketch pertama untuk uji LIVE broker,
// belum diuji dengan ESP32 / broker sungguhan.

#include <WiFi.h>
#include <WiFiClient.h>
#include <ArduinoMqttClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <time.h>

// ---------- KONFIGURASI — ISI DULU SEBELUM UPLOAD ----------
// Kredensial WiFi (jangan commit password asli ke repo publik).
const char *WIFI_SSID     = "NAMA_WIFI_ANDA";
const char *WIFI_PASSWORD = "PASSWORD_WIFI_ANDA";

// Broker MQTT (port TCP 1883; dashboard memakai WebSocket 8084
// untuk browser — ESP32 memakai koneksi TCP biasa ke host yang sama).
// Broker publik EMQX ini tanpa autentikasi, sama seperti default
// dashboard (VITE_MQTT_URL=wss://broker.emqx.io:8084/mqtt).
const char *MQTT_BROKER = "broker.emqx.io";
const int   MQTT_PORT   = 1883;

// ---------- IDENTITAS NODE (JANGAN DIUBAH) ----------
const char *DEVICE_ID = "NODE-R03-001";
const char *ROOM_ID   = "R03";
const char *TOPIC     = "iiot/catering/R03/NODE-R03-001/telemetry";

// ---------- SENSOR & SAMPLING ----------
#define DHT_PIN  4
#define DHT_TYPE DHT22
DHT dht(DHT_PIN, DHT_TYPE);

// Interval sampling SRS: 1 menit. Dashboard menandai node OFFLINE
// bila tidak ada bacaan > 3x interval (180 detik), dan freshness
// CURRENT hanya <= 90 detik setelah bacaan terakhir.
const unsigned long PUBLISH_INTERVAL_MS = 60UL * 1000UL;
const unsigned long RECONNECT_DELAY_MS = 5000UL;

// NTP untuk timestamp UTC (pool.ntp.org; offset 0 = UTC).
const char *NTP_SERVER = "pool.ntp.org";

WiFiClient wifiClient;
MqttClient mqttClient(wifiClient);

unsigned long lastPublishMs = 0;

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.print("WiFi: menghubungkan ke ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi: terhubung, IP ");
  Serial.println(WiFi.localIP());
}

bool connectMqtt() {
  if (mqttClient.connected()) return true;
  Serial.print("MQTT: menghubungkan ke ");
  Serial.print(MQTT_BROKER);
  Serial.print(":");
  Serial.println(MQTT_PORT);
  // Tanpa username/password (broker publik, tanpa auth).
  if (!mqttClient.connect(MQTT_BROKER, MQTT_PORT)) {
    Serial.print("MQTT: gagal, error ");
    Serial.println(mqttClient.connectError());
    return false;
  }
  Serial.println("MQTT: terhubung");
  return true;
}

// Timestamp ISO-8601 UTC, mis. "2026-11-16T05:00:00Z".
// Mengembalikan false bila waktu NTP belum tersinkron.
bool isoTimestampUtc(char *buf, size_t bufSize) {
  time_t now = time(nullptr);
  if (now < 1700000000L) return false;  // belum sync NTP
  struct tm tmUtc;
  gmtime_r(&now, &tmUtc);
  strftime(buf, bufSize, "%Y-%m-%dT%H:%M:%SZ", &tmUtc);
  return true;
}

// Baca sensor. false = gagal baca (jangan publish apa pun).
bool readSensor(float &humidity, float &temperature) {
  humidity    = dht.readHumidity();
  temperature = dht.readTemperature();  // Celsius
  if (isnan(humidity) || isnan(temperature)) return false;
  // Cerminan validator dashboard (validateTelemetry): di luar
  // rentang ini payload ditolak sebagai Invalid Sensor Data.
  if (humidity < 0 || humidity > 100) return false;
  if (temperature < -30 || temperature > 60) return false;
  return true;
}

void publishTelemetry() {
  float humidity, temperature;
  if (!readSensor(humidity, temperature)) {
    Serial.println("Sensor: baca gagal / di luar rentang — publish dilewati");
    return;
  }

  char timestamp[25];
  if (!isoTimestampUtc(timestamp, sizeof(timestamp))) {
    Serial.println("NTP: waktu belum tersinkron — publish dilewati");
    return;
  }

  JsonDocument doc;
  doc["device_id"]   = DEVICE_ID;
  doc["room_id"]     = ROOM_ID;
  doc["timestamp"]   = timestamp;
  doc["humidity"]    = round(humidity * 10) / 10.0;
  doc["temperature"] = round(temperature * 10) / 10.0;
  // Sengaja TIDAK ada "pressure" / "pressure_reference" (khusus R06).

  char payload[160];
  serializeJson(doc, payload, sizeof(payload));

  // QoS 1, retain true — sesuai kontrak docs/MQTT_CONTRACT.md.
  mqttClient.beginMessage(TOPIC, true /* retain */, 1 /* QoS */);
  mqttClient.print(payload);
  if (!mqttClient.endMessage()) {
    Serial.println("MQTT: publish GAGAL");
    return;
  }
  Serial.print("Publish: ");
  Serial.println(payload);
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\nNODE-R03-001 (R03 Chiller/Freezer) mulai");
  dht.begin();
  connectWifi();
  // Sinkronisasi waktu UTC untuk timestamp FR-02.
  configTime(0, 0, NTP_SERVER);
  Serial.println("NTP: menunggu sinkronisasi waktu...");
  while (time(nullptr) < 1700000000L) delay(500);
  Serial.println("NTP: waktu tersinkron (UTC)");
}

void loop() {
  connectWifi();
  if (!connectMqtt()) {
    delay(RECONNECT_DELAY_MS);
    return;
  }
  mqttClient.poll();

  unsigned long now = millis();
  if (lastPublishMs == 0 || now - lastPublishMs >= PUBLISH_INTERVAL_MS) {
    lastPublishMs = now;
    publishTelemetry();
  }
  delay(100);
}
