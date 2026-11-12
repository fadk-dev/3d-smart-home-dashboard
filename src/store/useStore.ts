// Application store (Zustand) — SRS §4.5, §9.
// Satu-satunya pemilik state telemetri / perangkat / aktuator / koneksi / scene.
// UI dan scene 3D hanya membaca store ini; modul MQTT/sim hanya memanggil
// aksi store setelah payload lolos validasi. Tidak ada akses MQTT di sini.
import { create } from 'zustand';
import {
  DEFAULT_BROKER_URL,
  DEFAULT_COMMAND_TIMEOUT_MS,
  FRESHNESS_STALE_MS,
  HISTORY_CAPACITY,
} from '../config';
import type { AppMode, Availability, BrokerStatus, LampState } from '../config';
import { DEVICES, TELEMETRY_DEVICE } from '../config/devices';
import type { DeviceConfig } from '../config';
import {
  classifyFreshness,
  isNewerThan,
} from '../lib/validate';
import type {
  AvailabilityPayload,
  LampStatePayload,
  TelemetryPayload,
} from '../lib/validate';

export interface PendingCommand {
  requestId: string;
  targetState: LampState;
  issuedAt: number;
}

export type CommandOutcome = 'TIMEOUT' | 'DISCONNECTED' | null;

export interface DeviceRuntime {
  config: DeviceConfig;
  availability: Availability;
  availabilityReceivedAt: number | null;
  confirmedState: LampState | null;
  pending: PendingCommand | null;
  lastOutcome: CommandOutcome;
  lastStateSeq?: number;
  lastStateTs?: number;
  lastTelemetrySeq?: number;
  lastTelemetryTs?: number;
  lastAvailabilityTs?: number;
}

export interface TelemetrySnapshot {
  deviceId: string;
  temperatureC: number;
  humidityPct?: number;
  pressureHpa?: number;
  ts: number;
  receivedAt: number;
}

export interface HistoryPoint {
  t: number;
  temperatureC: number;
  humidityPct?: number;
}

export type EventKind =
  | 'command'
  | 'state'
  | 'telemetry'
  | 'connection'
  | 'availability'
  | 'validation'
  | 'mode'
  | 'info';

export interface LogEvent {
  id: number;
  ts: number;
  kind: EventKind;
  message: string;
}

export interface SceneSettings {
  autoRotate: boolean;
  shadows: boolean;
  quality: 'low' | 'high';
}

interface SmartHomeState {
  mode: AppMode;
  brokerStatus: BrokerStatus;
  brokerUrl: string;
  mqttUsername: string;
  mqttPassword: string;
  commandTimeoutMs: number;
  devices: Record<string, DeviceRuntime>;
  telemetry: TelemetrySnapshot | null;
  history: HistoryPoint[];
  events: LogEvent[];
  scene: SceneSettings;
  selectedDeviceId: string | null;
  hoveredDeviceId: string | null;

  setMode: (mode: AppMode) => void;
  setBrokerStatus: (status: BrokerStatus) => void;
  setBrokerUrl: (url: string) => void;
  setCredentials: (username: string, password: string) => void;
  setCommandTimeoutMs: (ms: number) => void;
  addEvent: (kind: EventKind, message: string) => void;
  applyTelemetry: (payload: TelemetryPayload, receivedAt: number) => void;
  applyLampState: (payload: LampStatePayload, receivedAt: number) => void;
  applyAvailability: (payload: AvailabilityPayload, receivedAt: number) => void;
  startPending: (deviceId: string, pending: PendingCommand) => void;
  markCommandTimeout: (deviceId: string, requestId: string) => void;
  clearPendingOnDisconnect: () => void;
  setScene: (patch: Partial<SceneSettings>) => void;
  setSelectedDeviceId: (deviceId: string | null) => void;
  setHoveredDeviceId: (deviceId: string | null) => void;
  /** Dipakai simulasi & reset: tandai semua perangkat ONLINE tanpa state lampu. */
  markAllDevicesOnline: () => void;
  resetTelemetry: () => void;
}

function initialDevices(): Record<string, DeviceRuntime> {
  const out: Record<string, DeviceRuntime> = {};
  for (const config of DEVICES) {
    out[config.deviceId] = {
      config,
      availability: 'UNKNOWN',
      availabilityReceivedAt: null,
      confirmedState: null,
      pending: null,
      lastOutcome: null,
    };
  }
  return out;
}

let eventSeq = 0;

const stored = (key: string): string => {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
};

export const useSmartHome = create<SmartHomeState>()((set, get) => ({
  mode: 'SIMULATION',
  brokerStatus: 'DISCONNECTED',
  brokerUrl: stored('smarthome.brokerUrl') || DEFAULT_BROKER_URL,
  mqttUsername: stored('smarthome.mqttUsername'),
  mqttPassword: stored('smarthome.mqttPassword'),
  commandTimeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
  devices: initialDevices(),
  telemetry: null,
  history: [],
  events: [],
  scene: { autoRotate: false, shadows: true, quality: 'high' },
  selectedDeviceId: null,
  hoveredDeviceId: null,

  setMode: (mode) => {
    set({ mode });
    get().addEvent('mode', `Mode diubah ke ${mode}`);
  },
  setBrokerStatus: (brokerStatus) => set({ brokerStatus }),
  setBrokerUrl: (brokerUrl) => {
    try {
      localStorage.setItem('smarthome.brokerUrl', brokerUrl);
    } catch {
      /* abaikan */
    }
    set({ brokerUrl });
  },
  setCredentials: (mqttUsername, mqttPassword) => {
    try {
      localStorage.setItem('smarthome.mqttUsername', mqttUsername);
      localStorage.setItem('smarthome.mqttPassword', mqttPassword);
    } catch {
      /* abaikan */
    }
    set({ mqttUsername, mqttPassword });
  },
  setCommandTimeoutMs: (commandTimeoutMs) => set({ commandTimeoutMs }),

  addEvent: (kind, message) =>
    set((s) => ({
      events: [
        { id: ++eventSeq, ts: Date.now(), kind, message },
        ...s.events,
      ].slice(0, 200),
    })),

  applyTelemetry: (payload, receivedAt) => {
    const s = get();
    const dev = s.devices[payload.deviceId];
    if (!dev) return; // deviceId di luar konteks — sudah ditolak validator, pertahanan lapis dua
    if (
      !isNewerThan(
        { lastSeq: dev.lastTelemetrySeq, lastTs: dev.lastTelemetryTs },
        { seq: payload.seq, ts: payload.ts },
      )
    ) {
      return; // duplikat / out-of-order: jangan regresi state (FR-17)
    }
    const snapshot: TelemetrySnapshot = {
      deviceId: payload.deviceId,
      temperatureC: payload.temperatureC,
      humidityPct: payload.humidityPct,
      pressureHpa: payload.pressureHpa,
      ts: payload.ts,
      receivedAt,
    };
    const point: HistoryPoint = {
      t: payload.ts,
      temperatureC: payload.temperatureC,
      humidityPct: payload.humidityPct,
    };
    set((st) => ({
      telemetry: snapshot,
      history: [...st.history, point].slice(-HISTORY_CAPACITY),
      devices: {
        ...st.devices,
        [payload.deviceId]: {
          ...dev,
          lastTelemetrySeq: payload.seq ?? dev.lastTelemetrySeq,
          lastTelemetryTs: payload.ts,
        },
      },
    }));
  },

  applyLampState: (payload, receivedAt) => {
    void receivedAt;
    const s = get();
    const dev = s.devices[payload.deviceId];
    if (!dev) return;
    if (
      !isNewerThan(
        { lastSeq: dev.lastStateSeq, lastTs: dev.lastStateTs },
        { seq: payload.seq, ts: payload.ts },
      )
    ) {
      return; // duplikat / out-of-order (AC-13)
    }
    const pending = dev.pending;
    // Reconciliation (§4.6): requestId cocok menyelesaikan pending. State tanpa
    // requestId tetap memperbarui confirmed; bila state-nya sama dengan target
    // pending, pending ikut selesai karena perangkat mengonfirmasi target itu.
    const resolvesPending =
      pending !== null &&
      (payload.requestId === pending.requestId ||
        (payload.requestId === undefined && payload.state === pending.targetState));
    set((st) => ({
      devices: {
        ...st.devices,
        [payload.deviceId]: {
          ...dev,
          confirmedState: payload.state,
          pending: resolvesPending ? null : dev.pending,
          lastOutcome: resolvesPending ? null : dev.lastOutcome,
          lastStateSeq: payload.seq ?? dev.lastStateSeq,
          lastStateTs: payload.ts,
        },
      },
    }));
    get().addEvent(
      'state',
      `${dev.config.roomName} (${payload.deviceId}): lampu ${payload.state}` +
        (payload.requestId ? ` — ${payload.requestId}` : ''),
    );
  },

  applyAvailability: (payload, receivedAt) => {
    const s = get();
    const dev = s.devices[payload.deviceId];
    if (!dev) return;
    if (
      dev.lastAvailabilityTs !== undefined &&
      payload.ts <= dev.lastAvailabilityTs
    ) {
      return; // duplikat / lebih lama
    }
    set((st) => ({
      devices: {
        ...st.devices,
        [payload.deviceId]: {
          ...dev,
          availability: payload.status === 'online' ? 'ONLINE' : 'OFFLINE',
          availabilityReceivedAt: receivedAt,
          lastAvailabilityTs: payload.ts,
        },
      },
    }));
    get().addEvent(
      'availability',
      `${dev.config.roomName} (${payload.deviceId}): ${payload.status}`,
    );
  },

  startPending: (deviceId, pending) => {
    const dev = get().devices[deviceId];
    if (!dev) return;
    set((st) => ({
      devices: {
        ...st.devices,
        [deviceId]: { ...dev, pending, lastOutcome: null },
      },
    }));
  },

  markCommandTimeout: (deviceId, requestId) => {
    const dev = get().devices[deviceId];
    if (!dev || dev.pending?.requestId !== requestId) return;
    set((st) => ({
      devices: {
        ...st.devices,
        [deviceId]: { ...dev, pending: null, lastOutcome: 'TIMEOUT' },
      },
    }));
    get().addEvent(
      'command',
      `${dev.config.roomName}: perintah ${requestId} TIMEOUT — state terakhir dipertahankan, perangkat tidak diklaim gagal`,
    );
  },

  clearPendingOnDisconnect: () => {
    const s = get();
    const next = { ...s.devices };
    let changed = false;
    for (const [id, dev] of Object.entries(next)) {
      if (dev.pending) {
        next[id] = { ...dev, pending: null, lastOutcome: 'DISCONNECTED' };
        changed = true;
      }
    }
    if (changed) {
      set({ devices: next });
      get().addEvent(
        'connection',
        'Perintah pending dibatalkan karena koneksi broker terputus (tidak dikirim ulang otomatis)',
      );
    }
  },

  setScene: (patch) => set((s) => ({ scene: { ...s.scene, ...patch } })),
  setSelectedDeviceId: (selectedDeviceId) => set({ selectedDeviceId }),
  setHoveredDeviceId: (hoveredDeviceId) => set({ hoveredDeviceId }),

  markAllDevicesOnline: () => {
    const now = Date.now();
    set((s) => {
      const next = { ...s.devices };
      for (const [id, dev] of Object.entries(next)) {
        next[id] = { ...dev, availability: 'ONLINE', availabilityReceivedAt: now };
      }
      return { devices: next };
    });
  },

  resetTelemetry: () => set({ telemetry: null, history: [] }),
}));

/** Availability efektif: ONLINE yang sudah >10 dtk tanpa pesan menjadi STALE (§4.4). */
export function effectiveAvailability(dev: DeviceRuntime, nowMs: number): Availability {
  if (dev.availability === 'ONLINE' && dev.availabilityReceivedAt !== null) {
    if (nowMs - dev.availabilityReceivedAt > FRESHNESS_STALE_MS) return 'STALE';
  }
  return dev.availability;
}

/** Freshness telemetri saat ini dari snapshot terakhir (SRS §9.5). */
export function telemetryFreshness(
  telemetry: TelemetrySnapshot | null,
  nowMs: number,
): 'CURRENT' | 'STALE' | 'UNAVAILABLE' {
  if (!telemetry) return 'UNAVAILABLE';
  return classifyFreshness(nowMs - telemetry.receivedAt);
}

/** Perangkat kanonis pembawa telemetri (SRS §6.2). */
export function telemetryDeviceId(): string {
  return TELEMETRY_DEVICE.deviceId;
}
