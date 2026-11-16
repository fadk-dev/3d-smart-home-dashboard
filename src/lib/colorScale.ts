// Skala warna visualisasi 3D — lantai ruangan diwarnai menurut nilai sensor
// terakhir tiap ruangan (bukan menurut status alert).
// Suhu: biru (dingin) → merah (panas). Kelembapan: pucat (kering) → biru tua (lembap).
// Mode 'both' memakai dua warna sekaligus (separuh lantai suhu, separuh kelembapan).
// Fungsi murni + teruji (lihat __tests__/colorScale.test.ts).

export type VizMode = 'status' | 'temperature' | 'humidity' | 'both';

export const DEFAULT_TEMP_SCALE = { min: -20, max: 40 };
export const DEFAULT_HUM_SCALE = { min: 0, max: 100 };

/** Gradasi suhu: biru → cyan → hijau → kuning → oranye → merah. */
export const TEMP_STOPS = ['#2563eb', '#22d3ee', '#22c55e', '#facc15', '#f97316', '#dc2626'];
/** Gradasi kelembapan: kuning pucat (kering) → biru muda → biru tua (lembap). */
export const HUM_STOPS = ['#fef9c3', '#7dd3fc', '#1d4ed8'];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const c = (v: number): string => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Interpolasi linear pada skala multi-stop; t dijepit ke 0..1. */
export function sampleScale(stops: string[], tRaw: number): string {
  const t = Math.max(0, Math.min(1, tRaw));
  if (stops.length === 1) return stops[0];
  const pos = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(pos));
  const f = pos - i;
  const a = hexToRgb(stops[i]);
  const b = hexToRgb(stops[i + 1]);
  return rgbToHex([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
}

/** Normalisasi nilai ke 0..1 terhadap rentang skala; min >= max dianggap invalid (null). */
function normalize(value: number, min: number, max: number): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
  return (value - min) / (max - min);
}

/** Warna suhu (°C); null bila tidak ada nilai atau rentang skala invalid. */
export function temperatureColor(
  tempC: number | null | undefined,
  min: number = DEFAULT_TEMP_SCALE.min,
  max: number = DEFAULT_TEMP_SCALE.max,
): string | null {
  if (tempC === null || tempC === undefined) return null;
  const t = normalize(tempC, min, max);
  return t === null ? null : sampleScale(TEMP_STOPS, t);
}

/** Warna kelembapan (%RH); null bila tidak ada nilai atau rentang skala invalid. */
export function humidityColor(
  humPct: number | null | undefined,
  min: number = DEFAULT_HUM_SCALE.min,
  max: number = DEFAULT_HUM_SCALE.max,
): string | null {
  if (humPct === null || humPct === undefined) return null;
  const t = normalize(humPct, min, max);
  return t === null ? null : sampleScale(HUM_STOPS, t);
}

/** CSS linear-gradient untuk legenda skala. */
export function gradientCss(stops: string[]): string {
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}
