// Daftar perangkat — SRS §6.2 + §2.4/NFR-11.
//
// Perangkat KANONIS (contoh SRS §6.2): ruang_tamu / esp32_01 — satu-satunya
// perangkat yang membawa telemetri (suhu/kelembapan/tekanan) sekaligus lampu.
// EKSTENSI (SRS §2.4: "satu atau lebih perangkat yang dapat diidentifikasi
// secara logis"): tiga perangkat lampu saja — ruang_keluarga/esp32_02,
// kamar_utama/esp32_03, dapur/esp32_04 — masing-masing dengan topik
// command/state sendiri dan kontrak payload yang sama. Menambah perangkat
// baru cukup dengan satu entri di sini; tidak ada perubahan konsep state.
import type { DeviceConfig } from '../config';

export const DEVICES: DeviceConfig[] = [
  {
    roomId: 'ruang_tamu',
    deviceId: 'esp32_01',
    roomName: 'Ruang Tamu',
    hasTelemetry: true,
  },
  {
    roomId: 'ruang_keluarga',
    deviceId: 'esp32_02',
    roomName: 'Ruang Keluarga',
    hasTelemetry: false,
  },
  {
    roomId: 'kamar_utama',
    deviceId: 'esp32_03',
    roomName: 'Kamar Utama',
    hasTelemetry: false,
  },
  {
    roomId: 'dapur',
    deviceId: 'esp32_04',
    roomName: 'Dapur',
    hasTelemetry: false,
  },
];

export const TELEMETRY_DEVICE = DEVICES.find((d) => d.hasTelemetry) ?? DEVICES[0];

export function deviceById(deviceId: string): DeviceConfig | undefined {
  return DEVICES.find((d) => d.deviceId === deviceId);
}

export function deviceByRoom(roomId: string): DeviceConfig | undefined {
  return DEVICES.find((d) => d.roomId === roomId);
}
