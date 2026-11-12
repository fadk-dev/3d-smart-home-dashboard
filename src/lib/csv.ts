// Ekspor CSV histori (FR-05). Murni & teruji — dipakai HistoryPanel.
import type { ReadingRecord } from './db';

export const CSV_HEADER = 'timestamp,room_id,device_id,humidity_%RH,temperature_C,pressure_Pa';

/** Bangun isi CSV dari bacaan (urut waktu menaik). Nilai null → sel kosong. */
export function buildCsv(readings: ReadingRecord[]): string {
  const lines = readings.map((r) =>
    [
      new Date(r.ts).toISOString(),
      r.roomId,
      r.deviceId,
      r.humidity ?? '',
      r.temperature ?? '',
      r.pressure ?? '',
    ].join(','),
  );
  return [CSV_HEADER, ...lines].join('\n');
}
