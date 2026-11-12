# Smart Home 3D Dashboard

Dashboard smart home berbasis web (React SPA + visualisasi 3D) untuk denah rumah
1 lantai 10 m × 12 m (120 m², bangunan ~90 m²), sesuai SRS v1.1
(`SRS — Smart Home 3D Visualization Web App`).

- Scene 3D dollhouse prosedural (tanpa atap) dari denah: Ruang Tamu, Ruang
  Keluarga, Dapur, Kamar Utama (+ Kamar Mandi Dalam), Kamar Tidur 2 & 3, Kamar
  Mandi Luar, Teras, Carport, Taman Depan/Belakang, Ruang Jemuran.
- Telemetri suhu/kelembapan/tekanan + grafik histori 60 titik (Recharts).
- Kendali 4 lampu (panel 2D maupun klik objek 3D) via MQTT publish/subscribe.
- Mode **SIMULATION** (default saat pertama dibuka — aman, tanpa broker) dan
  **LIVE** (broker MQTT over WebSocket).

## Menjalankan

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # build produksi (tsc + vite)
npm test         # vitest — 41 test unit
npm run preview  # sajikan hasil build
```

## Mode

| Mode | Sumber data | Publish |
|---|---|---|
| `SIMULATION` (default) | Telemetri sintetis (suhu ~27–29 °C sinus, kelembapan ~60–70 %, tiap 2 dtk); echo state lampu 300–800 ms | **Tidak pernah** publish ke broker |
| `LIVE` | Broker MQTT | Command QoS 1, retain `false` |

Mode, status broker, dan availability perangkat adalah tiga indikator terpisah
di status bar. Terputus di LIVE tetap LIVE dengan badge `DISCONNECTED` — tidak
pernah diam-diam beralih ke simulasi.

## Menghubungkan broker (mode LIVE)

1. Buka panel **Koneksi & Pengaturan**.
2. Isi URL broker WebSocket, mis. `wss://broker.emqx.io:8084/mqtt` (broker
   publik untuk pengujian — tanpa autentikasi).
3. Klik **LIVE**, lalu **Hubungkan**.
4. Kredensial opsional disimpan di `localStorage` browser saja, tidak pernah
   masuk source code atau log. Gunakan akun berhak minimum.

Variabel environment (lihat `.env.example`):

```bash
VITE_MQTT_URL=wss://broker.emqx.io:8084/mqtt
# VITE_MQTT_USERNAME=
# VITE_MQTT_PASSWORD=
```

## Uji LIVE dengan broker publik + mosquitto

Jalankan aplikasi dalam mode LIVE dan hubungkan ke `wss://broker.emqx.io:8084/mqtt`,
lalu dari terminal lain (butuh `mosquitto-clients`):

```bash
# 1. Perangkat online + state awal (retained agar dashboard langsung sinkron)
mosquitto_pub -h broker.emqx.io -t smarthome/ruang_tamu/esp32_01/availability \
  -m '{"schemaVersion":"1.0","deviceId":"esp32_01","status":"online","ts":1794480000000}' -r
mosquitto_pub -h broker.emqx.io -t smarthome/ruang_tamu/esp32_01/lamp/state \
  -m '{"schemaVersion":"1.0","deviceId":"esp32_01","state":"OFF","ts":1794480000000}' -r

# 2. Telemetri berkala (ganti ts dengan epoch ms saat ini)
mosquitto_pub -h broker.emqx.io -t smarthome/ruang_tamu/esp32_01/telemetry \
  -m '{"schemaVersion":"1.0","deviceId":"esp32_01","ts":1794480000000,"seq":1,"temperatureC":28.5,"humidityPct":65.2,"pressureHpa":1008.4}'

# 3. Lihat perintah yang dikirim dashboard saat tombol ON ditekan
mosquitto_sub -h broker.emqx.io -t smarthome/ruang_tamu/esp32_01/lamp/command -v

# 4. Balas perintah dengan state (ganti requestId dengan yang tampil di log)
mosquitto_pub -h broker.emqx.io -t smarthome/ruang_tamu/esp32_01/lamp/state \
  -m '{"schemaVersion":"1.0","deviceId":"esp32_01","requestId":"req-...","state":"ON","ts":1794480000200}'
```

Perangkat ESP32 asli cukup memublikasikan topik yang sama mengikuti
`docs/MQTT_CONTRACT.md` — tidak ada firmware di repo ini (di luar cakupan SRS §16).

## Perangkat

| Ruangan | roomId | deviceId | Telemetri | Keterangan |
|---|---|---|---|---|
| Ruang Tamu | `ruang_tamu` | `esp32_01` | Ya | **Perangkat kanonis (contoh SRS §6.2)** |
| Ruang Keluarga | `ruang_keluarga` | `esp32_02` | Tidak | Ekstensi lampu |
| Kamar Utama | `kamar_utama` | `esp32_03` | Tidak | Ekstensi lampu |
| Dapur | `dapur` | `esp32_04` | Tidak | Ekstensi lampu |

**Catatan ekstensi (SRS §2.4 / NFR-11):** SRS merilis satu ruangan dengan "satu
atau lebih perangkat yang dapat diidentifikasi secara logis" dan memberi contoh
kanonis tunggal `ruang_tamu/esp32_01`. Implementasi ini mempertahankan perangkat
kanonis itu sebagai satu-satunya pembawa telemetri, lalu menambahkan tiga
perangkat lampu saja (satu per ruangan berlampu) dengan kontrak topik/payload
yang identik. Menambah perangkat baru cukup satu entri di
`src/config/devices.ts` — tidak ada perubahan konsep state. Bila satu ESP32
fisik mengendalikan beberapa lampu, tiap lampu tetap dipetakan sebagai satu
`deviceId` logis di sini.

## Arsitektur

```
src/
  config.ts            Identitas, topik, konstanta (freshness, timeout, buffer)
  config/devices.ts    Daftar perangkat (kanonis + ekstensi)
  lib/validate.ts      Validasi payload, freshness, dedup/out-of-order
  store/useStore.ts    Zustand: telemetri, perangkat, pending, koneksi, scene
  mqtt/client.ts       Satu-satunya modul yang menyentuh mqtt.js
  mqtt/commandService.ts  Command Manager (pending, timeout, SIM vs LIVE)
  sim/simulation.ts    Data sintetis — terisolasi, tidak pernah publish
  components/
    HouseScene.tsx     Scene R3F + drei (dollhouse, lampu, OrbitControls)
    StatusBar.tsx      Mode / broker / perangkat / scene
    TelemetryPanel.tsx Nilai + freshness + grafik Recharts
    DevicePanel.tsx    Kartu kontrol lampu
    ConnectionPanel.tsx Mode, broker URL, kredensial, timeout
    EventLog.tsx       Log perintah/state/koneksi/validasi
```

```
┌──────────────┐   aksi store    ┌─────────────┐
│ UI / Scene 3D│ ──────────────▶ │ Zustand     │
└──────────────┘   (tanpa MQTT)  │ useStore    │
       ▲                         └──────┬──────┘
       │ render state                   │ pesan tervalidasi
┌──────┴───────┐   publish/subscribe ┌──┴──────────┐
│ mqtt/client  │ ◀──────────────────▶│ Broker MQTT │
│ commandSvc   │   (mqtt.js, WS)     └─────────────┘
└──────────────┘
       ▲  (SIM: tidak pernah dipakai)
┌──────┴───────┐
│ sim/         │  data sintetis + echo state
└──────────────┘
```

Prinsip: UI/scene tidak pernah menyentuh MQTT langsung; confirmed state hanya
berasal dari pesan `lamp/state`; pengaturan visual bersifat lokal.

## Traceability SRS (FR-01..FR-25 → file)

| FR | Implementasi |
|---|---|
| FR-01, FR-02 | `components/HouseScene.tsx` (Canvas R3F, OrbitControls) |
| FR-03, FR-04, FR-05 | `components/TelemetryPanel.tsx`, `store/useStore.ts` (buffer 60) |
| FR-06, FR-07 | `components/HouseScene.tsx` (klik lampu), `components/DevicePanel.tsx` |
| FR-08, FR-09, FR-10 | `mqtt/commandService.ts`, `store/useStore.ts` (pending/timeout) |
| FR-11, FR-25 | `mqtt/client.ts` (resubscribe + retained) |
| FR-12, FR-13 | `components/StatusBar.tsx`, `store/useStore.ts` (availability terpisah) |
| FR-14 | `lib/validate.ts` (`classifyFreshness`), `components/TelemetryPanel.tsx` |
| FR-15, FR-16, FR-17 | `lib/validate.ts`, `store/useStore.ts` (dedup seq/ts) |
| FR-18, FR-19 | `sim/simulation.ts`, `mqtt/commandService.ts` (SIM tidak publish) |
| FR-20 | `components/EventLog.tsx` |
| FR-21 | `components/HouseScene.tsx` + `App.tsx` (pengaturan scene lokal) |
| FR-22 | Model prosedural; GLB dapat menggantikan komponen scene tanpa mengubah kontrak pesan |
| FR-23 | `components/HouseScene.tsx` (hover/selected/pending/unavailable) |
| FR-24, FR-25 | `mqtt/client.ts` (reconnect + resubscribe) |

## Deploy ke Vercel (untuk Fathur — dilakukan manual di dashboard)

Repo ini **tidak** membuat project Vercel via API. Langkah manual:

1. Push repo ke GitHub (`fadk-dev/3d-smart-home-dashbhoard`).
2. Di dashboard Vercel: **Add New → Project → Import** repo tersebut.
3. Framework: **Vite** (terdeteksi otomatis). Build Command: `npm run build`,
   Output Directory: `dist`.
4. (Opsional) Environment Variables: `VITE_MQTT_URL`,
   `VITE_MQTT_USERNAME`, `VITE_MQTT_PASSWORD` — lihat `.env.example`.
5. **Deploy**. Aplikasi berjalan sebagai SPA statis; tidak ada backend.

## Yang sengaja tidak ada

- Firmware ESP32, backend, database (di luar cakupan SRS §1.3/§16).
- Kredensial di source code; kredensial hanya dari env/localStorage.
- Dukungan multi-ruangan penuh (SRS §1.3) — struktur sudah siap (roomId/deviceId
  dapat dikonfigurasi), UI rilis ini satu denah.
