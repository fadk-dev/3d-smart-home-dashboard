// Application store (Zustand) — SRS IIoT Catering v1.1 §7, FR-03/05/06/07/08.
// Satu-satunya pemilik state live: bacaan per ruangan, perangkat, threshold,
// alert, event log, koneksi, peran, scene. UI dan scene 3D hanya membaca
// store ini; modul MQTT/sim hanya memanggil aksi store setelah payload lolos
// validasi. Setiap bacaan valid juga ditulis ke IndexedDB (src/lib/db.ts).
// Tidak ada akses MQTT di sini.
import { create } from 'zustand';
import {
  DEFAULT_BROKER_URL,
  FRESHNESS_STALE_MS,
  HISTORY_CAPACITY,
  INVALID_LOG_THROTTLE_MS,
  TELEMETRY_LOG_THROTTLE_MS,
  offlineTimeoutMs,
} from '../config';
import type {
  AlertStatus,
  AppMode,
  BrokerStatus,
  DeviceStatus,
  Freshness,
  Parameter,
  RoomId,
  UserRole,
} from '../config';
import { DEFAULT_THRESHOLDS, NODES, ROOMS, nodesForRoom } from '../config/devices';
import type { NodeConfig, ThresholdSet } from '../config/devices';
import { classifyFreshness, isNewerThan } from '../lib/validate';
import type { TelemetryPayload } from '../lib/validate';
import { db } from '../lib/db';
import type { AlertRecord } from '../lib/db';
import {
  alertKey,
  evaluateReading,
  invalidAlertKey,
  offlineAlertKey,
} from '../mqtt/commandService';
import type { AlertType } from '../mqtt/commandService';

export interface HistoryPoint {
  t: number;
  humidity: number | null;
  temperature: number | null;
  pressure: number | null;
}

export interface RoomRuntime {
  roomId: RoomId;
  latest: TelemetryPayload | null;
  latestDeviceId: string | null;
  receivedAt: number | null;
  history: HistoryPoint[];
}

export interface DeviceRuntime {
  config: NodeConfig;
  enabled: boolean;
  /** Status tersimpan (ONLINE/OFFLINE); DISABLED/STALE diturunkan (lihat helper). */
  status: 'ONLINE' | 'OFFLINE';
  lastSeen: number | null;
  lastTs?: number;
  /** Bacaan valid terakhir perangkat ini (untuk ruangan 2 node seperti R07). */
  lastReading: TelemetryPayload | null;
  lastInvalidAt: number | null;
  invalidCount: number;
  lastTelemetryLogAt: number | null;
}

export interface Alert {
  id: string;
  /** Kunci dedup: satu alert aktif per (ruangan, parameter, tipe) / per perangkat. */
  key: string;
  createdAt: number;
  roomId: RoomId;
  deviceId: string;
  parameter: Parameter | 'device';
  actualValue: number | null;
  thresholdValue: number | null;
  alertType: string;
  status: AlertStatus;
  resolvedAt: number | null;
}

export type EventKind =
  | 'telemetry'
  | 'connection'
  | 'alert'
  | 'validation'
  | 'mode'
  | 'device'
  | 'info'
  | 'threshold';

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
  /** Tinggi tembok 3D (m) — default rendah 1,2 m gaya dollhouse agar isi ruangan terlihat. */
  wallHeight: number;
  /** Opasitas tembok 3D (0,1–1) — default 0,45 semi-transparan. */
  wallOpacity: number;
  /** Tampilkan/sembunyikan semua label marker (nama ruangan, ID node, penanda utara). */
  showLabels: boolean;
}

export type RoomStatus = 'NORMAL' | 'WARNING' | 'OFFLINE' | 'NO_DATA';

interface IiotState {
  mode: AppMode;
  role: UserRole;
  brokerStatus: BrokerStatus;
  brokerUrl: string;
  mqttUsername: string;
  mqttPassword: string;
  bootAt: number;
  rooms: Record<RoomId, RoomRuntime>;
  devices: Record<string, DeviceRuntime>;
  thresholds: Record<RoomId, ThresholdSet>;
  alerts: Alert[];
  events: LogEvent[];
  invalidThrottle: Record<string, number>;
  scene: SceneSettings;
  selectedRoomId: RoomId;
  dbReady: boolean;

  setMode: (mode: AppMode) => void;
  setRole: (role: UserRole) => void;
  setBrokerStatus: (status: BrokerStatus) => void;
  setBrokerUrl: (url: string) => void;
  setCredentials: (username: string, password: string) => void;
  addEvent: (kind: EventKind, message: string) => void;
  applyTelemetry: (payload: TelemetryPayload, receivedAt: number) => void;
  recordInvalid: (deviceId: string, reason: string, nowMs?: number) => void;
  checkOffline: (nowMs: number) => void;
  setDeviceEnabled: (deviceId: string, enabled: boolean) => void;
  setThreshold: (roomId: RoomId, parameter: Parameter, min: number, max: number) => boolean;
  acknowledgeAlert: (id: string) => void;
  resolveAlert: (id: string) => void;
  markAllDevicesOnline: () => void;
  restoreFromDb: () => Promise<void>;
  setScene: (patch: Partial<SceneSettings>) => void;
  setSelectedRoomId: (roomId: RoomId) => void;
}

function initialRooms(): Record<RoomId, RoomRuntime> {
  const out = {} as Record<RoomId, RoomRuntime>;
  for (const r of ROOMS) {
    out[r.id] = { roomId: r.id, latest: null, latestDeviceId: null, receivedAt: null, history: [] };
  }
  return out;
}

function initialDevices(): Record<string, DeviceRuntime> {
  const out: Record<string, DeviceRuntime> = {};
  for (const n of NODES) {
    out[n.deviceId] = {
      config: n,
      enabled: true,
      status: 'OFFLINE',
      lastSeen: null,
      lastTs: undefined,
      lastReading: null,
      lastInvalidAt: null,
      invalidCount: 0,
      lastTelemetryLogAt: null,
    };
  }
  return out;
}

let eventSeq = 0;
let alertSeq = 0;

function stored(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function storeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* abaikan */
  }
}

function alertToRecord(a: Alert): AlertRecord {
  return {
    id: a.id,
    roomId: a.roomId,
    deviceId: a.deviceId,
    parameter: a.parameter,
    actualValue: a.actualValue,
    thresholdValue: a.thresholdValue,
    alertType: a.alertType,
    status: a.status,
    createdAt: a.createdAt,
    resolvedAt: a.resolvedAt,
  };
}

function dedupKeyFromRecord(r: AlertRecord): string {
  if (r.parameter === 'device') return `${r.deviceId}|device|${r.alertType}`;
  return `${r.roomId}|${r.parameter}|${r.alertType}`;
}

function persistAlert(a: Alert): void {
  void db.saveAlert(alertToRecord(a)).catch(() => {});
}

export const useIiotStore = create<IiotState>()((set, get) => ({
  mode: 'SIMULATION',
  role: stored('iiot.role') === 'OPERATOR' ? 'OPERATOR' : 'ADMIN',
  brokerStatus: 'DISCONNECTED',
  brokerUrl: stored('iiot.brokerUrl') || DEFAULT_BROKER_URL,
  mqttUsername: stored('iiot.mqttUsername'),
  mqttPassword: stored('iiot.mqttPassword'),
  bootAt: Date.now(),
  rooms: initialRooms(),
  devices: initialDevices(),
  thresholds: structuredClone(DEFAULT_THRESHOLDS),
  alerts: [],
  events: [],
  invalidThrottle: {},
  scene: { autoRotate: false, shadows: true, quality: 'high', wallHeight: 1.2, wallOpacity: 0.45, showLabels: true },
  selectedRoomId: 'R01',
  dbReady: false,

  setMode: (mode) => {
    set({ mode });
    get().addEvent('mode', `Mode diubah ke ${mode}`);
  },
  setRole: (role) => {
    storeString('iiot.role', role);
    set({ role });
    get().addEvent('mode', `Peran UI diubah ke ${role === 'ADMIN' ? 'Administrator' : 'Operator Produksi'}`);
  },
  setBrokerStatus: (brokerStatus) => set({ brokerStatus }),
  setBrokerUrl: (brokerUrl) => {
    storeString('iiot.brokerUrl', brokerUrl);
    set({ brokerUrl });
  },
  setCredentials: (mqttUsername, mqttPassword) => {
    storeString('iiot.mqttUsername', mqttUsername);
    storeString('iiot.mqttPassword', mqttPassword);
    set({ mqttUsername, mqttPassword });
  },

  addEvent: (kind, message) =>
    set((s) => ({
      events: [{ id: ++eventSeq, ts: Date.now(), kind, message }, ...s.events].slice(0, 200),
    })),

  applyTelemetry: (payload, receivedAt) => {
    const s = get();
    const dev = s.devices[payload.deviceId];
    if (!dev || !dev.enabled) return; // perangkat disabled: abaikan
    if (!isNewerThan({ lastTs: dev.lastTs }, { ts: payload.ts })) {
      return; // duplikat / out-of-order: jangan regresi state
    }
    const room = s.rooms[payload.roomId];
    const point: HistoryPoint = {
      t: payload.ts,
      humidity: payload.humidity,
      temperature: payload.temperature,
      pressure: payload.pressure,
    };

    // --- Evaluasi threshold → alert baru / auto-resolve (FR-07) ---
    const breaches = evaluateReading(
      { humidity: payload.humidity, temperature: payload.temperature, pressure: payload.pressure },
      s.thresholds[payload.roomId],
    );
    const breachParams = new Set<Parameter>(breaches.map((b) => b.parameter));
    let nextAlerts = s.alerts;
    const created: Alert[] = [];
    for (const b of breaches) {
      const key = alertKey(payload.roomId, b.parameter, b.alertType);
      if (!nextAlerts.some((a) => a.key === key && a.status !== 'Resolved')) {
        const alert: Alert = {
          id: `alert-${receivedAt}-${++alertSeq}`,
          key,
          createdAt: receivedAt,
          roomId: payload.roomId,
          deviceId: payload.deviceId,
          parameter: b.parameter,
          actualValue: b.actualValue,
          thresholdValue: b.thresholdValue,
          alertType: b.alertType,
          status: 'Active',
          resolvedAt: null,
        };
        nextAlerts = [...nextAlerts, alert];
        created.push(alert);
      }
    }
    const inRangeParams: Parameter[] = (['humidity', 'temperature', 'pressure'] as Parameter[]).filter(
      (p) => {
        const v =
          p === 'humidity' ? payload.humidity : p === 'temperature' ? payload.temperature : payload.pressure;
        return v !== null && !breachParams.has(p);
      },
    );
    const wasOffline = dev.status === 'OFFLINE';
    const resolved: Alert[] = [];
    nextAlerts = nextAlerts.map((a) => {
      const resolveParam =
        a.status !== 'Resolved' &&
        a.roomId === payload.roomId &&
        a.parameter !== 'device' &&
        inRangeParams.includes(a.parameter);
      const resolveInvalid =
        a.status !== 'Resolved' &&
        a.deviceId === payload.deviceId &&
        a.alertType === 'Invalid Sensor Data';
      const resolveOffline =
        a.status !== 'Resolved' && wasOffline && a.deviceId === payload.deviceId && a.alertType === 'Device Offline';
      if (resolveParam || resolveInvalid || resolveOffline) {
        const r: Alert = { ...a, status: 'Resolved', resolvedAt: receivedAt };
        resolved.push(r);
        return r;
      }
      return a;
    });

    const shouldLogTelemetry =
      dev.lastTelemetryLogAt === null || receivedAt - dev.lastTelemetryLogAt > TELEMETRY_LOG_THROTTLE_MS;

    set((st) => ({
      rooms: {
        ...st.rooms,
        [payload.roomId]: {
          ...room,
          latest: payload,
          latestDeviceId: payload.deviceId,
          receivedAt,
          history: [...room.history, point].slice(-HISTORY_CAPACITY),
        },
      },
      devices: {
        ...st.devices,
        [payload.deviceId]: {
          ...dev,
          status: 'ONLINE',
          lastSeen: payload.ts,
          lastTs: payload.ts,
          lastReading: payload,
          lastTelemetryLogAt: shouldLogTelemetry ? receivedAt : dev.lastTelemetryLogAt,
        },
      },
      alerts: nextAlerts,
    }));

    for (const a of [...created, ...resolved]) persistAlert(a);
    for (const a of created) {
      get().addEvent(
        'alert',
        `Alert: ${a.alertType} — ${a.roomId} (${a.deviceId}): ${a.actualValue} (batas ${a.thresholdValue})`,
      );
    }
    for (const a of resolved) {
      get().addEvent('alert', `Alert ter-resolve otomatis: ${a.alertType} — ${a.roomId} (${a.deviceId})`);
    }
    if (wasOffline) {
      get().addEvent('device', `${payload.deviceId} kembali ONLINE setelah menerima bacaan`);
    }
    if (shouldLogTelemetry) {
      get().addEvent(
        'telemetry',
        `[SIM/ringkasan] ${payload.deviceId}: Hum ${payload.humidity.toFixed(1)} %RH, Temp ${payload.temperature.toFixed(1)} °C` +
          (payload.pressure !== null ? `, ΔP ${payload.pressure.toFixed(1)} Pa` : ''),
      );
    }

    // Persistensi ke IndexedDB (fire-and-forget; kegagalan tidak menggagalkan live state).
    void db
      .saveReading({
        id: `${payload.deviceId}:${payload.ts}`,
        deviceId: payload.deviceId,
        roomId: payload.roomId,
        ts: payload.ts,
        humidity: payload.humidity,
        temperature: payload.temperature,
        pressure: payload.pressure,
        pressureReference: payload.pressureReference,
        dataStatus: 'VALID',
      })
      .catch(() => {});
  },

  recordInvalid: (deviceId, reason, nowMs = Date.now()) => {
    const s = get();
    const last = s.invalidThrottle[deviceId] ?? 0;
    if (nowMs - last < INVALID_LOG_THROTTLE_MS) return; // throttle: maks 1 per menit
    const dev = s.devices[deviceId];
    set((st) => ({
      invalidThrottle: { ...st.invalidThrottle, [deviceId]: nowMs },
      devices: dev
        ? {
            ...st.devices,
            [deviceId]: {
              ...dev,
              invalidCount: dev.invalidCount + 1,
              lastInvalidAt: nowMs,
            },
          }
        : st.devices,
    }));
    get().addEvent('validation', `Data invalid ditolak (${deviceId}): ${reason}`);
    if (!dev) return;
    const key = invalidAlertKey(deviceId);
    if (get().alerts.some((a) => a.key === key && a.status !== 'Resolved')) return;
    const alert: Alert = {
      id: `alert-${nowMs}-${++alertSeq}`,
      key,
      createdAt: nowMs,
      roomId: dev.config.roomId,
      deviceId,
      parameter: 'device',
      actualValue: null,
      thresholdValue: null,
      alertType: 'Invalid Sensor Data',
      status: 'Active',
      resolvedAt: null,
    };
    set((st) => ({ alerts: [...st.alerts, alert] }));
    persistAlert(alert);
    get().addEvent('alert', `Alert: Invalid Sensor Data — ${dev.config.roomId} (${deviceId})`);
  },

  checkOffline: (nowMs) => {
    const s = get();
    const timeout = offlineTimeoutMs(s.mode);
    let nextDevices = s.devices;
    let nextAlerts = s.alerts;
    let changed = false;
    const wentOffline: string[] = [];
    for (const [id, dev] of Object.entries(s.devices)) {
      if (!dev.enabled || dev.status === 'OFFLINE') continue;
      const isOffline =
        dev.lastSeen === null ? nowMs - s.bootAt > timeout : nowMs - dev.lastSeen > timeout;
      if (!isOffline) continue;
      changed = true;
      nextDevices = { ...nextDevices, [id]: { ...dev, status: 'OFFLINE' } };
      const key = offlineAlertKey(id);
      if (!nextAlerts.some((a) => a.key === key && a.status !== 'Resolved')) {
        const alert: Alert = {
          id: `alert-${nowMs}-${++alertSeq}`,
          key,
          createdAt: nowMs,
          roomId: dev.config.roomId,
          deviceId: id,
          parameter: 'device',
          actualValue: null,
          thresholdValue: null,
          alertType: 'Device Offline',
          status: 'Active',
          resolvedAt: null,
        };
        nextAlerts = [...nextAlerts, alert];
        persistAlert(alert);
      }
      wentOffline.push(id);
    }
    if (!changed) return;
    set({ devices: nextDevices, alerts: nextAlerts });
    for (const id of wentOffline) {
      get().addEvent(
        'device',
        `${id}: OFFLINE — tidak ada bacaan > ${Math.round(timeout / 1000)} dtk`,
      );
    }
  },

  setDeviceEnabled: (deviceId, enabled) => {
    const s = get();
    const dev = s.devices[deviceId];
    if (!dev || dev.enabled === enabled) return;
    const now = Date.now();
    let nextAlerts = s.alerts;
    if (!enabled) {
      // Disabled ≠ offline: resolve alert offline yang masih aktif.
      const justResolved: Alert[] = [];
      nextAlerts = nextAlerts.map((a) => {
        if (a.deviceId === deviceId && a.alertType === 'Device Offline' && a.status !== 'Resolved') {
          const r: Alert = { ...a, status: 'Resolved', resolvedAt: now };
          justResolved.push(r);
          return r;
        }
        return a;
      });
      for (const a of justResolved) persistAlert(a);
    }
    const status: 'ONLINE' | 'OFFLINE' = enabled
      ? dev.lastSeen !== null && now - dev.lastSeen <= offlineTimeoutMs(s.mode)
        ? 'ONLINE'
        : 'OFFLINE'
      : dev.status;
    set({
      devices: { ...s.devices, [deviceId]: { ...dev, enabled, status } },
      alerts: nextAlerts,
    });
    void db
      .saveDevice({ deviceId, roomId: dev.config.roomId, enabled, updatedAt: now })
      .catch(() => {});
    get().addEvent(
      'device',
      `${deviceId} ${enabled ? 'diaktifkan' : 'dinonaktifkan'} (oleh ${s.role === 'ADMIN' ? 'Administrator' : 'Operator Produksi'})`,
    );
  },

  setThreshold: (roomId, parameter, min, max) => {
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return false;
    const s = get();
    const range = s.thresholds[roomId]?.[parameter];
    if (!range) return false;
    const next = { ...s.thresholds[roomId], [parameter]: { min, max, unit: range.unit } };
    set({ thresholds: { ...s.thresholds, [roomId]: next } });
    void db
      .saveThreshold({
        key: `${roomId}:${parameter}`,
        roomId,
        parameter,
        min,
        max,
        unit: range.unit,
        updatedAt: Date.now(),
      })
      .catch(() => {});
    get().addEvent('threshold', `Threshold ${roomId} ${parameter} diubah: ${min}–${max} ${range.unit}`);
    return true;
  },

  acknowledgeAlert: (id) => {
    const s = get();
    const a = s.alerts.find((x) => x.id === id);
    if (!a || a.status !== 'Active') return;
    const next: Alert = { ...a, status: 'Acknowledged' };
    set({ alerts: s.alerts.map((x) => (x.id === id ? next : x)) });
    persistAlert(next);
  },

  resolveAlert: (id) => {
    const s = get();
    const a = s.alerts.find((x) => x.id === id);
    if (!a || a.status === 'Resolved') return;
    const next: Alert = { ...a, status: 'Resolved', resolvedAt: Date.now() };
    set({ alerts: s.alerts.map((x) => (x.id === id ? next : x)) });
    persistAlert(next);
    get().addEvent('alert', `Alert di-resolve manual: ${a.alertType} — ${a.roomId} (${a.deviceId})`);
  },

  markAllDevicesOnline: () => {
    set((s) => {
      const next = { ...s.devices };
      for (const [id, dev] of Object.entries(next)) {
        if (dev.enabled) next[id] = { ...dev, status: 'ONLINE' };
      }
      return { devices: next };
    });
  },

  restoreFromDb: async () => {
    try {
      const [thresholdRecords, deviceRecords, alertRecords, readings] = await Promise.all([
        db.getThresholds(),
        db.getDevices(),
        db.getAlerts(),
        db.getReadings(null, Date.now() - 2 * 60 * 60 * 1000, Date.now(), 5000),
      ]);
      const s = get();
      const thresholds = { ...s.thresholds };
      for (const t of thresholdRecords) {
        const roomId = t.roomId as RoomId;
        const param = t.parameter as Parameter;
        if (!thresholds[roomId] || !thresholds[roomId][param]) continue;
        thresholds[roomId] = {
          ...thresholds[roomId],
          [param]: { min: t.min, max: t.max, unit: t.unit },
        };
      }
      const devices = { ...s.devices };
      const now = Date.now();
      const timeout = offlineTimeoutMs(s.mode);
      for (const d of deviceRecords) {
        const dev = devices[d.deviceId];
        if (dev) devices[d.deviceId] = { ...dev, enabled: d.enabled };
      }
      const alerts: Alert[] = alertRecords
        .map((r) => ({
          ...r,
          roomId: r.roomId as RoomId,
          key: dedupKeyFromRecord(r),
          parameter: r.parameter as Parameter | 'device',
        }))
        .sort((a, b) => b.createdAt - a.createdAt);
      const active = alerts.filter((a) => a.status !== 'Resolved');
      const resolved = alerts.filter((a) => a.status === 'Resolved').slice(0, 50);

      const rooms = { ...s.rooms };
      const byRoom = new Map<RoomId, HistoryPoint[]>();
      const latestByRoom = new Map<RoomId, TelemetryPayload>();
      const latestByDevice = new Map<string, TelemetryPayload>();
      const seenByDevice = new Map<string, number>();
      for (const r of readings) {
        const roomId = r.roomId as RoomId;
        const arr = byRoom.get(roomId) ?? [];
        arr.push({ t: r.ts, humidity: r.humidity, temperature: r.temperature, pressure: r.pressure });
        byRoom.set(roomId, arr);
        const cur = seenByDevice.get(r.deviceId);
        if (cur === undefined || r.ts > cur) seenByDevice.set(r.deviceId, r.ts);
        const readingPayload: TelemetryPayload = {
          deviceId: r.deviceId,
          roomId,
          ts: r.ts,
          timestamp: new Date(r.ts).toISOString(),
          humidity: r.humidity ?? 0,
          temperature: r.temperature ?? 0,
          pressure: r.pressure,
          pressureReference: r.pressureReference,
        };
        const curLatest = latestByRoom.get(roomId);
        if (!curLatest || r.ts > curLatest.ts) {
          latestByRoom.set(roomId, readingPayload);
        }
        const curDevice = latestByDevice.get(r.deviceId);
        if (!curDevice || r.ts > curDevice.ts) {
          latestByDevice.set(r.deviceId, readingPayload);
        }
      }
      for (const [roomId, points] of byRoom) {
        const sorted = [...points].sort((a, b) => a.t - b.t).slice(-HISTORY_CAPACITY);
        const latest = latestByRoom.get(roomId) ?? null;
        rooms[roomId] = {
          ...rooms[roomId],
          history: sorted,
          latest,
          latestDeviceId: latest?.deviceId ?? null,
          receivedAt: latest?.ts ?? null,
        };
      }
      for (const [deviceId, lastTs] of seenByDevice) {
        const dev = devices[deviceId];
        if (!dev) continue;
        devices[deviceId] = {
          ...dev,
          lastSeen: lastTs,
          lastTs,
          lastReading: latestByDevice.get(deviceId) ?? dev.lastReading,
          status: now - lastTs <= timeout ? 'ONLINE' : 'OFFLINE',
        };
      }
      set({ thresholds, devices, alerts: [...active, ...resolved], rooms, dbReady: true });
    } catch {
      // IndexedDB gagal (mis. mode privat) — lanjut dengan default; data live tetap jalan.
      set({ dbReady: true });
    }
  },

  setScene: (patch) => set((s) => ({ scene: { ...s.scene, ...patch } })),
  setSelectedRoomId: (selectedRoomId) => set({ selectedRoomId }),
}));

/** Status perangkat efektif: DISABLED bila dimatikan; STALE bila bacaan terakhir sudah lama. */
export function effectiveDeviceStatus(dev: DeviceRuntime, nowMs: number): DeviceStatus {
  if (!dev.enabled) return 'DISABLED';
  if (dev.status === 'OFFLINE') return 'OFFLINE';
  if (dev.lastSeen === null) return 'STALE';
  if (nowMs - dev.lastSeen > FRESHNESS_STALE_MS) return 'STALE';
  return 'ONLINE';
}

/** Freshness bacaan terakhir sebuah ruangan. */
export function roomFreshness(room: RoomRuntime, nowMs: number): Freshness {
  if (!room.receivedAt) return 'UNAVAILABLE';
  return classifyFreshness(nowMs - room.receivedAt);
}

export interface RoomStatusInput {
  rooms: Record<RoomId, RoomRuntime>;
  devices: Record<string, DeviceRuntime>;
  alerts: Alert[];
}

/** Status ruangan untuk pewarnaan lantai 3D & kartu. */
export function computeRoomStatus(
  roomId: RoomId,
  state: RoomStatusInput,
  nowMs: number,
): RoomStatus {
  const room = state.rooms[roomId];
  const nodes = nodesForRoom(roomId);
  const anyOffline = nodes.some(
    (n) => effectiveDeviceStatus(state.devices[n.deviceId], nowMs) === 'OFFLINE',
  );
  if (anyOffline) return 'OFFLINE';
  if (!room.latest) return 'NO_DATA';
  const hasActiveAlert = state.alerts.some(
    (a) => a.roomId === roomId && a.status !== 'Resolved',
  );
  if (hasActiveAlert) return 'WARNING';
  return 'NORMAL';
}

/** Jumlah alert aktif (badge top bar). */
export function activeAlertCount(alerts: Alert[]): number {
  return alerts.filter((a) => a.status === 'Active').length;
}

export type { AlertType };
