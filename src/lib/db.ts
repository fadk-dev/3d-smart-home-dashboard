// Database lokal (IndexedDB) — SRS §7 (MVP).
//
// MVP ini TIDAK punya backend/server: tabel-tabel §7 (rooms, devices,
// readings, thresholds, alerts) diimplementasikan sebagai object store
// IndexedDB di browser. Di produksi, gantikan lapisan ini dengan broker +
// REST API + Postgres sesuai SRS §2.1/§6.2 (lihat README) — antarmuka
// `LocalDb` di bawah adalah batasnya.
//
// Kapasitas: maksimal READINGS_DB_CAP bacaan terbaru dipertahankan; bacaan
// paling lama dihapus saat cap terlampaui.
//
// Backend bisa ditukar: `IndexedDbBackend` (browser) atau `MemoryBackend`
// (fallback bila IndexedDB tidak tersedia, dan dipakai unit test).
import { READINGS_DB_CAP } from '../config';
import type { AlertStatus } from '../config';

export interface ReadingRecord {
  /** Kunci: `${deviceId}:${ts}`. */
  id: string;
  deviceId: string;
  roomId: string;
  ts: number;
  humidity: number | null;
  temperature: number | null;
  pressure: number | null;
  pressureReference?: string;
  dataStatus: 'VALID';
}

export interface ThresholdRecord {
  key: string; // `${roomId}:${parameter}`
  roomId: string;
  parameter: string;
  min: number;
  max: number;
  unit: string;
  updatedAt: number;
}

export interface DeviceRecord {
  deviceId: string;
  roomId: string;
  enabled: boolean;
  updatedAt: number;
}

export interface AlertRecord {
  id: string;
  roomId: string;
  deviceId: string;
  parameter: string;
  actualValue: number | null;
  thresholdValue: number | null;
  alertType: string;
  status: AlertStatus;
  createdAt: number;
  resolvedAt: number | null;
}

export interface MetaRecord {
  key: string;
  value: string;
}

export type StoreName = 'readings' | 'thresholds' | 'devices' | 'alerts' | 'meta';

export interface DbBackend {
  put(store: StoreName, key: string, value: Record<string, unknown>): Promise<void>;
  get(store: StoreName, key: string): Promise<Record<string, unknown> | undefined>;
  getAll(store: StoreName): Promise<Record<string, unknown>[]>;
  delete(store: StoreName, key: string): Promise<void>;
  count(store: StoreName): Promise<number>;
}

/** Backend in-memory — fallback & unit test. */
export class MemoryBackend implements DbBackend {
  private tables = new Map<StoreName, Map<string, Record<string, unknown>>>();

  private table(store: StoreName): Map<string, Record<string, unknown>> {
    let t = this.tables.get(store);
    if (!t) {
      t = new Map();
      this.tables.set(store, t);
    }
    return t;
  }

  async put(store: StoreName, key: string, value: Record<string, unknown>): Promise<void> {
    this.table(store).set(key, value);
  }

  async get(store: StoreName, key: string): Promise<Record<string, unknown> | undefined> {
    return this.table(store).get(key);
  }

  async getAll(store: StoreName): Promise<Record<string, unknown>[]> {
    return [...this.table(store).values()];
  }

  async delete(store: StoreName, key: string): Promise<void> {
    this.table(store).delete(key);
  }

  async count(store: StoreName): Promise<number> {
    return this.table(store).size;
  }
}

const DB_NAME = 'iiot-catering';
const DB_VERSION = 1;

/** Backend IndexedDB asli (browser). */
export class IndexedDbBackend implements DbBackend {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('readings')) {
          const s = db.createObjectStore('readings', { keyPath: 'id' });
          s.createIndex('by-device', 'deviceId', { unique: false });
          s.createIndex('by-ts', 'ts', { unique: false });
        }
        if (!db.objectStoreNames.contains('thresholds')) {
          db.createObjectStore('thresholds', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('devices')) {
          db.createObjectStore('devices', { keyPath: 'deviceId' });
        }
        if (!db.objectStoreNames.contains('alerts')) {
          const s = db.createObjectStore('alerts', { keyPath: 'id' });
          s.createIndex('by-status', 'status', { unique: false });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Gagal membuka IndexedDB'));
    });
    return this.dbPromise;
  }

  private async tx<T>(
    store: StoreName,
    mode: IDBTransactionMode,
    fn: (s: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Operasi IndexedDB gagal'));
    });
  }

  async put(store: StoreName, key: string, value: Record<string, unknown>): Promise<void> {
    void key;
    await this.tx(store, 'readwrite', (s) => s.put(value));
  }

  async get(store: StoreName, key: string): Promise<Record<string, unknown> | undefined> {
    const v = await this.tx(store, 'readonly', (s) => s.get(key));
    return (v as Record<string, unknown> | undefined) ?? undefined;
  }

  async getAll(store: StoreName): Promise<Record<string, unknown>[]> {
    const v = await this.tx(store, 'readonly', (s) => s.getAll());
    return (v as Record<string, unknown>[]) ?? [];
  }

  async delete(store: StoreName, key: string): Promise<void> {
    await this.tx(store, 'readwrite', (s) => s.delete(key));
  }

  async count(store: StoreName): Promise<number> {
    return this.tx(store, 'readonly', (s) => s.count());
  }
}

/** API database lokal — satu-satunya jalur baca/tulis tabel §7. */
export class LocalDb {
  private backend: DbBackend;
  private cap: number;

  constructor(backend: DbBackend, cap: number = READINGS_DB_CAP) {
    this.backend = backend;
    this.cap = cap;
  }

  async saveReading(r: ReadingRecord): Promise<void> {
    await this.backend.put('readings', r.id, r as unknown as Record<string, unknown>);
    await this.enforceCap();
  }

  private async enforceCap(): Promise<void> {
    const n = await this.backend.count('readings');
    if (n <= this.cap) return;
    const all = (await this.backend.getAll('readings')) as unknown as ReadingRecord[];
    const sorted = [...all].sort((a, b) => a.ts - b.ts);
    const excess = sorted.slice(0, n - this.cap);
    for (const r of excess) {
      await this.backend.delete('readings', r.id);
    }
  }

  async getReadings(
    deviceId: string | null,
    fromMs: number,
    toMs: number,
    limit = 1000,
  ): Promise<ReadingRecord[]> {
    const all = (await this.backend.getAll('readings')) as unknown as ReadingRecord[];
    return all
      .filter(
        (r) => (deviceId === null || r.deviceId === deviceId) && r.ts >= fromMs && r.ts <= toMs,
      )
      .sort((a, b) => a.ts - b.ts)
      .slice(-limit);
  }

  async countReadings(): Promise<number> {
    return this.backend.count('readings');
  }

  async saveThreshold(t: ThresholdRecord): Promise<void> {
    await this.backend.put('thresholds', t.key, t as unknown as Record<string, unknown>);
  }

  async getThresholds(): Promise<ThresholdRecord[]> {
    return (await this.backend.getAll('thresholds')) as unknown as ThresholdRecord[];
  }

  async saveDevice(d: DeviceRecord): Promise<void> {
    await this.backend.put('devices', d.deviceId, d as unknown as Record<string, unknown>);
  }

  async getDevices(): Promise<DeviceRecord[]> {
    return (await this.backend.getAll('devices')) as unknown as DeviceRecord[];
  }

  async saveAlert(a: AlertRecord): Promise<void> {
    await this.backend.put('alerts', a.id, a as unknown as Record<string, unknown>);
  }

  async getAlerts(): Promise<AlertRecord[]> {
    return (await this.backend.getAll('alerts')) as unknown as AlertRecord[];
  }

  async getMeta(key: string): Promise<string | undefined> {
    const v = (await this.backend.get('meta', key)) as unknown as MetaRecord | undefined;
    return v?.value;
  }

  async setMeta(key: string, value: string): Promise<void> {
    await this.backend.put('meta', key, { key, value });
  }
}

/** DB in-memory (unit test / fallback). */
export function createMemoryDb(cap?: number): LocalDb {
  return new LocalDb(new MemoryBackend(), cap);
}

function indexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/** Singleton aplikasi: IndexedDB bila tersedia, in-memory bila tidak. */
export function createDb(): LocalDb {
  return new LocalDb(indexedDbAvailable() ? new IndexedDbBackend() : new MemoryBackend());
}

export const db = createDb();
