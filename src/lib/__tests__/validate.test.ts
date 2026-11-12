// Unit test validasi payload & freshness & dedup — SRS §6, FR-15/16/17, AC-12/13, §9.5.
import { describe, expect, it } from 'vitest';
import {
  buildLampCommand,
  classifyFreshness,
  isNewerThan,
  parseJson,
  validateAvailability,
  validateLampCommand,
  validateLampState,
  validateTelemetry,
} from '../validate';

const NOW = 1_794_480_000_000;
const DEV = 'esp32_01';

function telemetry(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: '1.0',
    deviceId: DEV,
    ts: NOW,
    seq: 1024,
    temperatureC: 28.5,
    humidityPct: 65.2,
    pressureHpa: 1008.4,
    ...over,
  };
}

describe('validateTelemetry', () => {
  it('menerima payload valid lengkap (contoh SRS §6.4)', () => {
    const r = validateTelemetry(telemetry(), DEV, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.temperatureC).toBe(28.5);
  });

  it('menerima payload tanpa field opsional', () => {
    const { humidityPct: _h, pressureHpa: _p, seq: _s, ...minimal } = telemetry();
    void _h;
    void _p;
    void _s;
    expect(validateTelemetry(minimal, DEV, NOW).ok).toBe(true);
  });

  it('menolak field wajib hilang (temperatureC)', () => {
    const { temperatureC: _t, ...rest } = telemetry();
    void _t;
    const r = validateTelemetry(rest, DEV, NOW);
    expect(r.ok).toBe(false);
  });

  it('menolak tipe salah (humidityPct string)', () => {
    const r = validateTelemetry(telemetry({ humidityPct: '65' }), DEV, NOW);
    expect(r.ok).toBe(false);
  });

  it('menolak nilai di luar rentang', () => {
    expect(validateTelemetry(telemetry({ temperatureC: 100 }), DEV, NOW).ok).toBe(false);
    expect(validateTelemetry(telemetry({ temperatureC: -20 }), DEV, NOW).ok).toBe(false);
    expect(validateTelemetry(telemetry({ humidityPct: 150 }), DEV, NOW).ok).toBe(false);
    expect(validateTelemetry(telemetry({ pressureHpa: 500 }), DEV, NOW).ok).toBe(false);
  });

  it('menerima nilai di batas rentang', () => {
    expect(validateTelemetry(telemetry({ temperatureC: -10 }), DEV, NOW).ok).toBe(true);
    expect(validateTelemetry(telemetry({ temperatureC: 60 }), DEV, NOW).ok).toBe(true);
    expect(validateTelemetry(telemetry({ humidityPct: 0 }), DEV, NOW).ok).toBe(true);
    expect(validateTelemetry(telemetry({ humidityPct: 100 }), DEV, NOW).ok).toBe(true);
  });

  it('menolak deviceId yang tidak sesuai konteks (FR-16)', () => {
    const r = validateTelemetry(telemetry({ deviceId: 'esp32_99' }), DEV, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('esp32_99');
  });

  it('menolak schemaVersion salah', () => {
    expect(validateTelemetry(telemetry({ schemaVersion: '2.0' }), DEV, NOW).ok).toBe(false);
  });

  it('menolak ts terlalu jauh di masa depan', () => {
    const r = validateTelemetry(telemetry({ ts: NOW + 10 * 60_000 }), DEV, NOW);
    expect(r.ok).toBe(false);
  });

  it('menolak payload bukan objek', () => {
    expect(validateTelemetry('bukan objek', DEV, NOW).ok).toBe(false);
    expect(validateTelemetry(null, DEV, NOW).ok).toBe(false);
    expect(validateTelemetry([1, 2], DEV, NOW).ok).toBe(false);
  });
});

describe('parseJson', () => {
  it('menolak JSON malformed', () => {
    expect(parseJson('{tidak valid').ok).toBe(false);
  });
  it('menolak JSON non-objek', () => {
    expect(parseJson('[1,2]').ok).toBe(false);
  });
  it('menerima JSON objek', () => {
    expect(parseJson('{"a":1}').ok).toBe(true);
  });
});

describe('validateLampState', () => {
  const base = {
    schemaVersion: '1.0',
    deviceId: DEV,
    requestId: 'req-20261112-0001',
    state: 'ON',
    ts: NOW,
    seq: 55,
  };
  it('menerima state valid dengan requestId (contoh SRS §6.6)', () => {
    expect(validateLampState(base, DEV, NOW).ok).toBe(true);
  });
  it('menerima state tanpa requestId', () => {
    const { requestId: _r, ...rest } = base;
    void _r;
    expect(validateLampState(rest, DEV, NOW).ok).toBe(true);
  });
  it('menolak state di luar enum', () => {
    expect(validateLampState({ ...base, state: 'TOGGLE' }, DEV, NOW).ok).toBe(false);
  });
  it('menolak deviceId lain', () => {
    expect(validateLampState({ ...base, deviceId: 'esp32_02' }, DEV, NOW).ok).toBe(false);
  });
});

describe('validateAvailability', () => {
  const base = {
    schemaVersion: '1.0',
    deviceId: DEV,
    status: 'online',
    ts: NOW,
    reason: 'connected',
  };
  it('menerima online/offline', () => {
    expect(validateAvailability(base, DEV, NOW).ok).toBe(true);
    expect(validateAvailability({ ...base, status: 'offline' }, DEV, NOW).ok).toBe(true);
  });
  it('menolak status lain', () => {
    expect(validateAvailability({ ...base, status: 'away' }, DEV, NOW).ok).toBe(false);
  });
});

describe('buildLampCommand / validateLampCommand', () => {
  it('membentuk requestId unik format req-<epoch>-<random>', () => {
    const a = buildLampCommand(DEV, 'ON', NOW);
    const b = buildLampCommand(DEV, 'ON', NOW);
    expect(a.requestId).toMatch(/^req-1794480000000-[a-z0-9]+$/);
    expect(a.requestId).not.toBe(b.requestId);
    expect(validateLampCommand(a).ok).toBe(true);
  });
  it('menolak targetState toggle (harus ON/OFF eksplisit)', () => {
    const cmd = { ...buildLampCommand(DEV, 'ON', NOW), targetState: 'TOGGLE' };
    expect(validateLampCommand(cmd).ok).toBe(false);
  });
});

describe('classifyFreshness (SRS §9.5)', () => {
  it('batas 5 detik → CURRENT, 5 detik + 1 ms → STALE', () => {
    expect(classifyFreshness(0)).toBe('CURRENT');
    expect(classifyFreshness(5000)).toBe('CURRENT');
    expect(classifyFreshness(5001)).toBe('STALE');
  });
  it('batas 10 detik → STALE, 10 detik + 1 ms → UNAVAILABLE', () => {
    expect(classifyFreshness(10000)).toBe('STALE');
    expect(classifyFreshness(10001)).toBe('UNAVAILABLE');
  });
});

describe('isNewerThan — dedup / out-of-order (FR-17)', () => {
  it('seq lebih besar diterima, seq sama/lebih kecil ditolak', () => {
    expect(isNewerThan({ lastSeq: 10, lastTs: NOW }, { seq: 11, ts: NOW + 1 })).toBe(true);
    expect(isNewerThan({ lastSeq: 10, lastTs: NOW }, { seq: 10, ts: NOW + 1 })).toBe(false);
    expect(isNewerThan({ lastSeq: 10, lastTs: NOW }, { seq: 9, ts: NOW + 1 })).toBe(false);
  });
  it('tanpa seq, ts menentukan; ts sama/lebih lama ditolak', () => {
    expect(isNewerThan({ lastTs: NOW }, { ts: NOW + 1 })).toBe(true);
    expect(isNewerThan({ lastTs: NOW }, { ts: NOW })).toBe(false);
    expect(isNewerThan({ lastTs: NOW }, { ts: NOW - 1 })).toBe(false);
  });
  it('pesan pertama selalu diterima', () => {
    expect(isNewerThan({}, { seq: 1, ts: NOW })).toBe(true);
  });
});
