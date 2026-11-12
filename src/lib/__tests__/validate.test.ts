// Unit test validasi payload IIoT — SRS §6 / FR-02, AC-01/02/03.
import { describe, expect, it } from 'vitest';
import {
  classifyFreshness,
  isNewerThan,
  parseJson,
  validateTelemetry,
} from '../validate';

const NOW = 1_794_480_000_000; // 2026-11-12T10:40:00Z
const ISO = '2026-11-12T10:40:00Z';

function r06(over: Record<string, unknown> = {}) {
  return {
    device_id: 'NODE-R06-001',
    room_id: 'R06',
    timestamp: ISO,
    humidity: 62.5,
    temperature: 27.8,
    pressure: 5.2,
    pressure_reference: 'R05',
    ...over,
  };
}

function r01(over: Record<string, unknown> = {}) {
  return {
    device_id: 'NODE-R01-001',
    room_id: 'R01',
    timestamp: ISO,
    humidity: 60,
    temperature: 26,
    ...over,
  };
}

describe('validateTelemetry — payload valid', () => {
  it('menerima R06 lengkap dengan pressure (contoh FR-02)', () => {
    const r = validateTelemetry(r06(), NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.deviceId).toBe('NODE-R06-001');
      expect(r.value.roomId).toBe('R06');
      expect(r.value.pressure).toBe(5.2);
      expect(r.value.pressureReference).toBe('R05');
      expect(r.value.ts).toBe(Date.parse(ISO));
    }
  });

  it('menerima non-R06 tanpa pressure', () => {
    expect(validateTelemetry(r01(), NOW).ok).toBe(true);
  });

  it('pressure null pada R06 diizinkan (sensor ΔP boleh tidak mengirim)', () => {
    expect(validateTelemetry(r06({ pressure: null }), NOW).ok).toBe(true);
    expect(validateTelemetry(r06({ pressure: undefined }), NOW).ok).toBe(true);
    const { pressure: _p, pressure_reference: _r, ...rest } = r06();
    void _p;
    void _r;
    expect(validateTelemetry(rest, NOW).ok).toBe(true);
  });

  it('menerima nilai di batas rentang', () => {
    expect(validateTelemetry(r01({ humidity: 0, temperature: -30 }), NOW).ok).toBe(true);
    expect(validateTelemetry(r01({ humidity: 100, temperature: 60 }), NOW).ok).toBe(true);
    expect(validateTelemetry(r06({ pressure: -50 }), NOW).ok).toBe(true);
    expect(validateTelemetry(r06({ pressure: 50 }), NOW).ok).toBe(true);
  });
});

describe('validateTelemetry — payload ditolak', () => {
  it('pressure pada node non-R06 ditolak', () => {
    const r = validateTelemetry(r01({ pressure: 5.2 }), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('R06');
  });

  it('device_id tidak dikenal ditolak', () => {
    expect(validateTelemetry(r01({ device_id: 'NODE-R99-001' }), NOW).ok).toBe(false);
    expect(validateTelemetry(r01({ device_id: 'esp32_01' }), NOW).ok).toBe(false);
  });

  it('room_id tidak cocok dengan node ditolak', () => {
    expect(validateTelemetry(r01({ room_id: 'R02' }), NOW).ok).toBe(false);
    expect(validateTelemetry(r06({ room_id: 'R05' }), NOW).ok).toBe(false);
  });

  it('timestamp tidak valid / terlalu jauh di masa depan ditolak', () => {
    expect(validateTelemetry(r01({ timestamp: 'kemarin' }), NOW).ok).toBe(false);
    expect(validateTelemetry(r01({ timestamp: 1794480000000 }), NOW).ok).toBe(false);
    expect(validateTelemetry(r01({ timestamp: '2026-11-12T10:46:00Z' }), NOW).ok).toBe(false);
    // Tepat 5 menit di masa depan masih diterima (batas toleransi).
    expect(validateTelemetry(r01({ timestamp: '2026-11-12T10:45:00Z' }), NOW).ok).toBe(true);
  });

  it('humidity/temperature hilang atau null ditolak (sensor wajib semua node)', () => {
    const { humidity: _h, ...noHum } = r01();
    void _h;
    expect(validateTelemetry(noHum, NOW).ok).toBe(false);
    expect(validateTelemetry(r01({ humidity: null }), NOW).ok).toBe(false);
    const { temperature: _t, ...noTemp } = r01();
    void _t;
    expect(validateTelemetry(noTemp, NOW).ok).toBe(false);
    expect(validateTelemetry(r01({ temperature: null }), NOW).ok).toBe(false);
  });

  it('nilai di luar rentang ditolak', () => {
    expect(validateTelemetry(r01({ humidity: 101 }), NOW).ok).toBe(false);
    expect(validateTelemetry(r01({ humidity: -1 }), NOW).ok).toBe(false);
    expect(validateTelemetry(r01({ temperature: 61 }), NOW).ok).toBe(false);
    expect(validateTelemetry(r01({ temperature: -31 }), NOW).ok).toBe(false);
    expect(validateTelemetry(r06({ pressure: 51 }), NOW).ok).toBe(false);
    expect(validateTelemetry(r06({ pressure: -51 }), NOW).ok).toBe(false);
  });

  it('tipe salah ditolak', () => {
    expect(validateTelemetry(r01({ humidity: '60' }), NOW).ok).toBe(false);
    expect(validateTelemetry(r01({ temperature: '26' }), NOW).ok).toBe(false);
    expect(validateTelemetry(r06({ pressure: '5.2' }), NOW).ok).toBe(false);
  });

  it('pressure_reference selain R05 ditolak', () => {
    expect(validateTelemetry(r06({ pressure_reference: 'R04' }), NOW).ok).toBe(false);
  });

  it('payload bukan objek ditolak', () => {
    expect(validateTelemetry('bukan objek', NOW).ok).toBe(false);
    expect(validateTelemetry(null, NOW).ok).toBe(false);
    expect(validateTelemetry([1, 2], NOW).ok).toBe(false);
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

describe('classifyFreshness (interval sampling 1 menit)', () => {
  it('batas 90 detik → CURRENT, 90 detik + 1 ms → STALE', () => {
    expect(classifyFreshness(0)).toBe('CURRENT');
    expect(classifyFreshness(90_000)).toBe('CURRENT');
    expect(classifyFreshness(90_001)).toBe('STALE');
  });
  it('batas 180 detik → STALE, 180 detik + 1 ms → UNAVAILABLE', () => {
    expect(classifyFreshness(180_000)).toBe('STALE');
    expect(classifyFreshness(180_001)).toBe('UNAVAILABLE');
  });
});

describe('isNewerThan — dedup / out-of-order (device_id + timestamp)', () => {
  it('timestamp lebih baru diterima, sama/lebih lama ditolak', () => {
    expect(isNewerThan({ lastTs: NOW }, { ts: NOW + 1 })).toBe(true);
    expect(isNewerThan({ lastTs: NOW }, { ts: NOW })).toBe(false);
    expect(isNewerThan({ lastTs: NOW }, { ts: NOW - 1 })).toBe(false);
  });
  it('pesan pertama selalu diterima', () => {
    expect(isNewerThan({}, { ts: NOW })).toBe(true);
  });
});
