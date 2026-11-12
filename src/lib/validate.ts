// Validasi payload MQTT — SRS §6.4–§6.8, FR-15/16/17, AC-12/13, NFR-07.
// Setiap pesan masuk divalidasi SEBELUM menyentuh state aplikasi. Pesan yang
// tidak valid ditolak diam-diam ke event log dan tidak pernah mengubah state.
// Tidak ada `any` di API publik: payload mentah masuk sebagai `unknown`.
import {
  FRESHNESS_CURRENT_MS,
  FRESHNESS_STALE_MS,
  SCHEMA_VERSION,
  TIMESTAMP_FUTURE_TOLERANCE_MS,
} from '../config';
import type { Freshness, LampState } from '../config';

export interface TelemetryPayload {
  schemaVersion: '1.0';
  deviceId: string;
  ts: number;
  seq?: number;
  temperatureC: number;
  humidityPct?: number;
  pressureHpa?: number;
}

export interface LampCommandPayload {
  schemaVersion: '1.0';
  deviceId: string;
  requestId: string;
  targetState: LampState;
  issuedAt: number;
}

export interface LampStatePayload {
  schemaVersion: '1.0';
  deviceId: string;
  requestId?: string;
  state: LampState;
  ts: number;
  seq?: number;
}

export interface AvailabilityPayload {
  schemaVersion: '1.0';
  deviceId: string;
  status: 'online' | 'offline';
  ts: number;
  reason?: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function inRange(v: number, min: number, max: number): boolean {
  return v >= min && v <= max;
}

/** Parse JSON mentah; gagal parse = pesan malformed (FR-15). */
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

function checkSchemaVersion(v: Record<string, unknown>): string | null {
  if (v.schemaVersion !== SCHEMA_VERSION) {
    return `schemaVersion harus "${SCHEMA_VERSION}"`;
  }
  return null;
}

function checkDeviceId(
  v: Record<string, unknown>,
  expectedDeviceId: string,
): string | null {
  if (typeof v.deviceId !== 'string' || v.deviceId.length === 0) {
    return 'deviceId wajib berupa string non-kosong';
  }
  if (v.deviceId !== expectedDeviceId) {
    return `deviceId "${v.deviceId}" tidak sesuai konteks "${expectedDeviceId}"`;
  }
  return null;
}

/** Timestamp sumber: integer epoch ms, tidak lebih dari 5 menit di masa depan. */
function checkTs(v: Record<string, unknown>, nowMs: number): string | null {
  if (!isInt(v.ts)) return 'ts wajib berupa integer epoch milidetik';
  if (v.ts <= 0) return 'ts harus positif';
  if (v.ts > nowMs + TIMESTAMP_FUTURE_TOLERANCE_MS) {
    return 'ts terlalu jauh di masa depan';
  }
  return null;
}

function checkOptionalSeq(v: Record<string, unknown>): string | null {
  if (v.seq !== undefined && !isInt(v.seq)) return 'seq harus integer bila ada';
  return null;
}

/**
 * Validasi telemetri (SRS §6.4). Rentang: suhu −10..60 °C, kelembapan 0..100 %,
 * tekanan 800..1200 hPa. temperatureC wajib; humidityPct/pressureHpa opsional.
 */
export function validateTelemetry(
  raw: unknown,
  expectedDeviceId: string,
  nowMs = Date.now(),
): ValidationResult<TelemetryPayload> {
  if (!isRecord(raw)) return { ok: false, error: 'Payload telemetri bukan objek' };
  const err =
    checkSchemaVersion(raw) ??
    checkDeviceId(raw, expectedDeviceId) ??
    checkTs(raw, nowMs) ??
    checkOptionalSeq(raw);
  if (err) return { ok: false, error: err };
  if (!isFiniteNumber(raw.temperatureC)) {
    return { ok: false, error: 'temperatureC wajib berupa number' };
  }
  if (!inRange(raw.temperatureC, -10, 60)) {
    return { ok: false, error: 'temperatureC di luar rentang -10..60' };
  }
  if (raw.humidityPct !== undefined) {
    if (!isFiniteNumber(raw.humidityPct)) {
      return { ok: false, error: 'humidityPct harus number bila ada' };
    }
    if (!inRange(raw.humidityPct, 0, 100)) {
      return { ok: false, error: 'humidityPct di luar rentang 0..100' };
    }
  }
  if (raw.pressureHpa !== undefined) {
    if (!isFiniteNumber(raw.pressureHpa)) {
      return { ok: false, error: 'pressureHpa harus number bila ada' };
    }
    if (!inRange(raw.pressureHpa, 800, 1200)) {
      return { ok: false, error: 'pressureHpa di luar rentang 800..1200' };
    }
  }
  return {
    ok: true,
    value: {
      schemaVersion: '1.0',
      deviceId: raw.deviceId as string,
      ts: raw.ts as number,
      seq: raw.seq as number | undefined,
      temperatureC: raw.temperatureC,
      humidityPct: raw.humidityPct as number | undefined,
      pressureHpa: raw.pressureHpa as number | undefined,
    },
  };
}

/** Validasi state lampu (SRS §6.6). requestId opsional — state tanpa requestId tetap valid. */
export function validateLampState(
  raw: unknown,
  expectedDeviceId: string,
  nowMs = Date.now(),
): ValidationResult<LampStatePayload> {
  if (!isRecord(raw)) return { ok: false, error: 'Payload state bukan objek' };
  const err =
    checkSchemaVersion(raw) ??
    checkDeviceId(raw, expectedDeviceId) ??
    checkTs(raw, nowMs) ??
    checkOptionalSeq(raw);
  if (err) return { ok: false, error: err };
  if (raw.state !== 'ON' && raw.state !== 'OFF') {
    return { ok: false, error: 'state harus "ON" atau "OFF"' };
  }
  if (raw.requestId !== undefined && typeof raw.requestId !== 'string') {
    return { ok: false, error: 'requestId harus string bila ada' };
  }
  return {
    ok: true,
    value: {
      schemaVersion: '1.0',
      deviceId: raw.deviceId as string,
      requestId: raw.requestId as string | undefined,
      state: raw.state,
      ts: raw.ts as number,
      seq: raw.seq as number | undefined,
    },
  };
}

/** Validasi availability (SRS §6.7). */
export function validateAvailability(
  raw: unknown,
  expectedDeviceId: string,
  nowMs = Date.now(),
): ValidationResult<AvailabilityPayload> {
  if (!isRecord(raw)) return { ok: false, error: 'Payload availability bukan objek' };
  const err =
    checkSchemaVersion(raw) ??
    checkDeviceId(raw, expectedDeviceId) ??
    checkTs(raw, nowMs);
  if (err) return { ok: false, error: err };
  if (raw.status !== 'online' && raw.status !== 'offline') {
    return { ok: false, error: 'status harus "online" atau "offline"' };
  }
  if (raw.reason !== undefined && typeof raw.reason !== 'string') {
    return { ok: false, error: 'reason harus string bila ada' };
  }
  return {
    ok: true,
    value: {
      schemaVersion: '1.0',
      deviceId: raw.deviceId as string,
      status: raw.status,
      ts: raw.ts as number,
      reason: raw.reason as string | undefined,
    },
  };
}

/** Validasi command sebelum publish (NFR-13): hanya struktur/enum yang sah. */
export function validateLampCommand(raw: unknown): ValidationResult<LampCommandPayload> {
  if (!isRecord(raw)) return { ok: false, error: 'Payload command bukan objek' };
  const err = checkSchemaVersion(raw);
  if (err) return { ok: false, error: err };
  if (typeof raw.deviceId !== 'string' || raw.deviceId.length === 0) {
    return { ok: false, error: 'deviceId wajib berupa string non-kosong' };
  }
  if (typeof raw.requestId !== 'string' || raw.requestId.length === 0) {
    return { ok: false, error: 'requestId wajib berupa string non-kosong' };
  }
  if (raw.targetState !== 'ON' && raw.targetState !== 'OFF') {
    return { ok: false, error: 'targetState harus "ON" atau "OFF"' };
  }
  if (!isInt(raw.issuedAt) || raw.issuedAt <= 0) {
    return { ok: false, error: 'issuedAt wajib berupa integer epoch milidetik' };
  }
  return {
    ok: true,
    value: {
      schemaVersion: '1.0',
      deviceId: raw.deviceId,
      requestId: raw.requestId,
      targetState: raw.targetState,
      issuedAt: raw.issuedAt,
    },
  };
}

/** Bentuk command baru dengan requestId unik `req-<epoch>-<random>` (SRS §6.5). */
export function buildLampCommand(
  deviceId: string,
  targetState: LampState,
  nowMs = Date.now(),
): LampCommandPayload {
  return {
    schemaVersion: SCHEMA_VERSION,
    deviceId,
    requestId: `req-${nowMs}-${Math.random().toString(36).slice(2, 10)}`,
    targetState,
    issuedAt: nowMs,
  };
}

/** Klasifikasi freshness telemetri (SRS §9.5). Batas: ≤5 dtk CURRENT, >5–10 dtk STALE, >10 dtk UNAVAILABLE. */
export function classifyFreshness(ageMs: number): Freshness {
  if (ageMs <= FRESHNESS_CURRENT_MS) return 'CURRENT';
  if (ageMs <= FRESHNESS_STALE_MS) return 'STALE';
  return 'UNAVAILABLE';
}

export interface DedupMark {
  lastSeq?: number;
  lastTs?: number;
}

/**
 * Dedup / out-of-order (FR-17, AC-13): pesan diterima hanya bila lebih baru
 * dari yang terakhir dilihat untuk pasangan perangkat+topik. Bila `seq` ada di
 * kedua pesan, seq yang menentukan; bila tidak, `ts` yang menentukan.
 * Duplikat (seq/ts sama) ditolak — tidak boleh meregresi state.
 */
export function isNewerThan(mark: DedupMark, incoming: { seq?: number; ts: number }): boolean {
  if (
    incoming.seq !== undefined &&
    mark.lastSeq !== undefined &&
    incoming.seq !== mark.lastSeq
  ) {
    return incoming.seq > mark.lastSeq;
  }
  if (incoming.seq !== undefined && mark.lastSeq !== undefined) {
    return false; // seq sama = duplikat
  }
  if (mark.lastTs !== undefined) return incoming.ts > mark.lastTs;
  return true;
}
