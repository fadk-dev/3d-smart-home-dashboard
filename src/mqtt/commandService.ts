// Layanan evaluasi threshold & alert — SRS IIoT Catering v1.1 FR-06/FR-07.
//
// CATATAN REPURPOSE: file ini dulu Command Manager (kontrol lampu). MVP IIoT
// Catering adalah MONITORING-ONLY — tidak ada publish perintah, tidak ada
// kontrol perangkat, dan file ini tidak lagi menyentuh MQTT sama sekali.
// Modul ini murni (tanpa efek samping): menerima nilai + threshold, dan
// mengembalikan pelanggaran yang ditemukan. Dedup alert (satu alert aktif
// per ruangan+parameter+tipe) dan auto-resolve ditangani store
// (`src/store/useStore.ts`).
import type { Parameter, RoomId } from '../config';
import { PARAMETER_META } from '../config';
import type { ThresholdSet } from '../config/devices';

export type AlertType =
  | 'Humidity High'
  | 'Humidity Low'
  | 'Temperature High'
  | 'Temperature Low'
  | 'Pressure High'
  | 'Pressure Low'
  | 'Device Offline'
  | 'Invalid Sensor Data';

export interface ThresholdBreach {
  parameter: Parameter;
  alertType: AlertType;
  actualValue: number;
  thresholdValue: number;
}

const HIGH_TYPE: Record<Parameter, AlertType> = {
  humidity: 'Humidity High',
  temperature: 'Temperature High',
  pressure: 'Pressure High',
};

const LOW_TYPE: Record<Parameter, AlertType> = {
  humidity: 'Humidity Low',
  temperature: 'Temperature Low',
  pressure: 'Pressure Low',
};

/**
 * Evaluasi satu parameter terhadap rentang min/max.
 * Mengembalikan pelanggaran (atau null bila nilai dalam rentang / tidak ada).
 */
export function evaluateParameter(
  parameter: Parameter,
  value: number | null,
  range: { min: number; max: number } | undefined,
): ThresholdBreach | null {
  if (value === null || value === undefined || range === undefined) return null;
  if (value > range.max) {
    return {
      parameter,
      alertType: HIGH_TYPE[parameter],
      actualValue: value,
      thresholdValue: range.max,
    };
  }
  if (value < range.min) {
    return {
      parameter,
      alertType: LOW_TYPE[parameter],
      actualValue: value,
      thresholdValue: range.min,
    };
  }
  return null;
}

export interface ReadingValues {
  humidity: number | null;
  temperature: number | null;
  pressure: number | null;
}

/**
 * Evaluasi satu bacaan lengkap terhadap threshold ruangan.
 * Mengembalikan daftar pelanggaran (maks. 1 per parameter).
 */
export function evaluateReading(
  values: ReadingValues,
  thresholds: ThresholdSet,
): ThresholdBreach[] {
  const out: ThresholdBreach[] = [];
  const params: Parameter[] = ['humidity', 'temperature', 'pressure'];
  for (const p of params) {
    const b = evaluateParameter(p, values[p], thresholds[p]);
    if (b) out.push(b);
  }
  return out;
}

/** Kunci dedup alert: satu alert aktif per (ruangan, parameter, tipe). */
export function alertKey(roomId: RoomId, parameter: Parameter, alertType: AlertType): string {
  return `${roomId}|${parameter}|${alertType}`;
}

/** Kunci dedup alert Device Offline: satu alert aktif per perangkat. */
export function offlineAlertKey(deviceId: string): string {
  return `${deviceId}|device|Device Offline`;
}

/** Kunci dedup alert Invalid Sensor Data: satu alert aktif per perangkat. */
export function invalidAlertKey(deviceId: string): string {
  return `${deviceId}|device|Invalid Sensor Data`;
}

/** Label parameter untuk UI alert (termasuk 'device' untuk alert perangkat). */
export function alertParameterLabel(parameter: Parameter | 'device'): string {
  if (parameter === 'device') return 'Perangkat';
  return PARAMETER_META[parameter].label;
}
