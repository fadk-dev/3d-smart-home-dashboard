# IIoT Catering — Monitoring Rumah Produksi Makanan

Dashboard monitoring lingkungan IIoT untuk rumah produksi makanan (catering),
sesuai SRS v1.1 (`SRS — Sistem Monitoring IIoT Rumah Produksi Makanan
(Catering)`, status Draft – MVP).

- Scene 3D dollhouse prosedural (tanpa atap) denah 12,0 m × 10,0 m, tinggi
  plafon 3,0 m, utara = −Z — dari gambar denah rumah produksi makanan
  (higiene sanitasi, skala 1:100). Tembok 3D dibuat rendah (default 1,2 m)
  dan semi-transparan (opasitas 45%) agar isi ruangan terlihat; tinggi tembok
  (0,6–3,0 m), opasitas, dan visibilitas label marker bisa diatur di panel
  "Pengaturan tampilan" di bawah scene.
- **Filter Visualisasi 3D**: lantai tiap ruangan bisa diwarnai menurut nilai
  sensor — mode Status, Suhu (biru dingin → merah panas, skala default
  −20..40 °C), Kelembapan (pucat kering → biru tua lembap, skala default
  0..100 %RH), atau Keduanya (separuh lantai suhu + separuh kelembapan).
  Rentang skala bisa diubah dan ada tombol Reset; ruangan offline tetap merah
  berdenyut dan ruangan tanpa data tetap abu-abu di semua mode.
- **Layout Dashboard 3D**: scene 3D adalah dasar halaman (full-bleed); semua
  widget tampil sebagai overlay di atasnya — alur produksi (atas), kolom
  pengaturan tampilan 3D di kiri (Filter Visualisasi 3D + Pengaturan tampilan:
  auto-rotate, bayangan, tampilkan label, tinggi tembok 0,6–3,0 m, opasitas
  tembok, kualitas — keduanya bisa dilipat), telemetri + event log di kanan,
  kartu ruangan (strip horizontal bawah). Di layar kecil (≤900px) overlay
  kembali menjadi tumpukan normal di bawah canvas. Tab lain
  (Riwayat/Perangkat/Threshold/Alert) tetap memakai layout normal.
- **Toggle perabot**: panel "Pengaturan tampilan" punya checkbox "Tampilkan
  perabot" — mematikan rak, meja, kompor, chiller, palet, loker, dll agar
  lantai dan warna visualisasi terlihat bersih; **beacon sensor tidak ikut
  disembunyikan** dan tetap tampil di tiap ruangan.
- **Penanda pada grafik**: grafik histori ruangan terpilih selalu menandai nilai
  terakhir parameter yang aktif dengan titik + label nilai (suhu = merah,
  kelembapan = biru, ΔP = cokelat), plus garis putus-putus min/maks threshold.
  Parameter grafik mengikuti mode visualisasi saat ruangan dipilih (mode Suhu
  → grafik suhu, mode Kelembapan → grafik kelembapan).
- **9 ruangan MVP** (AC-13) dengan **9 node sensor** independen — satu node per
  ruangan: R01 Penerimaan Bahan Baku, R02 Gudang Bahan Kering, R03
  Chiller/Freezer, R04 Cuci dan Sortir Bahan, R05 Dapur Produksi/Memasak, R06
  Porsi dan Pengemasan (satu-satunya dengan sensor ΔP vs R05), R07A Gudang
  Produk Jadi (Barat), R07B Gudang Produk Jadi (Selatan) — denah punya dua
  ruangan Gudang Produk Jadi, masing-masing ruangan mandiri dengan sensor
  sendiri — R08 Area Pengiriman. Ruangan lain (Kantor/Admin, Toilet, Ruang
  Ganti & Loker, Janitor, Ruang Sampah, Pencucian Alat, Airlock 1/2/3)
  digambar abu-abu berlabel "di luar MVP" — tanpa sensor, tanpa bacaan.
- Parameter: Humidity (%RH), Temperature (°C), Differential Pressure (Pa,
  ΔP = P_R06 − P_R05).
- Alert: Humidity/Temperature/Pressure High/Low, Device Offline, Invalid Sensor
  Data — dedup (satu alert aktif per ruangan+parameter+tipe), auto-resolve.
- Threshold min/max per parameter per ruangan (admin, tersimpan di IndexedDB).
- Histori + grafik + tabel + ekspor CSV (data dari IndexedDB).
- Mode **SIMULATION** (default saat pertama dibuka — aman, tanpa broker) dan
  **LIVE** (broker MQTT over WebSocket, **subscribe-only** — aplikasi tidak
  pernah publish perintah; MVP ini monitoring-only, tanpa kontrol).

## Menjalankan

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # build produksi (tsc + vite)
npm test         # vitest — 67 test unit
npm run preview  # sajikan hasil build
```

## Mode

| Mode | Sumber data | Publish |
|---|---|---|
| `SIMULATION` (default) | Telemetri sintetis per node (baseline berbeda per ruangan, random walk + noise, breach sengaja tiap ~3 menit lalu pulih), **dipercepat: 1 bacaan / 5 detik**; 120 menit histori sintetis (interval 1 menit) di-seed saat pertama load | **Tidak pernah** — klien MQTT tidak punya method publish sama sekali |
| `LIVE` | Broker MQTT (subscribe-only, QoS 1) | **Tidak ada** — monitoring-only |

Mode, status broker, dan status perangkat adalah tiga indikator terpisah di
status bar. Terputus di LIVE tetap LIVE dengan badge `DISCONNECTED` — tidak
pernah diam-diam beralih ke simulasi.

### Penyimpangan terdokumentasi dari SRS (simulasi)

Baseline SRS §3.3/NFR-01 adalah sampling **1 menit**. Agar dashboard langsung
dapat dilihat dan diuji, mode SIMULATION berjalan **dipercepat (1 bacaan per
node tiap 5 detik)** dan men-seed **120 menit histori sintetis (interval
1 menit)** saat pertama load. Mode LIVE memakai interval 1 menit dari perangkat
nyata. Perilaku ini hanya berlaku untuk simulasi dan dicantumkan juga di panel
Koneksi.

## Menghubungkan broker (mode LIVE)

1. Buka tab **Perangkat** → panel **Koneksi & Pengaturan**.
2. Isi URL broker WebSocket, mis. `wss://broker.emqx.io:8084/mqtt` (broker
   publik untuk pengujian — tanpa autentikasi).
3. Klik **LIVE**, lalu **Hubungkan**.
4. Kredensial opsional disimpan di `localStorage` browser saja, tidak pernah
   masuk source code atau log. Gunakan akun berhak minimum (subscribe-only).

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
# Telemetri R06 lengkap dengan ΔP (contoh FR-02 — ganti timestamp dengan waktu saat ini)
mosquitto_pub -h broker.emqx.io -t iiot/catering/R06/NODE-R06-001/telemetry \
  -m '{"device_id":"NODE-R06-001","room_id":"R06","timestamp":"2026-11-12T10:40:00Z","humidity":62.5,"temperature":27.8,"pressure":5.2,"pressure_reference":"R05"}'

# Telemetri node tanpa pressure (R01)
mosquitto_pub -h broker.emqx.io -t iiot/catering/R01/NODE-R01-001/telemetry \
  -m '{"device_id":"NODE-R01-001","room_id":"R01","timestamp":"2026-11-12T10:40:00Z","humidity":60,"temperature":26}'

# Lihat semua telemetri yang masuk
mosquitto_sub -h broker.emqx.io -t 'iiot/catering/#' -v
```

Topik lengkap dan aturan validasi ada di `docs/MQTT_CONTRACT.md`. Perangkat
ESP32 asli cukup memublikasikan topik yang sama — tidak ada firmware di repo
ini (di luar cakupan MVP).

## Perangkat (9 node / 9 ruangan)

| Ruangan | Node | Sensor |
|---|---|---|
| R01 Penerimaan Bahan Baku | `NODE-R01-001` | Hum, Temp |
| R02 Gudang Bahan Kering | `NODE-R02-001` | Hum, Temp |
| R03 Chiller / Freezer | `NODE-R03-001` | Hum, Temp |
| R04 Cuci dan Sortir Bahan | `NODE-R04-001` | Hum, Temp |
| R05 Dapur Produksi / Memasak | `NODE-R05-001` | Hum, Temp |
| R06 Porsi dan Pengemasan | `NODE-R06-001` | Hum, Temp, **Press (ΔP vs R05)** |
| R07A Gudang Produk Jadi (Barat) | `NODE-R07A-001` | Hum, Temp |
| R07B Gudang Produk Jadi (Selatan) | `NODE-R07B-001` | Hum, Temp |
| R08 Area Pengiriman | `NODE-R08-001` | Hum, Temp |

Menambah node baru cukup satu entri di `src/config/devices.ts` — tidak ada
perubahan konsep state.

Catatan migrasi (2026-11-16): sebelumnya kedua ruangan Gudang Produk Jadi
digabung dalam satu ruangan R07 (node `NODE-R07-001`/`NODE-R07-002`). Sejak
pemecahan menjadi R07A/R07B, data lokal lama berlabel R07 (threshold,
bacaan, alert di IndexedDB) **diabaikan** — R07A dan R07B mulai dari
threshold default dan histori kosong; perangkat lama harus memublikasikan
ulang dengan `room_id`/`device_id` baru.

## Database lokal (IndexedDB) — SRS §7

MVP ini **tidak punya backend/server**. Tabel-tabel §7 diimplementasikan
sebagai object store IndexedDB di browser (`src/lib/db.ts`):

| Tabel §7 | Store | Isi |
|---|---|---|
| Rooms | (konfigurasi, `src/config/devices.ts`) | 9 ruangan R01–R06, R07A, R07B, R08 |
| Devices | `devices` | device_id, room_id, enabled |
| Sensor Readings | `readings` | device_id, room_id, timestamp, humidity, temperature, pressure, data_status |
| Thresholds | `thresholds` | room_id, parameter, min, max, unit |
| Alerts | `alerts` | id, room_id, device_id, parameter, actual_value, threshold_value, alert_type, status, created_at, resolved_at |

- **Cap bacaan: maks. 10.000 bacaan terbaru** dipertahankan; bacaan paling lama
  dihapus otomatis saat cap terlampaui.
- Saat load, aplikasi memulihkan threshold/perangkat/alert + histori terbaru
  dari IndexedDB.
- Bila IndexedDB tidak tersedia (mis. mode privat), aplikasi fallback ke
  penyimpanan in-memory dan tetap berjalan.

### Catatan produksi (backend)

Untuk produksi, lapisan `src/lib/db.ts` digantikan backend sesuai SRS
§2.1/§6.2: **MQTT broker + REST API + database (Postgres)** — dashboard tetap
membaca lewat API yang sama bentuknya. Autentikasi pengguna (NFR-03) juga
menjadi lingkup backend; peran Administrator/Operator di aplikasi ini hanya
**peran UI lokal tanpa autentikasi** (lihat di bawah).

## Threshold default (CONTOH AWAL)

SRS tidak menetapkan angka threshold. Nilai di bawah ini adalah **contoh awal**
yang wajib dikonfirmasi/disesuaikan Administrator sebelum dipakai operasional:

| Ruangan | Hum (%RH) | Temp (°C) | Press (Pa) |
|---|---|---|---|
| R01 | 40–70 | 18–30 | – |
| R02 | 40–60 | 20–30 | – |
| R03 | 40–85 | −22–4 | – |
| R04 | 50–85 | 18–30 | – |
| R05 | 40–80 | 20–38 | – |
| R06 | 40–65 | 18–26 | **2.5–15** |
| R07A | 40–65 | 4–26 | – |
| R07B | 40–65 | 4–26 | – |
| R08 | 40–70 | 18–30 | – |

## Peran (UI lokal — tanpa autentikasi)

| Aksi | Administrator | Operator Produksi |
|---|---|---|
| Lihat dashboard, riwayat, alert, perangkat | Ya | Ya |
| Ubah threshold | Ya | Tidak (input dinonaktifkan + alasan terlihat) |
| Aktif/nonaktif perangkat | Ya | Tidak |
| Acknowledge / Resolve alert | Ya | Tidak |

Peran dipilih di status bar (tersimpan di localStorage). **Ini bukan
autentikasi nyata**: NFR-03 (dashboard autentikasi, password hash, hak akses)
adalah lingkup backend produksi.

## Arsitektur

```
src/
  config.ts            Konstanta waktu (sampling, timeout, freshness), tipe
  config/devices.ts    9 ruangan MVP + 9 node + ruangan non-MVP + threshold default
  lib/validate.ts      Validasi payload IIoT, freshness, dedup/out-of-order
  lib/db.ts            IndexedDB (backend bisa ditukar; fallback in-memory)
  lib/csv.ts           Builder ekspor CSV histori
  store/useStore.ts    Zustand: bacaan, perangkat, threshold, alert, peran
  mqtt/client.ts       Satu-satunya modul yang menyentuh mqtt.js — SUBSCRIBE-ONLY
  mqtt/commandService.ts  (repurpose) Evaluasi threshold → alert (murni, tanpa MQTT)
  sim/simulation.ts    Data sintetis — terisolasi, tidak pernah publish
  components/
    HouseScene.tsx     Scene R3F + drei (dollhouse 12×10 m, beacon node, warna status)
    StatusBar.tsx      Mode / broker / ruangan / alert aktif / peran
    RoomCards.tsx      9 kartu ruangan + strip alur produksi R01→…→R08
    TelemetryPanel.tsx Nilai ruangan terpilih + grafik Recharts + daftar node
    HistoryPanel.tsx   Riwayat (IndexedDB) + grafik + tabel + ekspor CSV
    DevicePanel.tsx    Tabel 9 node + toggle aktif/nonaktif
    ThresholdPanel.tsx Tabel threshold (admin)
    AlertsPanel.tsx    Daftar alert + filter + acknowledge/resolve
    ConnectionPanel.tsx Mode, broker URL, kredensial, interval/timeout
    EventLog.tsx       Log alert/koneksi/validasi/threshold (tanpa kredensial)
```

```
┌──────────────┐   aksi store    ┌─────────────┐
│ UI / Scene 3D│ ──────────────▶ │ Zustand     │
└──────────────┘   (tanpa MQTT)  │ useStore    │
       ▲                         └──────┬──────┘
       │ render state                   │ pesan tervalidasi
┌──────┴───────┐   subscribe-only    ┌──┴──────────┐
│ mqtt/client  │ ◀────────────────── │ Broker MQTT │
└──────────────┘   (tanpa publish)   └─────────────┘
       ▲  (SIM: tidak pernah dipakai)
┌──────┴───────┐
│ sim/         │  data sintetis + seed histori
│ lib/db.ts    │  IndexedDB (tabel §7)
└──────────────┘
```

Prinsip: UI/scene tidak pernah menyentuh MQTT langsung; aplikasi tidak pernah
publish apa pun; pengaturan visual bersifat lokal.

## Traceability SRS (FR-01..FR-08 → file)

| FR | Implementasi |
|---|---|
| FR-01 | `lib/validate.ts` (identitas unik, validasi, sensor sebagian), `config/devices.ts` |
| FR-02 | `mqtt/client.ts` (subscribe QoS 1, resubscribe), `docs/MQTT_CONTRACT.md` |
| FR-03 | `lib/db.ts` (IndexedDB: readings/thresholds/devices/alerts), `store/useStore.ts` |
| FR-04 | `components/RoomCards.tsx`, `components/TelemetryPanel.tsx`, `components/HouseScene.tsx` |
| FR-05 | `components/HistoryPanel.tsx`, `lib/csv.ts` |
| FR-06 | `components/ThresholdPanel.tsx`, `store/useStore.ts` (`setThreshold`) |
| FR-07 | `mqtt/commandService.ts` (evaluasi), `store/useStore.ts` (dedup/auto-resolve), `components/AlertsPanel.tsx` |
| FR-08 | `components/DevicePanel.tsx`, `store/useStore.ts` (`setDeviceEnabled`) |

## Checklist Acceptance (AC-01..AC-13)

| AC | Status |
|---|---|
| AC-01 Hum terbaca %RH | ✅ kartu ruangan, panel telemetri, riwayat |
| AC-02 Temp terbaca °C | ✅ sama |
| AC-03 Press terbaca Pa (ΔP R06↔R05) | ✅ hanya R06; validasi menolak pressure di node lain |
| AC-04 MQTT diterima server | ✅ subscribe `iiot/catering/#`; contoh mosquitto di atas |
| AC-05 Data tersimpan di database | ✅ IndexedDB (MVP lokal; Postgres di produksi) |
| AC-06 Dashboard tampilkan data setiap area | ✅ 8 kartu + scene 3D |
| AC-07 Grafik histori | ✅ panel telemetri + tab Riwayat |
| AC-08 Admin ubah threshold | ✅ tab Threshold (admin saja), tersimpan di IndexedDB |
| AC-09 Notifikasi saat melewati threshold | ✅ alert + badge; breach sengaja di simulasi |
| AC-10 Koneksi terputus → offline setelah timeout | ✅ 180 dtk (LIVE) / 30 dtk (SIM); tetap LIVE + DISCONNECTED |
| AC-11 Koneksi pulih → kirim data kembali | ✅ reconnect + resubscribe otomatis; dedup timestamp |
| AC-12 Perangkat dan lokasi dapat dikelola | ✅ tabel perangkat + toggle aktif/nonaktif |
| AC-13 Hanya 8 area produksi MVP yang ditampilkan | ✅ ruangan lain abu-abu "di luar MVP", tanpa sensor/bacaan |

## Deploy ke Vercel (untuk Fathur — dilakukan manual di dashboard)

Repo ini **tidak** membuat project Vercel via API. Langkah manual:

1. Push repo ke GitHub (`fadk-dev/3d-smart-home-dashbhoard`).
2. Di dashboard Vercel: **Add New → Project → Import** repo tersebut.
3. Framework: **Vite** (terdeteksi otomatis). Build Command: `npm run build`,
   Output Directory: `dist`.
4. (Opsional) Environment Variables: `VITE_MQTT_URL`,
   `VITE_MQTT_USERNAME`, `VITE_MQTT_PASSWORD` — lihat `.env.example`.
5. **Deploy**. Aplikasi berjalan sebagai SPA statis; IndexedDB tersimpan di
   browser masing-masing pengguna (bukan server — lihat catatan backend di
   atas).

## Yang sengaja tidak ada (di luar MVP)

- Kontrol apa pun (lampu, HVAC, mesin) — monitoring-only; tidak ada publish.
- Firmware ESP32, backend, REST API, Postgres (lingkup produksi, SRS §2.1/§6.2).
- Autentikasi pengguna nyata (NFR-03) — peran di sini hanya UI lokal.
- Monitoring ruangan non-MVP (kantor, toilet, ruang ganti, janitor, sampah,
  pencucian alat) — digambar, tapi tanpa sensor.
- Deteksi gas/air/kebakaran, kontrol otomatis, prediksi ML (SRS §10/§11).
- Kredensial di source code; kredensial hanya dari env/localStorage.
