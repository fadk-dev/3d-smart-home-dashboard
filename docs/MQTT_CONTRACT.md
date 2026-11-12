# Kontrak MQTT — Smart Home 3D Dashboard

Dokumen ini menyalin kontrak dari SRS v1.1 Bab 6. Web app adalah publisher
sekaligus subscriber; ESP32/broker adalah sistem eksternal.

## Topik

```
smarthome/{roomId}/{deviceId}/telemetry
smarthome/{roomId}/{deviceId}/availability
smarthome/{roomId}/{deviceId}/lamp/command
smarthome/{roomId}/{deviceId}/lamp/state
```

Contoh (perangkat kanonis):

```
smarthome/ruang_tamu/esp32_01/telemetry
smarthome/ruang_tamu/esp32_01/availability
smarthome/ruang_tamu/esp32_01/lamp/command
smarthome/ruang_tamu/esp32_01/lamp/state
```

Perangkat lampu tambahan memakai pola yang sama:
`ruang_keluarga/esp32_02`, `kamar_utama/esp32_03`, `dapur/esp32_04`.

## QoS / Retain

| Topik | Publisher | Subscriber | QoS | Retain |
|---|---|---|---|---|
| `.../telemetry` | Perangkat | Web app | 0 | True (snapshot terakhir; tetap diperiksa freshness) |
| `.../availability` | Perangkat / Last Will | Web app | 1 | True |
| `.../lamp/command` | Web app | Perangkat | 1 | **False** (wajib — cegah replay perintah lama) |
| `.../lamp/state` | Perangkat | Web app | 1 | True |

Web app tidak pernah publish ke topik telemetry, availability, atau state.

## Payload

### Telemetri (perangkat → web app)

```json
{
  "schemaVersion": "1.0",
  "deviceId": "esp32_01",
  "ts": 1794480000000,
  "seq": 1024,
  "temperatureC": 28.5,
  "humidityPct": 65.2,
  "pressureHpa": 1008.4
}
```

| Field | Wajib | Aturan validasi |
|---|---|---|
| `schemaVersion` | Ya | Harus `"1.0"` |
| `deviceId` | Ya | Harus sama dengan perangkat dalam konteks |
| `ts` | Ya | Integer epoch ms; tidak > 5 menit di masa depan |
| `seq` | Tidak | Integer; dipakai dedup/out-of-order |
| `temperatureC` | Ya | Number, −10..60 |
| `humidityPct` | Tidak | Number, 0..100 |
| `pressureHpa` | Tidak | Number, 800..1200 |

### Perintah lampu (web app → perangkat)

```json
{
  "schemaVersion": "1.0",
  "deviceId": "esp32_01",
  "requestId": "req-20261112-0001",
  "targetState": "ON",
  "issuedAt": 1794480000000
}
```

- `targetState` selalu eksplisit `"ON"`/`"OFF"` — **bukan toggle**.
- `requestId` unik per perintah, format `req-<epoch>-<random>`, dipakai untuk
  korelasi dengan pesan state.
- Publish QoS 1, retain `false`.

### State lampu (perangkat → web app)

```json
{
  "schemaVersion": "1.0",
  "deviceId": "esp32_01",
  "requestId": "req-20261112-0001",
  "state": "ON",
  "ts": 1794480000200,
  "seq": 55
}
```

- `state` adalah **satu-satunya sumber confirmed state** di UI. Keberhasilan
  publish bukan bukti aktuator berubah.
- `requestId` opsional: bila cocok dengan pending command, pending selesai.
  State tanpa `requestId` tetap memperbarui confirmed state.
- `state` melaporkan output aktuator firmware, bukan bukti fisik independen
  bahwa lampu menyala (kecuali ada umpan balik fisik).

### Availability (perangkat → web app)

```json
{
  "schemaVersion": "1.0",
  "deviceId": "esp32_01",
  "status": "online",
  "ts": 1794480000000,
  "reason": "connected"
}
```

`status`: `"online"` | `"offline"`. Bila tidak ada pesan, UI menampilkan
`UNKNOWN`; `ONLINE` yang sudah > 10 detik tanpa pesan menjadi `STALE`.

## Aturan aplikasi

1. **Validasi dulu, state kemudian.** Payload malformed, field wajib hilang,
   tipe salah, rentang tidak wajar, `schemaVersion` salah, atau `deviceId`
   tidak sesuai konteks → ditolak diam-diam, dicatat di event log, state tidak
   berubah.
2. **Dedup / out-of-order.** Per perangkat+topik, hanya pesan dengan `seq`
   lebih besar (atau `ts` lebih besar bila tanpa `seq`) yang diterima. Duplikat
   dan pesan lama tidak boleh meregresi state.
3. **Freshness telemetri** (dari waktu penerimaan terakhir): ≤ 5 dtk `CURRENT`,
   > 5–10 dtk `STALE`, > 10 dtk `UNAVAILABLE`. Nilai yang tidak tersedia tampil
   `--`, bukan 0.
4. **Pending & timeout.** Setelah publish, UI menampilkan `PENDING` dengan
   target state. Bila tidak ada state cocok dalam timeout (default 3000 ms,
   dapat dikonfigurasi), UI menampilkan `TIMEOUT`, mempertahankan confirmed
   state terakhir, dan **tidak** mengklaim perangkat gagal berubah.
5. **Reconnect.** Klien reconnect otomatis (backoff 5 dtk), resubscribe semua
   topik, lalu memproses retained state/availability/telemetri (dengan
   freshness check) untuk sinkronisasi ulang. Pending lama dibatalkan dan
   **tidak pernah** dikirim ulang otomatis.
6. **Simulasi terisolasi.** Mode SIMULATION tidak pernah publish ke broker dan
   tidak mencampur data sintetis dengan data live.
7. **Keamanan.** Tidak ada kredensial di source code atau log; hanya kredensial
   berhak minimum; payload tidak pernah dieksekusi sebagai kode.
