// Unit test database lokal (IndexedDB §7) — round-trip via backend in-memory.
// Backend IndexedDB asli tidak diuji di Node (tidak tersedia); LocalDb memakai
// backend yang bisa ditukar sehingga logika cap & query teruji di sini.
import { describe, expect, it } from 'vitest';
import { createMemoryDb } from '../db';
import type { AlertRecord, ReadingRecord, ThresholdRecord } from '../db';

const NOW = 1_794_480_000_000;

function reading(over: Partial<ReadingRecord> = {}): ReadingRecord {
  return {
    id: `NODE-R06-001:${NOW}`,
    deviceId: 'NODE-R06-001',
    roomId: 'R06',
    ts: NOW,
    humidity: 62.5,
    temperature: 27.8,
    pressure: 5.2,
    pressureReference: 'R05',
    dataStatus: 'VALID',
    ...over,
  };
}

describe('LocalDb — readings', () => {
  it('round-trip: simpan lalu baca kembali per perangkat & rentang waktu', async () => {
    const db = createMemoryDb();
    await db.saveReading(reading());
    await db.saveReading(reading({ id: `NODE-R06-001:${NOW + 60_000}`, ts: NOW + 60_000, humidity: 63 }));
    await db.saveReading(
      reading({ id: `NODE-R01-001:${NOW}`, deviceId: 'NODE-R01-001', roomId: 'R01', pressure: null }),
    );
    expect(await db.countReadings()).toBe(3);
    const r06 = await db.getReadings('NODE-R06-001', NOW, NOW + 120_000);
    expect(r06).toHaveLength(2);
    expect(r06[0].ts).toBe(NOW);
    expect(r06[1].humidity).toBe(63);
    const all = await db.getReadings(null, NOW, NOW + 120_000);
    expect(all).toHaveLength(3);
    const narrow = await db.getReadings(null, NOW + 1, NOW + 120_000);
    expect(narrow).toHaveLength(1);
  });

  it('cap: hanya N bacaan terbaru dipertahankan, yang lama dihapus', async () => {
    const db = createMemoryDb(5);
    for (let i = 0; i < 8; i++) {
      await db.saveReading(
        reading({ id: `NODE-R06-001:${NOW + i * 60_000}`, ts: NOW + i * 60_000 }),
      );
    }
    expect(await db.countReadings()).toBe(5);
    const kept = await db.getReadings('NODE-R06-001', NOW, NOW + 8 * 60_000);
    expect(kept.map((r) => r.ts)).toEqual([
      NOW + 3 * 60_000,
      NOW + 4 * 60_000,
      NOW + 5 * 60_000,
      NOW + 6 * 60_000,
      NOW + 7 * 60_000,
    ]);
  });
});

describe('LocalDb — thresholds, devices, alerts, meta', () => {
  it('round-trip threshold per ruangan/parameter', async () => {
    const db = createMemoryDb();
    const t: ThresholdRecord = {
      key: 'R06:pressure',
      roomId: 'R06',
      parameter: 'pressure',
      min: 2.5,
      max: 15,
      unit: 'Pa',
      updatedAt: NOW,
    };
    await db.saveThreshold(t);
    const all = await db.getThresholds();
    expect(all).toHaveLength(1);
    expect(all[0].max).toBe(15);
  });

  it('round-trip status enable/disable perangkat', async () => {
    const db = createMemoryDb();
    await db.saveDevice({ deviceId: 'NODE-R03-001', roomId: 'R03', enabled: false, updatedAt: NOW });
    const all = await db.getDevices();
    expect(all).toHaveLength(1);
    expect(all[0].enabled).toBe(false);
  });

  it('round-trip alert', async () => {
    const db = createMemoryDb();
    const a: AlertRecord = {
      id: 'alert-1',
      roomId: 'R06',
      deviceId: 'NODE-R06-001',
      parameter: 'pressure',
      actualValue: 18,
      thresholdValue: 15,
      alertType: 'Pressure High',
      status: 'Active',
      createdAt: NOW,
      resolvedAt: null,
    };
    await db.saveAlert(a);
    const all = await db.getAlerts();
    expect(all).toHaveLength(1);
    expect(all[0].alertType).toBe('Pressure High');
  });

  it('meta key/value (flag seed)', async () => {
    const db = createMemoryDb();
    expect(await db.getMeta('seeded:v1')).toBeUndefined();
    await db.setMeta('seeded:v1', '1');
    expect(await db.getMeta('seeded:v1')).toBe('1');
  });
});
