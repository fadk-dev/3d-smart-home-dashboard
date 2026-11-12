// Simulation Manager — SRS §4.1, §10.2, FR-18/19, AC-14.
// Terisolasi penuh dari jalur live: modul ini TIDAK PERNAH memanggil mqttService
// dan tidak pernah publish apa pun. Data sintetis ditandai [SIM] di event log
// dan mode SIMULATION selalu terlihat di status bar (NFR-14).
import { TELEMETRY_INTERVAL_MS } from '../config';
import { TELEMETRY_DEVICE } from '../config/devices';
import type { DeviceConfig } from '../config';
import { useSmartHome } from '../store/useStore';
import type { LampCommandPayload } from '../lib/validate';

let intervalId: ReturnType<typeof setInterval> | null = null;
let running = false;
let seq = 0;
const startedAt = Date.now();

/** Telemetri sintetis: suhu gelombang sinus ~27–29 °C, kelembapan ~60–70 %. */
export function syntheticTelemetry(nowMs: number): {
  temperatureC: number;
  humidityPct: number;
  pressureHpa: number;
} {
  const t = (nowMs - startedAt) / 1000;
  return {
    temperatureC: Math.round((28 + Math.sin(t / 30) * 1) * 10) / 10,
    humidityPct: Math.round((65 + Math.sin(t / 45) * 5) * 10) / 10,
    pressureHpa: Math.round((1008 + Math.sin(t / 120) * 1.5) * 10) / 10,
  };
}

export function startSimulation(): void {
  if (running) return;
  running = true;
  const store = useSmartHome.getState();
  store.markAllDevicesOnline();
  // State awal simulasi: semua lampu OFF (diterapkan sebagai state, bukan pending).
  const now = Date.now();
  for (const d of Object.values(store.devices)) {
    if (d.confirmedState === null) {
      store.applyLampState(
        {
          schemaVersion: '1.0',
          deviceId: d.config.deviceId,
          state: 'OFF',
          ts: now,
          seq: 0,
        },
        now,
      );
    }
  }
  store.addEvent('mode', 'Simulasi dimulai — data sintetis, tidak ada publish ke broker');
  intervalId = setInterval(() => {
    const at = Date.now();
    const s = syntheticTelemetry(at);
    useSmartHome.getState().applyTelemetry(
      {
        schemaVersion: '1.0',
        deviceId: TELEMETRY_DEVICE.deviceId,
        ts: at,
        seq: ++seq,
        temperatureC: s.temperatureC,
        humidityPct: s.humidityPct,
        pressureHpa: s.pressureHpa,
      },
      at,
    );
  }, TELEMETRY_INTERVAL_MS);
}

export function stopSimulation(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  running = false;
}

/**
 * Echo perintah simulasi: setelah latensi 300–800 ms, perangkat simulasi
 * melaporkan state yang sama dengan requestId perintah (SRS §4.3 langkah 7).
 */
export function simulateLampCommand(
  device: DeviceConfig,
  cmd: LampCommandPayload,
): void {
  const latency = 300 + Math.random() * 500;
  setTimeout(() => {
    useSmartHome.getState().applyLampState(
      {
        schemaVersion: '1.0',
        deviceId: device.deviceId,
        requestId: cmd.requestId,
        state: cmd.targetState,
        ts: Date.now(),
      },
      Date.now(),
    );
  }, latency);
}
