// Validasi payload MQTT IIoT — SRS §6 / FR-02.
// Setiap pesan masuk divalidasi SEBELUM menyentuh state aplikasi. Pesan yang
// tidak valid ditolak diam-diam ke event log dan tidak pernah mengubah state.
// Tidak ada `any` di API publik: payload mentah masuk sebagai `unknown`.
//
// Kontrak payload (FR-02):
//   {"device_id":"NODE-R06-001","room_id":"R06",
//    "timestamp":"2026-11-12T09:00:00Z",
//    "humidity":62.5,"temperature":27.8,"pressure":5.2,
//    "pressure_reference":"R05"}
//   pressure = ΔP = P_R06 − P_R05, hanya dimiliki node R06.
import {
  FRESHNESS_CURRENT_MS,
  FRESHNESS_STALE_MS,
  TIMESTAMP_FUTURE_TOLERANCE_MS,
} from '../config';
import type { Freshness, RoomId } from '../config';
import { nodeById } from '../config/devices';

export interface TelemetryPayload {
  deviceId: string;
  roomId: RoomId;
  /** Epoch ms hasil parse `timestamp` ISO-8601. */
  ts: number;
  timestamp: string;
  humidity: number;
  temperature: number;
  /** ΔP (Pa) — hanya R06; null bila tidak ada sensor / tidak dikirim. */
  pressure: number | null;
  pressureReference?: string;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function inRange(v: number, min: number, max: number): boolean {
  return v >= min && v <= max;
}

/** Parse JSON mentah; gagal parse = pesan malformed. */
export function parseJson(raw: string): ValidationResult<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, error: 'Payload bukan JSON yang valid' };
  }
  if (!isRecord(parsed)) return { ok: false, error: 'Payload bukan objek JSON' };
  return { ok: true, value: parsed };
}

/**
 * Validasi telemetri IIoT (FR-02). Aturan:
 * - device_id wajib dikenal (salah satu dari 9 node) dan room_id harus cocok
 *   dengan ruangan node tersebut.
 * - timestamp wajib ISO-8601 yang bisa di-parse, tidak > 5 menit di masa depan.
 * - humidity (0–100 %RH) dan temperature (−30–60 °C) WAJIB ada pada semua node
 *   (field hilang/null hanya diizinkan untuk sensor yang tidak dimiliki node).
 * - pressure (−50–50 Pa) HANYA boleh ada pada node R06 (NODE-R06-001);
 *   pressure pada node lain = invalid. Pada R06, pressure boleh null/hilang.
 * - pressure_reference bila ada harus "R05".
 */
export function validateTelemetry(
  raw: unknown,
  nowMs = Date.now(),
): ValidationResult<TelemetryPayload> {
  if (!isRecord(raw)) return { ok: false, error: 'Payload telemetri bukan objek' };

  if (typeof raw.device_id !== 'string' || raw.device_id.length === 0) {
    return { ok: false, error: 'device_id wajib berupa string non-kosong' };
  }
  const node = nodeById(raw.device_id);
  if (!node) {
    return { ok: false, error: `device_id "${raw.device_id}" tidak dikenal` };
  }
  if (typeof raw.room_id !== 'string' || raw.room_id.length === 0) {
    return { ok: false, error: 'room_id wajib berupa string non-kosong' };
  }
  if (raw.room_id !== node.roomId) {
    return {
      ok: false,
      error: `room_id "${raw.room_id}" tidak cocok dengan ruangan node ${node.deviceId} (${node.roomId})`,
    };
  }

  if (typeof raw.timestamp !== 'string' || raw.timestamp.length === 0) {
    return { ok: false, error: 'timestamp wajib berupa string ISO-8601' };
  }
  const ts = Date.parse(raw.timestamp);
  if (!Number.isFinite(ts)) {
    return { ok: false, error: `timestamp "${raw.timestamp}" tidak bisa di-parse (ISO-8601)` };
  }
  if (ts > nowMs + TIMESTAMP_FUTURE_TOLERANCE_MS) {
    return { ok: false, error: 'timestamp terlalu jauh di masa depan' };
  }

  if (!isFiniteNumber(raw.humidity)) {
    return { ok: false, error: 'humidity wajib berupa number (sensor dimiliki semua node)' };
  }
  if (!inRange(raw.humidity, 0, 100)) {
    return { ok: false, error: 'humidity di luar rentang 0..100 %RH' };
  }
  if (!isFiniteNumber(raw.temperature)) {
    return { ok: false, error: 'temperature wajib berupa number (sensor dimiliki semua node)' };
  }
  if (!inRange(raw.temperature, -30, 60)) {
    return { ok: false, error: 'temperature di luar rentang -30..60 °C' };
  }

  const isR06 = node.roomId === 'R06';
  let pressure: number | null = null;
  if (raw.pressure !== undefined && raw.pressure !== null) {
    if (!isR06) {
      return {
        ok: false,
        error: `pressure hanya dimiliki node R06 (NODE-R06-001), bukan ${node.deviceId}`,
      };
    }
    if (!isFiniteNumber(raw.pressure)) {
      return { ok: false, error: 'pressure harus number bila ada' };
    }
    if (!inRange(raw.pressure, -50, 50)) {
      return { ok: false, error: 'pressure di luar rentang -50..50 Pa' };
    }
    pressure = raw.pressure;
  }
  if (raw.pressure_reference !== undefined) {
    if (typeof raw.pressure_reference !== 'string' || raw.pressure_reference !== 'R05') {
      return { ok: false, error: 'pressure_reference harus "R05" bila ada' };
    }
  }

  return {
    ok: true,
    value: {
      deviceId: raw.device_id,
      roomId: node.roomId,
      ts,
      timestamp: raw.timestamp,
      humidity: raw.humidity,
      temperature: raw.temperature,
      pressure,
      pressureReference:
        typeof raw.pressure_reference === 'string' ? raw.pressure_reference : undefined,
    },
  };
}

/**
 * Klasifikasi freshness bacaan (interval sampling 1 menit): CURRENT ≤ 90 dtk,
 * STALE 90–180 dtk, UNAVAILABLE > 180 dtk.
 */
export function classifyFreshness(ageMs: number): Freshness {
  if (ageMs <= FRESHNESS_CURRENT_MS) return 'CURRENT';
  if (ageMs <= FRESHNESS_STALE_MS) return 'STALE';
  return 'UNAVAILABLE';
}

export interface DedupMark {
  lastTs?: number;
}

/**
 * Dedup / out-of-order: pesan diterima hanya bila timestamp-nya lebih baru
 * dari bacaan terakhir perangkat itu (kunci dedup: device_id + timestamp).
 * Duplikat (ts sama) dan pesan lama ditolak — tidak boleh meregresi state.
 */
export function isNewerThan(mark: DedupMark, incoming: { ts: number }): boolean {
  if (mark.lastTs !== undefined) return incoming.ts > mark.lastTs;
  return true;
}
