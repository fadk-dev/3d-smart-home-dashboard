// Daftar ruangan & node sensor — SRS IIoT Catering v1.1 §3.1, §7.
//
// Denah 12,00 m (X, barat–timur) × 10,00 m (Z, utara–selatan), tinggi plafon
// 3,00 m, utara = −Z. Koordinat `rect` memakai sistem denah: x 0–12 (barat→
// timur), z 0–10 (utara→selatan). Layout disederhanakan dari gambar denah
// (denah rumah produksi makanan — higiene sanitasi, skala 1:100).
//
// MVP HANYA 8 ruangan (AC-13): R01–R08. Dua ruangan denah berlabel
// "Gudang Produk Jadi" (barat-tengah dan selatan-tengah) keduanya masuk R07,
// sehingga R07 punya DUA node: NODE-R07-001 dan NODE-R07-002. Total 9 node.
// Ruangan lain digambar di 3D tapi NON-MONITORING (di luar MVP).
import type { Parameter, RoomId } from '../config';

export interface RoomConfig {
  id: RoomId;
  name: string;
  description: string;
  /** Satu atau lebih persegi denah [x0, z0, x1, z1] dalam meter. */
  rects: Array<[number, number, number, number]>;
  location: string;
  hasPressure: boolean;
}

export const ROOMS: RoomConfig[] = [
  {
    id: 'R01',
    name: 'Penerimaan Bahan Baku',
    description: 'Raw Receiving — bahan baku masuk dari Airlock 1',
    rects: [[8.5, 0, 10.5, 2.5]],
    location: 'Sisi timur laut, bersebelahan dengan Airlock 1',
    hasPressure: false,
  },
  {
    id: 'R02',
    name: 'Gudang Bahan Kering',
    description: 'Penyimpanan bahan kering',
    rects: [[3, 0, 5.5, 2.5]],
    location: 'Sisi utara, antara R04 dan R03',
    hasPressure: false,
  },
  {
    id: 'R03',
    name: 'Chiller / Freezer',
    description: 'Penyimpanan dingin dan beku',
    rects: [[5.5, 0, 8.5, 2.5]],
    location: 'Sisi utara, antara R02 dan R01',
    hasPressure: false,
  },
  {
    id: 'R04',
    name: 'Cuci dan Sortir Bahan',
    description: 'Area Pencucian & Persiapan — pemisahan area kotor/bersih',
    rects: [[0, 0, 3, 2.5]],
    location: 'Sudut barat laut',
    hasPressure: false,
  },
  {
    id: 'R05',
    name: 'Dapur Produksi / Memasak',
    description: 'Area memasak — titik referensi ΔP untuk R06',
    rects: [[5.5, 2.5, 9.5, 5.5]],
    location: 'Tengah-timur, berbagi dinding dengan R06',
    hasPressure: false,
  },
  {
    id: 'R06',
    name: 'Porsi dan Pengemasan',
    description: 'Packing tables & labeling — satu-satunya ruangan dengan sensor ΔP',
    rects: [[2.5, 2.5, 5.5, 5.5]],
    location: 'Tengah, berbagi dinding dengan R05 (referensi ΔP)',
    hasPressure: true,
  },
  {
    id: 'R07',
    name: 'Gudang Produk Jadi',
    description: 'Finished goods — dua ruangan di denah (barat-tengah & selatan-tengah)',
    rects: [
      [0, 2.5, 2.5, 5.5],
      [4, 5.5, 7, 8],
    ],
    location: 'Barat-tengah & selatan-tengah (2 node)',
    hasPressure: false,
  },
  {
    id: 'R08',
    name: 'Area Pengiriman',
    description: 'Pengiriman produk jadi — exterior door barat daya',
    rects: [[0, 5.5, 2.5, 8.5]],
    location: 'Sudut barat daya',
    hasPressure: false,
  },
];

/** Alur produksi (SRS §3.2). */
export const FLOW: RoomId[] = ['R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08'];

export interface NodeConfig {
  deviceId: string;
  roomId: RoomId;
  location: string;
  sensors: Parameter[];
}

export const NODES: NodeConfig[] = [
  {
    deviceId: 'NODE-R01-001',
    roomId: 'R01',
    location: 'Dinding utara R01, dekat Airlock 1',
    sensors: ['humidity', 'temperature'],
  },
  {
    deviceId: 'NODE-R02-001',
    roomId: 'R02',
    location: 'Dinding utara R02',
    sensors: ['humidity', 'temperature'],
  },
  {
    deviceId: 'NODE-R03-001',
    roomId: 'R03',
    location: 'Dinding utara R03, dekat unit chiller',
    sensors: ['humidity', 'temperature'],
  },
  {
    deviceId: 'NODE-R04-001',
    roomId: 'R04',
    location: 'Dinding barat R04, dekat wastafel cuci',
    sensors: ['humidity', 'temperature'],
  },
  {
    deviceId: 'NODE-R05-001',
    roomId: 'R05',
    location: 'Dinding timur R05',
    sensors: ['humidity', 'temperature'],
  },
  {
    deviceId: 'NODE-R06-001',
    roomId: 'R06',
    location: 'Dinding pembatas R06/R05 — sensor ΔP',
    sensors: ['humidity', 'temperature', 'pressure'],
  },
  {
    deviceId: 'NODE-R07-001',
    roomId: 'R07',
    location: 'Gudang Produk Jadi barat (tengah-barat)',
    sensors: ['humidity', 'temperature'],
  },
  {
    deviceId: 'NODE-R07-002',
    roomId: 'R07',
    location: 'Gudang Produk Jadi selatan (tengah-selatan)',
    sensors: ['humidity', 'temperature'],
  },
  {
    deviceId: 'NODE-R08-001',
    roomId: 'R08',
    location: 'Dinding barat R08, dekat exterior door',
    sensors: ['humidity', 'temperature'],
  },
];

export interface NonMvpRoom {
  name: string;
  rect: [number, number, number, number];
}

/** Ruangan di denah yang DI LUAR MVP (SRS §10) — digambar abu-abu, tanpa sensor. */
export const NON_MVP_ROOMS: NonMvpRoom[] = [
  { name: 'Airlock 1', rect: [10.5, 0, 12, 2.5] },
  { name: 'Janitor / Alat Kebersihan', rect: [10.5, 2.5, 12, 4] },
  { name: 'Pencucian Alat', rect: [9.5, 4, 12, 5.5] },
  { name: 'Airlock 2', rect: [2.5, 5.5, 4, 8] },
  { name: 'Ruang Ganti & Loker', rect: [7, 5.5, 9, 8] },
  { name: 'Airlock 3', rect: [9, 5.5, 10.5, 7] },
  { name: 'Toilet Karyawan', rect: [9, 7, 10.5, 8.5] },
  { name: 'Ruang Sampah', rect: [10.5, 5.5, 12, 7.8] },
  { name: 'Kantor / Admin', rect: [9, 8.5, 12, 10] },
];

export interface ThresholdRange {
  min: number;
  max: number;
  unit: string;
}

export type ThresholdSet = Partial<Record<Parameter, ThresholdRange>>;

/**
 * Threshold default (CONTOH AWAL — SRS tidak memberi angka; wajib
 * dikonfirmasi admin sebelum dipakai operasional, lihat README).
 */
export const DEFAULT_THRESHOLDS: Record<RoomId, ThresholdSet> = {
  R01: {
    humidity: { min: 40, max: 70, unit: '%RH' },
    temperature: { min: 18, max: 30, unit: '°C' },
  },
  R02: {
    humidity: { min: 40, max: 60, unit: '%RH' },
    temperature: { min: 20, max: 30, unit: '°C' },
  },
  R03: {
    humidity: { min: 40, max: 85, unit: '%RH' },
    temperature: { min: -22, max: 4, unit: '°C' },
  },
  R04: {
    humidity: { min: 50, max: 85, unit: '%RH' },
    temperature: { min: 18, max: 30, unit: '°C' },
  },
  R05: {
    humidity: { min: 40, max: 80, unit: '%RH' },
    temperature: { min: 20, max: 38, unit: '°C' },
  },
  R06: {
    humidity: { min: 40, max: 65, unit: '%RH' },
    temperature: { min: 18, max: 26, unit: '°C' },
    pressure: { min: 2.5, max: 15, unit: 'Pa' },
  },
  R07: {
    humidity: { min: 40, max: 65, unit: '%RH' },
    temperature: { min: 4, max: 26, unit: '°C' },
  },
  R08: {
    humidity: { min: 40, max: 70, unit: '%RH' },
    temperature: { min: 18, max: 30, unit: '°C' },
  },
};

export function roomById(roomId: RoomId): RoomConfig {
  return ROOMS.find((r) => r.id === roomId) ?? ROOMS[0];
}

export function nodeById(deviceId: string): NodeConfig | undefined {
  return NODES.find((n) => n.deviceId === deviceId);
}

export function nodesForRoom(roomId: RoomId): NodeConfig[] {
  return NODES.filter((n) => n.roomId === roomId);
}

/** Topik telemetri IIoT (SRS §6 / FR-02): subscribe-only. */
export function telemetryTopic(roomId: RoomId, deviceId: string): string {
  return `iiot/catering/${roomId}/${deviceId}/telemetry`;
}

/** Semua topik yang harus di-subscribe (satu per node). */
export function subscribeTopics(): string[] {
  return NODES.map((n) => telemetryTopic(n.roomId, n.deviceId));
}
