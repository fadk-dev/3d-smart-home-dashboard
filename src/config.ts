// Konfigurasi aplikasi — SRS IIoT Catering v1.1 (MVP).
// Monitoring-only: tidak ada kontrol perangkat, tidak ada publish perintah.
// Semua identitas ruangan/node, topik, dan konstanta waktu terpusat di sini.

/** Interval sampling baseline SRS §3.3 / NFR-01: 1 menit. */
export const SAMPLING_INTERVAL_MS = 60_000;

/** Tick simulasi dipercepat: 1 bacaan tiap 5 detik (bukan 1 menit) — lihat README. */
export const SIM_TICK_MS = 5_000;

/** Timeout offline = 3× interval sampling (NFR-02, AC-10). */
export const OFFLINE_TIMEOUT_LIVE_MS = 3 * SAMPLING_INTERVAL_MS; // 180 dtk
/** Timeout offline dalam simulasi dipercepat (30 dtk tanpa bacaan). */
export const OFFLINE_TIMEOUT_SIM_MS = 30_000;

/**
 * Freshness bacaan terakhir, relatif terhadap interval sampling 1 menit:
 * CURRENT ≤ 90 dtk, STALE 90–180 dtk, UNAVAILABLE > 180 dtk.
 */
export const FRESHNESS_CURRENT_MS = 90_000;
export const FRESHNESS_STALE_MS = 180_000;

/** Jendela kewajaran timestamp: tidak lebih dari 5 menit di masa depan (FR-02). */
export const TIMESTAMP_FUTURE_TOLERANCE_MS = 5 * 60_000;

/** Kapasitas histori di memori per ruangan (titik). */
export const HISTORY_CAPACITY = 240;

/** Kapasitas bacaan tersimpan di IndexedDB (bacaan terbaru dipertahankan). */
export const READINGS_DB_CAP = 10_000;

/** Seed histori sintetis saat pertama load (menit, interval 1 menit). */
export const SEED_HISTORY_MINUTES = 120;

/** Throttle log ringkasan telemetri per perangkat (ms). */
export const TELEMETRY_LOG_THROTTLE_MS = 300_000;

/** Throttle entri Invalid Sensor Data per perangkat (ms): maks 1 per menit. */
export const INVALID_LOG_THROTTLE_MS = 60_000;

/** Broker publik untuk pengujian (placeholder — bukan kredensial, tanpa auth). */
export const DEFAULT_BROKER_URL =
  import.meta.env.VITE_MQTT_URL ?? 'wss://broker.emqx.io:8084/mqtt';

export const DEFAULT_MQTT_USERNAME = import.meta.env.VITE_MQTT_USERNAME ?? '';
export const DEFAULT_MQTT_PASSWORD = import.meta.env.VITE_MQTT_PASSWORD ?? '';

export type AppMode = 'LIVE' | 'SIMULATION';
export type BrokerStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'DISABLED' | 'STALE';
export type Freshness = 'CURRENT' | 'STALE' | 'UNAVAILABLE';
export type Parameter = 'humidity' | 'temperature' | 'pressure';
export type UserRole = 'ADMIN' | 'OPERATOR';
export type RoomId = 'R01' | 'R02' | 'R03' | 'R04' | 'R05' | 'R06' | 'R07A' | 'R07B' | 'R08';
export type AlertStatus = 'Active' | 'Acknowledged' | 'Resolved';

export const PARAMETER_META: Record<Parameter, { label: string; unit: string }> = {
  humidity: { label: 'Kelembapan', unit: '%RH' },
  temperature: { label: 'Suhu', unit: '°C' },
  pressure: { label: 'Tekanan Diferensial', unit: 'Pa' },
};

export const PARAMETER_ORDER: Parameter[] = ['humidity', 'temperature', 'pressure'];

/** Timeout offline sesuai mode aktif. */
export function offlineTimeoutMs(mode: AppMode): number {
  return mode === 'SIMULATION' ? OFFLINE_TIMEOUT_SIM_MS : OFFLINE_TIMEOUT_LIVE_MS;
}

/** Label mode untuk UI. */
export function modeLabel(mode: AppMode): string {
  return mode === 'LIVE' ? 'LIVE' : 'SIMULATION';
}
