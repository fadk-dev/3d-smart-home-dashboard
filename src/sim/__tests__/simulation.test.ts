// Unit test simulasi — baseline per ruangan & breach sengaja.
import { describe, expect, it } from 'vitest';
import { applyBreach, SIM_BASELINES, stepSimValue } from '../simulation';
import { DEFAULT_THRESHOLDS } from '../../config/devices';

describe('stepSimValue — random walk', () => {
  it('tetap di sekitar baseline setelah banyak langkah (noise tetap)', () => {
    const base = SIM_BASELINES['NODE-R03-001']; // chiller −12 °C
    let v = base.temperature;
    for (let t = 0; t < 200; t++) {
      v = stepSimValue(v, base.temperature, base.tempSwing, t, () => 0.5);
    }
    expect(v).toBeGreaterThan(-18);
    expect(v).toBeLessThan(-4);
  });

  it('menarik nilai kembali ke baseline', () => {
    const v = stepSimValue(30, 26, 2, 0, () => 0.5);
    expect(v).toBeLessThan(30);
    expect(v).toBeGreaterThan(26);
  });
});

describe('applyBreach — penyimpangan sengaja', () => {
  it('mendorong suhu R05 keluar threshold atas', () => {
    const out = applyBreach(33, 'temperature', DEFAULT_THRESHOLDS.R05, 1);
    expect(out).toBeGreaterThan(38); // max R05 = 38
  });

  it('mendorong ΔP R06 keluar threshold bawah', () => {
    const out = applyBreach(8, 'pressure', DEFAULT_THRESHOLDS.R06, -1);
    expect(out).toBeLessThan(2.5); // min R06 = 2.5
  });

  it('tanpa threshold untuk parameter → nilai tidak berubah', () => {
    const out = applyBreach(8, 'pressure', DEFAULT_THRESHOLDS.R01, 1);
    expect(out).toBe(8);
  });
});

describe('SIM_BASELINES — baseline berbeda per ruangan', () => {
  it('R03 dingin, R05 panas, R06 punya ΔP positif', () => {
    expect(SIM_BASELINES['NODE-R03-001'].temperature).toBeLessThan(0);
    expect(SIM_BASELINES['NODE-R05-001'].temperature).toBeGreaterThan(30);
    expect(SIM_BASELINES['NODE-R06-001'].pressure).toBeGreaterThan(0);
    expect(SIM_BASELINES['NODE-R01-001'].pressure).toBeNull();
  });
});
