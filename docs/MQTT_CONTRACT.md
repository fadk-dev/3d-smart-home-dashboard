# Kontrak MQTT — IIoT Catering Monitoring (SRS v1.1 §6, FR-02)

Dokumen ini menyalin kontrak dari SRS v1.1 Bab 6 / FR-02. Web app adalah
**subscriber saja (monitoring-only)**; ESP32/gateway adalah publisher.
Aplikasi **tidak pernah publish** ke topik apa pun — tidak ada perintah,
tidak ada kontrol.

## Topik

```
iiot/catering/{room_id}/{device_id}/telemetry
```

Contoh (9 node):

```
iiot/catering/R01/NODE-R01-001/telemetry
iiot/catering/R02/NODE-R02-001/telemetry
iiot/catering/R03/NODE-R03-001/telemetry
iiot/catering/R04/NODE-R04-001/telemetry
iiot/catering/R05/NODE-R05-001/telemetry
iiot/catering/R06/NODE-R06-001/telemetry
iiot/catering/R07/NODE-R07-001/telemetry
iiot/catering/R07/NODE-R07-002/telemetry
iiot/catering/R08/NODE-R08-001/telemetry
```

Tidak ada topik lain yang di-subscribe. Tidak ada topik command/state/
availability di MVP ini.

## QoS / Retain

| Topik | Publisher | Subscriber | QoS | Retain |
|---|---|---|---|---|
| `.../telemetry` | Perangkat | Web app | 1 | True (snapshot terakhir; tetap diperiksa freshness) |

Web app tidak pernah publish ke topik apa pun.

## Payload

### Telemetri (perangkat → web app)

```json
{
  "device_id": "NODE-R06-001",
  "room_id": "R06",
  "timestamp": "2026-11-12T09:00:00Z",
  "humidity": 62.5,
  "temperature": 27.8,
  "pressure": 5.2,
  "pressure_reference": "R05"
}
```

| Field | Wajib | Aturan validasi |
|---|---|---|
| `device_id` | Ya | Harus salah satu dari 9 node yang dikenal |
| `room_id` | Ya | Harus cocok dengan ruangan node itu; harus cocok dengan topik |
| `timestamp` | Ya | String ISO-8601 yang bisa di-parse; tidak > 5 menit di masa depan |
| `humidity` | Ya | Number, 0..100 (%RH). Wajib di semua node |
| `temperature` | Ya | Number, −30..60 (°C). Wajib di semua node |
| `pressure` | Tidak | Number, −50..50 (Pa). **Hanya node R06** (NODE-R06-001); pressure pada node lain = invalid. Pada R06 boleh `null`/dihilangkan |
| `pressure_reference` | Tidak | Bila ada harus `"R05"` |

Field yang tidak tersedia boleh `null`/dihilangkan **hanya untuk sensor yang
tidak dimiliki node** (yaitu `pressure` di semua node kecuali R06).
`humidity`/`temperature` `null`/hilang selalu invalid.

## Differential Pressure (ΔP)

```
ΔP = P_R06 − P_R05
```

- P1 = tekanan area pengemasan (R06), P2 = tekanan dapur produksi (R05).
- Sensor ΔP hanya ada pada batas R06/R05; node R06 mengirim nilai ΔP yang
  sudah dihitung gateway/ESP32 beserta `pressure_reference: "R05"`.
- Threshold ΔP default (contoh awal): 2,5–15 Pa (lihat README — wajib
  dikonfirmasi admin).

## Aturan aplikasi

1. **Validasi dulu, state kemudian.** Payload malformed, field wajib hilang,
   tipe salah, rentang tidak wajar, `device_id`/`room_id` tidak dikenal atau
   tidak cocok topik, `timestamp` tidak bisa di-parse/terlalu jauh di masa
   depan, atau `pressure` di node non-R06 → ditolak diam-diam, dicatat di
   event log + alert `Invalid Sensor Data` (di-throttle maks. 1 per perangkat
   per menit), state tidak berubah.
2. **Dedup / out-of-order.** Per perangkat, hanya pesan dengan `timestamp`
   lebih baru dari bacaan terakhir yang diterima (kunci dedup: `device_id` +
   `timestamp`). Duplikat dan pesan lama tidak boleh meregresi state.
3. **Freshness bacaan** (dari waktu bacaan terakhir): ≤ 90 dtk `CURRENT`,
   > 90–180 dtk `STALE`, > 180 dtk `UNAVAILABLE`. Nilai yang tidak tersedia
   tampil `--`, bukan 0.
4. **Offline / timeout.** Perangkat yang tidak mengirim bacaan > 3× interval
   sampling (180 dtk di LIVE; 30 dtk di simulasi dipercepat) menjadi `OFFLINE`
   + alert `Device Offline`. Bacaan berikutnya mengembalikannya ke `ONLINE`
   dan me-resolve alert otomatis. Perangkat yang dinonaktifkan (`Disabled`)
   tidak pernah memicu alert offline.
5. **Reconnect.** Klien reconnect otomatis (backoff 5 dtk), resubscribe semua
   topik telemetri, lalu memproses pesan retained (dengan dedup timestamp dan
   freshness check) untuk sinkronisasi ulang.
6. **Simulasi terisolasi.** Mode SIMULATION tidak pernah publish ke broker dan
   tidak mencampur data sintetis dengan data live. Simulasi berjalan dipercepat
   (1 bacaan / 5 dtk) dan men-seed 120 menit histori — lihat README.
7. **Keamanan.** Tidak ada kredensial di source code atau log; hanya kredensial
   berhak minimum (subscribe-only); payload tidak pernah dieksekusi sebagai kode.
   Autentikasi pengguna dashboard (NFR-03) adalah lingkup backend produksi;
   peran Administrator/Operator di aplikasi ini hanya peran UI lokal.
