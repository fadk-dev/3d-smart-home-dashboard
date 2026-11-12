// Konfigurasi aplikasi — SRS §3, §6.2, §9.1, NFR-04.
// Semua identitas ruangan/perangkat, topik, dan default koneksi terpusat di sini
// agar penambahan perangkat (NFR-11) tidak mengubah konsep state dasar.

export const SCHEMA_VERSION = '1.0';

/** Batas freshness telemetri (SRS §9.5): CURRENT ≤5 dtk, STALE >5–10 dtk, UNAVAILABLE >10 dtk. */
export const FRESHNESS_CURRENT_MS = 5_000;
export const FRESHNESS_STALE_MS = 10_000;

/** Buffer histori telemetri (SRS §9.1): 60 titik, interval baseline 2 dtk. */
export const HISTORY_CAPACITY = 60;
export const TELEMETRY_INTERVAL_MS = 2_000;

/** Timeout perintah default (NFR-04): 3000 ms, dapat diubah lewat panel pengaturan. */
export const DEFAULT_COMMAND_TIMEOUT_MS = 3_000;

/** Jendela kewajaran timestamp: tidak lebih dari 5 menit di masa depan. */
export const TIMESTAMP_FUTURE_TOLERANCE_MS = 5 * 60_000;

/** Broker publik untuk pengujian (placeholder — bukan kredensial, tanpa auth). */
export const DEFAULT_BROKER_URL =
  import.meta.env.VITE_MQTT_URL ?? 'wss://broker.emqx.io:8084/mqtt';

export const DEFAULT_MQTT_USERNAME = import.meta.env.VITE_MQTT_USERNAME ?? '';
export const DEFAULT_MQTT_PASSWORD = import.meta.env.VITE_MQTT_PASSWORD ?? '';

export type LampState = 'ON' | 'OFF';
export type AppMode = 'LIVE' | 'SIMULATION';
export type BrokerStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
export type Availability = 'ONLINE' | 'OFFLINE' | 'UNKNOWN' | 'STALE';
export type Freshness = 'CURRENT' | 'STALE' | 'UNAVAILABLE';

export interface DeviceConfig {
  roomId: string;
  deviceId: string;
  roomName: string;
  /** true bila perangkat ini membawa sensor telemetri (hanya perangkat kanonis). */
  hasTelemetry: boolean;
}

export function telemetryTopic(d: DeviceConfig): string {
  return `smarthome/${d.roomId}/${d.deviceId}/telemetry`;
}
export function availabilityTopic(d: DeviceConfig): string {
  return `smarthome/${d.roomId}/${d.deviceId}/availability`;
}
export function lampCommandTopic(d: DeviceConfig): string {
  return `smarthome/${d.roomId}/${d.deviceId}/lamp/command`;
}
export function lampStateTopic(d: DeviceConfig): string {
  return `smarthome/${d.roomId}/${d.deviceId}/lamp/state`;
}

/** Semua topik yang harus di-subscribe untuk satu perangkat (SRS §6.8). */
export function subscribeTopics(d: DeviceConfig): string[] {
  return [telemetryTopic(d), availabilityTopic(d), lampStateTopic(d)];
}
