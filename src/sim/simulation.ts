// Simulation Manager — SRS IIoT Catering v1.1 (MVP).
// Terisolasi penuh dari broker: modul ini TIDAK PERNAH memanggil mqttService
// dan tidak pernah publish apa pun. Data sintetis ditandai [SIM] di event log
// dan mode SIMULATION selalu terlihat di status bar.
//
// PENYIMPANGAN TERDOKUMENTASI dari baseline SRS §3.3/NFR-01 (sampling 1 menit):
// simulasi berjalan DIPERCEPAT — 1 bacaan per node tiap 5 detik — dan saat
// pertama load, 120 menit histori sintetis (interval 1 menit) di-seed ke
// IndexedDB agar grafik/tabel/CSV langsung bermakna. Perilaku ini hanya
// untuk mode SIMULATION; mode LIVE memakai interval 1 menit dari perangkat.
//
// Perilaku breach (agar alert terlihat): kira-kira tiap 3 menit, satu ruangan
// didorong keluar threshold selama ~30 detik lalu pulih sendiri (random walk
// menarik nilai kembali ke baseline).
import { SEED_HISTORY_MINUTES, SIM_TICK_MS } from '../config';
import type { Parameter } from '../config';
import { DEFAULT_THRESHOLDS, NODES } from '../config/devices';
import type { NodeConfig, ThresholdSet } from '../config/devices';
import { useIiotStore } from '../store/useStore';
import { validateTelemetry } from '../lib/validate';
import { db } from '../lib/db';

export interface SimBaselines {
  humidity: number;
  temperature: number;
  pressure: number | null;
  humSwing: number;
  tempSwing: number;
  pressSwing: number;
}

/** Baseline berbeda per ruangan — R03 dingin, R05 panas, R04 lembap, R06 ΔP +. */
export const SIM_BASELINES: Record<string, SimBaselines> = {
  'NODE-R01-001': { humidity: 60, temperature: 26, pressure: null, humSwing: 5, tempSwing: 2, pressSwing: 0 },
  'NODE-R02-001': { humidity: 55, temperature: 26.5, pressure: null, humSwing: 5, tempSwing: 1.5, pressSwing: 0 },
  'NODE-R03-001': { humidity: 68, temperature: -12, pressure: null, humSwing: 7, tempSwing: 4, pressSwing: 0 },
  'NODE-R04-001': { humidity: 78, temperature: 26, pressure: null, humSwing: 6, tempSwing: 2, pressSwing: 0 },
  'NODE-R05-001': { humidity: 62, temperature: 33, pressure: null, humSwing: 7, tempSwing: 3, pressSwing: 0 },
  'NODE-R06-001': { humidity: 60, temperature: 23.5, pressure: 8, humSwing: 5, tempSwing: 1.5, pressSwing: 3 },
  'NODE-R07A-001': { humidity: 55, temperature: 12, pressure: null, humSwing: 5, tempSwing: 3, pressSwing: 0 },
  'NODE-R07B-001': { humidity: 55, temperature: 12, pressure: null, humSwing: 5, tempSwing: 3, pressSwing: 0 },
  'NODE-R08-001': { humidity: 60, temperature: 27, pressure: null, humSwing: 5, tempSwing: 2, pressSwing: 0 },
};

export interface SimNodeState {
  humidity: number;
  temperature: number;
  pressure: number | null;
}

function initialSimState(): Record<string, SimNodeState> {
  const out: Record<string, SimNodeState> = {};
  for (const n of NODES) {
    const b = SIM_BASELINES[n.deviceId];
    out[n.deviceId] = { humidity: b.humidity, temperature: b.temperature, pressure: b.pressure };
  }
  return out;
}

const simState: Record<string, SimNodeState> = initialSimState();

let intervalId: ReturnType<typeof setInterval> | null = null;
let running = false;
let tickCount = 0;

interface Breach {
  deviceId: string;
  parameter: Parameter;
  direction: 1 | -1;
  untilTick: number;
}

let breach: Breach | null = null;

/**
 * Satu langkah random walk: tarik ke baseline + gelombang lambat + noise kecil.
 * Murni (noise di-inject) agar bisa diuji.
 */
export function stepSimValue(
  current: number,
  baseline: number,
  swing: number,
  tick: number,
  noise: () => number,
): number {
  const drift = (baseline - current) * 0.08;
  const wave = Math.sin(tick / 20) * swing * 0.05;
  const n = (noise() - 0.5) * swing * 0.2;
  return Math.round((current + drift + wave + n) * 10) / 10;
}

/** Dorong nilai keluar threshold (dipakai saat breach simulasi). Murni. */
export function applyBreach(
  value: number,
  parameter: Parameter,
  thresholds: ThresholdSet,
  direction: 1 | -1,
): number {
  const range = thresholds[parameter];
  if (!range) return value;
  const margin = parameter === 'temperature' ? 2 : parameter === 'humidity' ? 5 : 3;
  const target = direction > 0 ? range.max + margin : range.min - margin;
  // Bergerak 80% menuju target — keluar rentang dalam 1 tick, lalu pulih
  // perlahan saat breach berakhir (random walk menarik ke baseline).
  return Math.round((value + (target - value) * 0.8) * 10) / 10;
}

function maybeStartBreach(): void {
  if (breach) return;
  // Kira-kira tiap 3 menit (36 tick × 5 dtk), peluang 70%.
  if (tickCount > 0 && tickCount % 36 === 0 && Math.random() < 0.7) {
    const node = NODES[Math.floor(Math.random() * NODES.length)];
    const params = node.sensors;
    const parameter = params[Math.floor(Math.random() * params.length)];
    breach = {
      deviceId: node.deviceId,
      parameter,
      direction: Math.random() < 0.5 ? 1 : -1,
      untilTick: tickCount + 6, // ~30 detik
    };
    useIiotStore
      .getState()
      .addEvent(
        'info',
        `[SIM] Penyimpangan sengaja: ${node.deviceId} (${parameter}) keluar threshold — akan pulih otomatis`,
      );
  }
}

function buildRaw(node: NodeConfig, nowMs: number): Record<string, unknown> {
  const base = SIM_BASELINES[node.deviceId];
  const state = simState[node.deviceId];
  const thresholds = DEFAULT_THRESHOLDS[node.roomId];
  let temperature = stepSimValue(state.temperature, base.temperature, base.tempSwing, tickCount, Math.random);
  let humidity = stepSimValue(state.humidity, base.humidity, base.humSwing, tickCount, Math.random);
  let pressure: number | null = null;
  if (base.pressure !== null) {
    pressure = stepSimValue(state.pressure ?? base.pressure, base.pressure, base.pressSwing, tickCount, Math.random);
  }
  if (breach && breach.deviceId === node.deviceId) {
    if (breach.parameter === 'temperature') temperature = applyBreach(temperature, 'temperature', thresholds, breach.direction);
    if (breach.parameter === 'humidity') humidity = applyBreach(humidity, 'humidity', thresholds, breach.direction);
    if (breach.parameter === 'pressure' && pressure !== null) {
      pressure = applyBreach(pressure, 'pressure', thresholds, breach.direction);
    }
    if (tickCount >= breach.untilTick) breach = null;
  }
  simState[node.deviceId] = { humidity, temperature, pressure };
  const raw: Record<string, unknown> = {
    device_id: node.deviceId,
    room_id: node.roomId,
    timestamp: new Date(nowMs).toISOString(),
    humidity,
    temperature,
  };
  if (pressure !== null) {
    raw.pressure = pressure;
    raw.pressure_reference = 'R05';
  }
  return raw;
}

function tick(nowMs: number): void {
  tickCount++;
  maybeStartBreach();
  const store = useIiotStore.getState();
  for (const node of NODES) {
    const dev = store.devices[node.deviceId];
    if (!dev || !dev.enabled) continue; // perangkat disabled tidak memancarkan
    const v = validateTelemetry(buildRaw(node, nowMs), nowMs);
    if (v.ok) {
      store.applyTelemetry(v.value, nowMs);
    }
  }
}

let seedPromise: Promise<void> | null = null;

/**
 * Seed 120 menit histori sintetis (interval 1 menit) saat pertama load.
 * Hanya berjalan sekali (flag `seeded:v1` di IndexedDB + guard promise).
 * Nilai seed dijepit ke dalam threshold agar histori awal tidak memicu alert.
 */
export async function ensureSeededHistory(): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    const seeded = await db.getMeta('seeded:v1');
    if (seeded === '1') return;
    const count = await db.countReadings();
    if (count > 0) {
      await db.setMeta('seeded:v1', '1');
      return;
    }
    const now = Date.now();
    const store = useIiotStore.getState();
    const seedState = initialSimState();
    for (const node of NODES) {
      const base = SIM_BASELINES[node.deviceId];
      const thresholds = DEFAULT_THRESHOLDS[node.roomId];
      const st = seedState[node.deviceId];
      for (let m = SEED_HISTORY_MINUTES; m >= 1; m--) {
        const ts = now - m * 60_000;
        st.temperature = clampToThreshold(
          stepSimValue(st.temperature, base.temperature, base.tempSwing, m, Math.random),
          thresholds.temperature,
        );
        st.humidity = clampToThreshold(
          stepSimValue(st.humidity, base.humidity, base.humSwing, m, Math.random),
          thresholds.humidity,
        );
        if (base.pressure !== null) {
          st.pressure = clampToThreshold(
            stepSimValue(st.pressure ?? base.pressure, base.pressure, base.pressSwing, m, Math.random),
            thresholds.pressure,
          );
        }
        const raw: Record<string, unknown> = {
          device_id: node.deviceId,
          room_id: node.roomId,
          timestamp: new Date(ts).toISOString(),
          humidity: st.humidity,
          temperature: st.temperature,
        };
        if (st.pressure !== null) {
          raw.pressure = st.pressure;
          raw.pressure_reference = 'R05';
        }
        const v = validateTelemetry(raw, now);
        if (v.ok) store.applyTelemetry(v.value, ts);
      }
      simState[node.deviceId] = { ...st };
    }
    await db.setMeta('seeded:v1', '1');
    useIiotStore
      .getState()
      .addEvent('mode', `[SIM] Histori awal di-seed: ${SEED_HISTORY_MINUTES} menit × ${NODES.length} node (interval 1 menit)`);
  })();
  return seedPromise;
}

function clampToThreshold(
  value: number,
  range: { min: number; max: number } | undefined,
): number {
  if (!range) return value;
  if (value > range.max - 0.5) return Math.round((range.max - 0.5) * 10) / 10;
  if (value < range.min + 0.5) return Math.round((range.min + 0.5) * 10) / 10;
  return value;
}

export function startSimulation(): void {
  if (running) return;
  running = true;
  const store = useIiotStore.getState();
  store.markAllDevicesOnline();
  void ensureSeededHistory().then(() => {
    useIiotStore
      .getState()
      .addEvent('mode', 'Simulasi dimulai — data sintetis dipercepat (1 bacaan / 5 dtk), tidak ada publish ke broker');
  });
  tick(Date.now());
  intervalId = setInterval(() => tick(Date.now()), SIM_TICK_MS);
}

export function stopSimulation(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  running = false;
}
