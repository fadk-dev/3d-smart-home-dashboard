// Unit test ekspor CSV (FR-05).
import { describe, expect, it } from 'vitest';
import { CSV_HEADER, buildCsv } from '../csv';
import type { ReadingRecord } from '../db';

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

describe('buildCsv', () => {
  it('header saja bila tidak ada bacaan', () => {
    expect(buildCsv([])).toBe(CSV_HEADER);
  });

  it('satu baris berisi timestamp ISO + nilai + satuan di header', () => {
    const csv = buildCsv([reading()]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(CSV_HEADER);
    expect(lines[1]).toBe(
      '2026-11-12T10:40:00.000Z,R06,NODE-R06-001,62.5,27.8,5.2',
    );
  });

  it('nilai null (pressure non-R06) menjadi sel kosong, bukan 0', () => {
    const csv = buildCsv([
      reading({ deviceId: 'NODE-R01-001', roomId: 'R01', pressure: null }),
    ]);
    expect(csv.split('\n')[1]).toBe('2026-11-12T10:40:00.000Z,R01,NODE-R01-001,62.5,27.8,');
  });

  it('banyak baris urut waktu', () => {
    const csv = buildCsv([
      reading(),
      reading({ id: 'x', ts: NOW + 60_000, humidity: 63 }),
    ]);
    expect(csv.split('\n')).toHaveLength(3);
  });
});
