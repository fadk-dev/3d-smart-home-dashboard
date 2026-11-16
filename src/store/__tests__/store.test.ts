// Unit test store — SRS §7, FR-03/06/07/08, AC-06/09/10.
// Store adalah singleton Zustand; setiap test mereset state lewat setState.
import { beforeEach, describe, expect, it } from 'vitest';
import { HISTORY_CAPACITY } from '../../config';
import { DEFAULT_THRESHOLDS, NODES, ROOMS } from '../../config/devices';
import type { RoomId } from '../../config';
import { effectiveDeviceStatus, useIiotStore } from '../useStore';
import type { DeviceRuntime, RoomRuntime } from '../useStore';
import type { TelemetryPayload } from '../../lib/validate';

const NOW = 1_794_480_000_000;

function freshDevices(): Record<string, DeviceRuntime> {
  const out: Record<string, DeviceRuntime> = {};
  for (const config of NODES) {
    out[config.deviceId] = {
      config,
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

function freshRooms(): Record<RoomId, RoomRuntime> {
  const out = {} as Record<RoomId, RoomRuntime>;
  for (const r of ROOMS) {
    out[r.id] = { roomId: r.id, latest: null, latestDeviceId: null, receivedAt: null, history: [] };
  }
  return out;
}

function resetStore(): void {
  useIiotStore.setState({
    mode: 'SIMULATION',
    brokerStatus: 'DISCONNECTED',
    bootAt: NOW - 1_000_000,
    rooms: freshRooms(),
    devices: freshDevices(),
    thresholds: structuredClone(DEFAULT_THRESHOLDS),
    alerts: [],
    events: [],
    invalidThrottle: {},
  });
}

function payload(over: Partial<TelemetryPayload> = {}): TelemetryPayload {
  return {
    deviceId: 'NODE-R06-001',
    roomId: 'R06',
    ts: NOW,
    timestamp: '2026-11-12T10:40:00Z',
    humidity: 60,
    temperature: 23,
    pressure: 8,
    pressureReference: 'R05',
    ...over,
  };
}

beforeEach(() => {
  resetStore();
});

describe('applyTelemetry', () => {
  it('menyimpan latest + menambah histori (maks HISTORY_CAPACITY)', () => {
    const store = useIiotStore.getState();
    for (let i = 0; i < HISTORY_CAPACITY + 5; i++) {
      useIiotStore.getState().applyTelemetry(payload({ ts: NOW + i * 5000 }), NOW + i * 5000);
    }
    const after = useIiotStore.getState();
    expect(after.rooms.R06.history.length).toBe(HISTORY_CAPACITY);
    expect(after.rooms.R06.latest?.temperature).toBe(23);
    expect(after.rooms.R06.latest?.ts).toBe(NOW + (HISTORY_CAPACITY + 4) * 5000);
    expect(after.devices['NODE-R06-001'].lastSeen).toBe(NOW + (HISTORY_CAPACITY + 4) * 5000);
    expect(store).toBeDefined();
  });

  it('telemetri duplikat / lebih lama tidak mengubah state', () => {
    const store = useIiotStore.getState();
    store.applyTelemetry(payload({ temperature: 23 }), NOW);
    store.applyTelemetry(payload({ temperature: 99 }), NOW); // duplikat ts
    expect(useIiotStore.getState().rooms.R06.latest?.temperature).toBe(23);
    expect(useIiotStore.getState().rooms.R06.history.length).toBe(1);
    store.applyTelemetry(payload({ ts: NOW - 1000, temperature: 20 }), NOW);
    expect(useIiotStore.getState().rooms.R06.latest?.temperature).toBe(23);
  });

  it('bacaan dari perangkat disabled diabaikan', () => {
    const store = useIiotStore.getState();
    store.setDeviceEnabled('NODE-R06-001', false);
    store.applyTelemetry(payload(), NOW);
    expect(useIiotStore.getState().rooms.R06.latest).toBeNull();
  });

  it('R07A dan R07B adalah ruangan terpisah, masing-masing satu node', () => {
    const store = useIiotStore.getState();
    store.applyTelemetry(payload({ deviceId: 'NODE-R07A-001', roomId: 'R07A', pressure: null }), NOW);
    store.applyTelemetry(
      payload({ deviceId: 'NODE-R07B-001', roomId: 'R07B', pressure: null, ts: NOW + 5000, temperature: 14 }),
      NOW + 5000,
    );
    const a = useIiotStore.getState().rooms.R07A;
    const b = useIiotStore.getState().rooms.R07B;
    expect(a.history.length).toBe(1);
    expect(a.latestDeviceId).toBe('NODE-R07A-001');
    expect(b.history.length).toBe(1);
    expect(b.latestDeviceId).toBe('NODE-R07B-001');
    expect(b.latest?.temperature).toBe(14);
  });
});

describe('alert — dedup & auto-resolve (FR-07)', () => {
  it('pelanggaran berulang TIDAK membuat alert duplikat', () => {
    const store = useIiotStore.getState();
    store.applyTelemetry(payload({ pressure: 20 }), NOW); // Pressure High (max 15)
    store.applyTelemetry(payload({ pressure: 21, ts: NOW + 5000 }), NOW + 5000);
    store.applyTelemetry(payload({ pressure: 22, ts: NOW + 10_000 }), NOW + 10_000);
    const alerts = useIiotStore.getState().alerts;
    expect(alerts.filter((a) => a.alertType === 'Pressure High')).toHaveLength(1);
    expect(alerts[0].status).toBe('Active');
    expect(alerts[0].actualValue).toBe(20); // nilai pertama yang memicu
  });

  it('nilai kembali normal → alert auto-resolve', () => {
    const store = useIiotStore.getState();
    store.applyTelemetry(payload({ pressure: 20 }), NOW);
    expect(useIiotStore.getState().alerts).toHaveLength(1);
    store.applyTelemetry(payload({ pressure: 8, ts: NOW + 5000 }), NOW + 5000);
    const alerts = useIiotStore.getState().alerts;
    expect(alerts).toHaveLength(1);
    expect(alerts[0].status).toBe('Resolved');
    expect(alerts[0].resolvedAt).toBe(NOW + 5000);
  });

  it('parameter berbeda → alert berbeda; yang normal ter-resolve sendiri', () => {
    const store = useIiotStore.getState();
    store.applyTelemetry(payload({ humidity: 90, temperature: 30 }), NOW);
    expect(useIiotStore.getState().alerts).toHaveLength(2);
    store.applyTelemetry(payload({ humidity: 60, temperature: 30, ts: NOW + 5000 }), NOW + 5000);
    const alerts = useIiotStore.getState().alerts;
    expect(alerts.find((a) => a.alertType === 'Humidity High')?.status).toBe('Resolved');
    expect(alerts.find((a) => a.alertType === 'Temperature High')?.status).toBe('Active');
  });

  it('acknowledge & resolve manual mengubah status', () => {
    const store = useIiotStore.getState();
    store.applyTelemetry(payload({ pressure: 20 }), NOW);
    const id = useIiotStore.getState().alerts[0].id;
    store.acknowledgeAlert(id);
    expect(useIiotStore.getState().alerts[0].status).toBe('Acknowledged');
    store.resolveAlert(id);
    expect(useIiotStore.getState().alerts[0].status).toBe('Resolved');
  });
});

describe('device offline (AC-10)', () => {
  it('tanpa bacaan > 30 dtk (SIM) → OFFLINE + alert Device Offline', () => {
    const store = useIiotStore.getState();
    store.applyTelemetry(payload(), NOW);
    store.checkOffline(NOW + 31_000);
    const dev = useIiotStore.getState().devices['NODE-R06-001'];
    expect(dev.status).toBe('OFFLINE');
    expect(
      useIiotStore.getState().alerts.some((a) => a.alertType === 'Device Offline'),
    ).toBe(true);
  });

  it('checkOffline berulang tidak menduplikasi alert offline', () => {
    const store = useIiotStore.getState();
    store.applyTelemetry(payload(), NOW);
    store.checkOffline(NOW + 31_000);
    store.checkOffline(NOW + 60_000);
    expect(
      useIiotStore.getState().alerts.filter((a) => a.alertType === 'Device Offline'),
    ).toHaveLength(1);
  });

  it('bacaan masuk lagi → ONLINE + alert offline auto-resolve', () => {
    const store = useIiotStore.getState();
    store.applyTelemetry(payload(), NOW);
    store.checkOffline(NOW + 31_000);
    store.applyTelemetry(payload({ ts: NOW + 40_000 }), NOW + 40_000);
    const dev = useIiotStore.getState().devices['NODE-R06-001'];
    expect(dev.status).toBe('ONLINE');
    expect(
      useIiotStore.getState().alerts.find((a) => a.alertType === 'Device Offline')?.status,
    ).toBe('Resolved');
  });

  it('timeout LIVE 180 dtk: 100 dtk belum offline, 181 dtk offline', () => {
    useIiotStore.setState({ mode: 'LIVE' });
    const store = useIiotStore.getState();
    store.applyTelemetry(payload(), NOW);
    store.checkOffline(NOW + 100_000);
    expect(useIiotStore.getState().devices['NODE-R06-001'].status).toBe('ONLINE');
    store.checkOffline(NOW + 181_000);
    expect(useIiotStore.getState().devices['NODE-R06-001'].status).toBe('OFFLINE');
  });

  it('perangkat disabled TIDAK pernah memicu alert offline', () => {
    const store = useIiotStore.getState();
    store.setDeviceEnabled('NODE-R06-001', false);
    store.checkOffline(NOW + 1_000_000);
    const dev = useIiotStore.getState().devices['NODE-R06-001'];
    expect(effectiveDeviceStatus(dev, NOW + 1_000_000)).toBe('DISABLED');
    expect(
      useIiotStore.getState().alerts.some((a) => a.alertType === 'Device Offline'),
    ).toBe(false);
  });
});

describe('recordInvalid — throttle 1/menit', () => {
  it('invalid pertama membuat alert; kedua dalam 1 menit diabaikan', () => {
    const store = useIiotStore.getState();
    store.recordInvalid('NODE-R06-001', 'humidity di luar rentang', NOW);
    store.recordInvalid('NODE-R06-001', 'humidity di luar rentang', NOW + 30_000);
    const alerts = useIiotStore.getState().alerts;
    expect(alerts.filter((a) => a.alertType === 'Invalid Sensor Data')).toHaveLength(1);
    expect(useIiotStore.getState().devices['NODE-R06-001'].invalidCount).toBe(1);
    store.recordInvalid('NODE-R06-001', 'humidity di luar rentang', NOW + 61_000);
    expect(useIiotStore.getState().devices['NODE-R06-001'].invalidCount).toBe(2);
  });

  it('bacaan valid berikutnya me-resolve alert Invalid Sensor Data', () => {
    const store = useIiotStore.getState();
    store.recordInvalid('NODE-R06-001', 'payload rusak', NOW);
    store.applyTelemetry(payload({ ts: NOW + 1000 }), NOW + 1000);
    expect(
      useIiotStore.getState().alerts.find((a) => a.alertType === 'Invalid Sensor Data')
        ?.status,
    ).toBe('Resolved');
  });
});

describe('threshold (FR-06)', () => {
  it('setThreshold mengubah nilai bila min < max; menolak min >= max', () => {
    const store = useIiotStore.getState();
    expect(store.setThreshold('R06', 'pressure', 3, 12)).toBe(true);
    expect(useIiotStore.getState().thresholds.R06.pressure?.max).toBe(12);
    expect(store.setThreshold('R06', 'pressure', 12, 3)).toBe(false);
    expect(store.setThreshold('R06', 'pressure', 5, 5)).toBe(false);
    expect(useIiotStore.getState().thresholds.R06.pressure?.max).toBe(12);
  });

  it('setThreshold menolak parameter yang tidak dimiliki ruangan', () => {
    const store = useIiotStore.getState();
    expect(store.setThreshold('R01', 'pressure', 1, 5)).toBe(false);
  });
});

describe('setDeviceEnabled', () => {
  it('disable menghentikan emisi & menandai disabled; enable kembali', () => {
    const store = useIiotStore.getState();
    store.setDeviceEnabled('NODE-R03-001', false);
    expect(useIiotStore.getState().devices['NODE-R03-001'].enabled).toBe(false);
    store.setDeviceEnabled('NODE-R03-001', true);
    expect(useIiotStore.getState().devices['NODE-R03-001'].enabled).toBe(true);
  });
});

describe('pengaturan tampilan scene', () => {
  it('default: tembok rendah 1,2 m, semi-transparan 45%, label & perabot tampil', () => {
    const { scene } = useIiotStore.getState();
    expect(scene.wallHeight).toBe(1.2);
    expect(scene.wallOpacity).toBe(0.45);
    expect(scene.showLabels).toBe(true);
    expect(scene.showFurniture).toBe(true);
  });

  it('default visualisasi: mode status, skala suhu −20..40 °C, kelembapan 0..100 %RH', () => {
    const { scene } = useIiotStore.getState();
    expect(scene.vizMode).toBe('status');
    expect(scene.tempMin).toBe(-20);
    expect(scene.tempMax).toBe(40);
    expect(scene.humMin).toBe(0);
    expect(scene.humMax).toBe(100);
  });

  it('setScene mengubah tinggi/opasitas tembok & visibilitas label', () => {
    const store = useIiotStore.getState();
    store.setScene({ wallHeight: 2.0, wallOpacity: 0.8, showLabels: false });
    const { scene } = useIiotStore.getState();
    expect(scene.wallHeight).toBe(2.0);
    expect(scene.wallOpacity).toBe(0.8);
    expect(scene.showLabels).toBe(false);
    // Pengaturan lain tidak ikut berubah.
    expect(scene.autoRotate).toBe(false);
    store.setScene({ wallHeight: 1.2, wallOpacity: 0.45, showLabels: true });
  });
});
