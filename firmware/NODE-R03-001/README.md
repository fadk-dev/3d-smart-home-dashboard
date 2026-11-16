# Firmware NODE-R03-001 (R03 Chiller / Freezer)

Sketch ESP32 pertama untuk uji LIVE broker dashboard IIoT Catering —
bukan bagian MVP dashboard (dashboard tetap subscriber-only).

## Yang dilakukan sketch ini

- Membaca DHT22 (GPIO 4) tiap 60 detik dan publish ke
  `iiot/catering/R03/NODE-R03-001/telemetry`, QoS 1, retain true.
- Payload persis FR-02 (`docs/MQTT_CONTRACT.md`): `device_id`,
  `room_id`, `timestamp` ISO-8601 UTC dari NTP, `humidity`, `temperature`.
  **Tanpa** `pressure` — field itu hanya boleh dari NODE-R06-001.
- Bila sensor gagal baca / nilai di luar rentang validator (0–100 %RH,
  −30–60 °C), publish dilewati — dashboard menolak `null` sebagai
  Invalid Sensor Data, jadi tidak mengirim apa pun lebih aman.

## Cara pakai

1. Arduino IDE → Library Manager, instal: **DHT sensor library**
   (Adafruit + Adafruit Unified Sensor), **ArduinoMqttClient**,
   **ArduinoJson** v7.
2. Buka `NODE-R03-001.ino`, isi `WIFI_SSID` dan `WIFI_PASSWORD`
   di bagian konfigurasi. Jangan commit password asli ke repo publik.
3. Upload ke ESP32 (DHT22 di GPIO 4, VCC 3V3, GND).
4. Buka Serial Monitor 115200 — harus terlihat `Publish: {"device_id":
   "NODE-R03-001",...}` tiap 60 detik.
5. Verifikasi dari terminal (butuh `mosquitto-clients`):
   `mosquitto_sub -h broker.emqx.io -t 'iiot/catering/R03/NODE-R03-001/telemetry' -v`
6. Buka dashboard → mode **LIVE**, broker
   `wss://broker.emqx.io:8084/mqtt` → kartu R03 harus ONLINE dengan
   suhu/kelembapan nyata (bukan simulasi).

## Yang perlu diketahui

- **Hanya R03 yang live.** Di mode LIVE, 8 node lain tidak mengirim
  apa-apa dan akan tampil OFFLINE setelah 180 detik (3× interval).
  Itu expected sampai node lain punya firmware sendiri.
- **Sensor adalah asumsi.** DHT22 dipilih karena rentangnya
  −40..80 °C (cocok untuk chiller ~−12 °C). Bila hardware sebenarnya
  SHT31/SHT40 atau pin berbeda, sesuaikan `readSensor()` / `DHT_PIN`.
- **Belum diverifikasi** dengan ESP32 / broker sungguhan dari sini
  (tidak ada arduino-cli di workspace ini untuk compile-check).
  Langkah 4–6 di atas adalah verifikasinya.
- Threshold contoh awal R03: suhu −22..4 °C, kelembapan 40–85 %RH
  (`src/config/devices.ts`) — wajib dikonfirmasi admin sebelum
  operasional, seperti threshold lainnya.
