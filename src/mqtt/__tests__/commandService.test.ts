// Unit test Command Manager — FR-19/AC-14 (simulasi tidak pernah publish),
// FR-08/10 (pending → confirmed / timeout), mode LIVE tanpa broker ditolak.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVICES } from '../../config/devices';
import { useSmartHome } from '../../store/useStore';
import type { DeviceRuntime } from '../../store/useStore';
import { sendLampCommand } from '../../mqtt/commandService';
import { mqttService } from '../../mqtt/client';

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

beforeEach(() => {
  vi.useFakeTimers();
  useSmartHome.setState({
    mode: 'SIMULATION',
    brokerStatus: 'DISCONNECTED',
    commandTimeoutMs: 3000,
    devices: freshDevices(),
    telemetry: null,
    history: [],
    events: [],
  });
  useSmartHome.getState().markAllDevicesOnline();
  // State awal OFF agar perintah ON bermakna.
  useSmartHome.getState().applyLampState(
    { schemaVersion: '1.0', deviceId: 'esp32_01', state: 'OFF', ts: Date.now(), seq: 0 },
    Date.now(),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('mode SIMULATION', () => {
  it('tidak pernah memanggil publish MQTT (FR-19) — nol publish call', () => {
    const publishSpy = vi.spyOn(mqttService, 'publishCommand');
    const res = sendLampCommand('esp32_01', 'ON');
    expect(res.ok).toBe(true);
    expect(res.requestId).toMatch(/^req-/);
    expect(publishSpy).not.toHaveBeenCalled();
    // Pending langsung terlihat (NFR-02).
    expect(useSmartHome.getState().devices['esp32_01'].pending?.targetState).toBe('ON');
    // Echo simulasi (300–800 ms) menyelesaikan pending dengan requestId sama.
    vi.advanceTimersByTime(1000);
    const dev = useSmartHome.getState().devices['esp32_01'];
    expect(dev.confirmedState).toBe('ON');
    expect(dev.pending).toBeNull();
  });

  it('perintah kedua saat pending ditolak', () => {
    sendLampCommand('esp32_01', 'ON');
    const res = sendLampCommand('esp32_01', 'OFF');
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('menunggu konfirmasi');
  });

  it('perintah ke target yang sama dengan confirmed ditolak', () => {
    const res = sendLampCommand('esp32_01', 'OFF'); // sudah OFF
    expect(res.ok).toBe(false);
  });
});

describe('mode LIVE tanpa broker', () => {
  it('menolak perintah bila broker belum terhubung', () => {
    useSmartHome.setState({ mode: 'LIVE', brokerStatus: 'DISCONNECTED' });
    const publishSpy = vi.spyOn(mqttService, 'publishCommand');
    const res = sendLampCommand('esp32_01', 'ON');
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('Broker belum terhubung');
    expect(publishSpy).not.toHaveBeenCalled();
  });

  it('menolak perintah bila perangkat offline walau broker terhubung', () => {
    useSmartHome.setState({ mode: 'LIVE', brokerStatus: 'CONNECTED' });
    useSmartHome.getState().applyAvailability(
      { schemaVersion: '1.0', deviceId: 'esp32_01', status: 'offline', ts: Date.now() },
      Date.now(),
    );
    const res = sendLampCommand('esp32_01', 'ON');
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('offline');
  });
});

describe('timeout (NFR-04)', () => {
  it('pending yang tidak dikonfirmasi menjadi TIMEOUT setelah 3000 ms', () => {
    // Matikan echo simulasi dengan menahan timer: kirim perintah lalu majukan
    // hanya timer timeout — echo sim (≤800 ms) ikut termajukan, jadi gunakan
    // perangkat lampu lain tanpa state awal? Lebih langsung: uji store-level
    // lewat commandService dengan mode LIVE + broker CONNECTED + mock publish
    // yang tidak pernah membalas state.
    useSmartHome.setState({ mode: 'LIVE', brokerStatus: 'CONNECTED' });
    vi.spyOn(mqttService, 'publishCommand').mockReturnValue(true);
    const res = sendLampCommand('esp32_01', 'ON');
    expect(res.ok).toBe(true);
    expect(useSmartHome.getState().devices['esp32_01'].pending).not.toBeNull();
    vi.advanceTimersByTime(3000);
    const dev = useSmartHome.getState().devices['esp32_01'];
    expect(dev.pending).toBeNull();
    expect(dev.lastOutcome).toBe('TIMEOUT');
    expect(dev.confirmedState).toBe('OFF'); // state terakhir dipertahankan
  });
});
