// Unit test store — SRS §4.5/§4.6, FR-08/09/10/12/17, AC-06/07/13.
// Store adalah singleton Zustand; setiap test mereset state lewat setState.
import { beforeEach, describe, expect, it } from 'vitest';
import { DEVICES } from '../../config/devices';
import { HISTORY_CAPACITY } from '../../config';
import { useSmartHome } from '../useStore';
import type { DeviceRuntime } from '../useStore';

const NOW = 1_794_480_000_000;

function freshDevices(): Record<string, DeviceRuntime> {
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

function resetStore(): void {
  useSmartHome.setState({
    mode: 'SIMULATION',
    brokerStatus: 'DISCONNECTED',
    devices: freshDevices(),
    telemetry: null,
    history: [],
    events: [],
  });
}

beforeEach(() => {
  resetStore();
});

describe('applyTelemetry', () => {
  it('menyimpan snapshot & menambah histori (maks 60 titik)', () => {
    const s = useSmartHome.getState();
    for (let i = 0; i < HISTORY_CAPACITY + 5; i++) {
      useSmartHome.getState().applyTelemetry(
        {
          schemaVersion: '1.0',
          deviceId: 'esp32_01',
          ts: NOW + i * 2000,
          seq: i + 1,
          temperatureC: 28,
          humidityPct: 65,
        },
        NOW + i * 2000,
      );
    }
    const after = useSmartHome.getState();
    expect(after.history.length).toBe(HISTORY_CAPACITY);
    expect(after.telemetry?.temperatureC).toBe(28);
    expect(after.telemetry?.ts).toBe(NOW + (HISTORY_CAPACITY + 4) * 2000);
    expect(s).toBeDefined();
  });

  it('telemetri duplikat / seq lebih lama tidak mengubah state', () => {
    const store = useSmartHome.getState();
    const payload = {
      schemaVersion: '1.0' as const,
      deviceId: 'esp32_01',
      ts: NOW,
      seq: 10,
      temperatureC: 28.5,
    };
    store.applyTelemetry(payload, NOW);
    store.applyTelemetry({ ...payload, temperatureC: 99 }, NOW); // duplikat seq — suhu 99 di luar rentang tapi store tidak memvalidasi; dedup yang menolak
    expect(useSmartHome.getState().telemetry?.temperatureC).toBe(28.5);
    expect(useSmartHome.getState().history.length).toBe(1);
    store.applyTelemetry({ ...payload, seq: 9, ts: NOW + 1000, temperatureC: 20 }, NOW);
    expect(useSmartHome.getState().telemetry?.temperatureC).toBe(28.5);
  });
});

describe('applyLampState — rekonsiliasi pending', () => {
  it('state dengan requestId cocok menyelesaikan pending & mengupdate confirmed', () => {
    const store = useSmartHome.getState();
    store.startPending('esp32_01', { requestId: 'req-1', targetState: 'ON', issuedAt: NOW });
    store.applyLampState(
      { schemaVersion: '1.0', deviceId: 'esp32_01', requestId: 'req-1', state: 'ON', ts: NOW, seq: 1 },
      NOW,
    );
    const dev = useSmartHome.getState().devices['esp32_01'];
    expect(dev.confirmedState).toBe('ON');
    expect(dev.pending).toBeNull();
  });

  it('state TANPA requestId tetap mengupdate confirmed (SRS §4.6)', () => {
    const store = useSmartHome.getState();
    store.applyLampState(
      { schemaVersion: '1.0', deviceId: 'esp32_01', state: 'OFF', ts: NOW, seq: 1 },
      NOW,
    );
    expect(useSmartHome.getState().devices['esp32_01'].confirmedState).toBe('OFF');
  });

  it('state dengan requestId yang tidak cocok tidak menyelesaikan pending', () => {
    const store = useSmartHome.getState();
    store.startPending('esp32_01', { requestId: 'req-1', targetState: 'ON', issuedAt: NOW });
    store.applyLampState(
      { schemaVersion: '1.0', deviceId: 'esp32_01', requestId: 'req- lain', state: 'OFF', ts: NOW, seq: 1 },
      NOW,
    );
    const dev = useSmartHome.getState().devices['esp32_01'];
    expect(dev.confirmedState).toBe('OFF'); // confirmed tetap diperbarui
    expect(dev.pending?.requestId).toBe('req-1'); // pending lain tetap menunggu
  });

  it('state lebih lama (seq lebih kecil) tidak meregresi confirmed (AC-13)', () => {
    const store = useSmartHome.getState();
    store.applyLampState(
      { schemaVersion: '1.0', deviceId: 'esp32_01', state: 'ON', ts: NOW, seq: 10 },
      NOW,
    );
    store.applyLampState(
      { schemaVersion: '1.0', deviceId: 'esp32_01', state: 'OFF', ts: NOW - 1000, seq: 9 },
      NOW,
    );
    expect(useSmartHome.getState().devices['esp32_01'].confirmedState).toBe('ON');
  });
});

describe('timeout & disconnect', () => {
  it('markCommandTimeout hanya untuk requestId yang cocok; state terakhir dipertahankan', () => {
    const store = useSmartHome.getState();
    store.applyLampState(
      { schemaVersion: '1.0', deviceId: 'esp32_01', state: 'OFF', ts: NOW, seq: 1 },
      NOW,
    );
    store.startPending('esp32_01', { requestId: 'req-1', targetState: 'ON', issuedAt: NOW });
    store.markCommandTimeout('esp32_01', 'req-salah');
    expect(useSmartHome.getState().devices['esp32_01'].pending).not.toBeNull();
    store.markCommandTimeout('esp32_01', 'req-1');
    const dev = useSmartHome.getState().devices['esp32_01'];
    expect(dev.pending).toBeNull();
    expect(dev.lastOutcome).toBe('TIMEOUT');
    expect(dev.confirmedState).toBe('OFF'); // confirmed terakhir dipertahankan
  });

  it('clearPendingOnDisconnect membatalkan pending tanpa klaim gagal', () => {
    const store = useSmartHome.getState();
    store.startPending('esp32_01', { requestId: 'req-1', targetState: 'ON', issuedAt: NOW });
    store.startPending('esp32_02', { requestId: 'req-2', targetState: 'OFF', issuedAt: NOW });
    store.clearPendingOnDisconnect();
    const s = useSmartHome.getState();
    expect(s.devices['esp32_01'].pending).toBeNull();
    expect(s.devices['esp32_01'].lastOutcome).toBe('DISCONNECTED');
    expect(s.devices['esp32_02'].pending).toBeNull();
  });
});

describe('applyAvailability', () => {
  it('online/offline mengubah indikator; pesan lebih lama diabaikan', () => {
    const store = useSmartHome.getState();
    store.applyAvailability(
      { schemaVersion: '1.0', deviceId: 'esp32_01', status: 'online', ts: NOW },
      NOW,
    );
    expect(useSmartHome.getState().devices['esp32_01'].availability).toBe('ONLINE');
    store.applyAvailability(
      { schemaVersion: '1.0', deviceId: 'esp32_01', status: 'offline', ts: NOW - 5000 },
      NOW,
    );
    expect(useSmartHome.getState().devices['esp32_01'].availability).toBe('ONLINE');
    store.applyAvailability(
      { schemaVersion: '1.0', deviceId: 'esp32_01', status: 'offline', ts: NOW + 1000 },
      NOW + 1000,
    );
    expect(useSmartHome.getState().devices['esp32_01'].availability).toBe('OFFLINE');
  });
});
