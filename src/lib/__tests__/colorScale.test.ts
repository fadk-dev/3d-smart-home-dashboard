// Unit test skala warna visualisasi 3D.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HUM_SCALE,
  DEFAULT_TEMP_SCALE,
  HUM_STOPS,
  TEMP_STOPS,
  gradientCss,
  humidityColor,
  sampleScale,
  temperatureColor,
} from '../colorScale';

describe('sampleScale', () => {
  it('ujung bawah = stop pertama, ujung atas = stop terakhir', () => {
    expect(sampleScale(TEMP_STOPS, 0)).toBe('#2563eb');
    expect(sampleScale(TEMP_STOPS, 1)).toBe('#dc2626');
    expect(sampleScale(HUM_STOPS, 0)).toBe('#fef9c3');
    expect(sampleScale(HUM_STOPS, 1)).toBe('#1d4ed8');
  });

  it('nilai di luar 0..1 dijepit ke ujung skala', () => {
    expect(sampleScale(TEMP_STOPS, -0.5)).toBe('#2563eb');
    expect(sampleScale(TEMP_STOPS, 2)).toBe('#dc2626');
  });
});

describe('temperatureColor', () => {
  it('dingin = biru, panas = merah (default −20..40 °C)', () => {
    expect(temperatureColor(-20)).toBe('#2563eb');
    expect(temperatureColor(40)).toBe('#dc2626');
    // Di luar rentang dijepit ke ujung.
    expect(temperatureColor(-30)).toBe('#2563eb');
    expect(temperatureColor(55)).toBe('#dc2626');
  });

  it('tengah skala berada di antara hijau dan kuning', () => {
    // t = 0,5 pada 6 stop → antara stop hijau (#22c55e) dan kuning (#facc15).
    const mid = temperatureColor(10);
    expect(mid).not.toBe('#2563eb');
    expect(mid).not.toBe('#dc2626');
    expect(mid).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('nilai null atau rentang invalid → null', () => {
    expect(temperatureColor(null)).toBe(null);
    expect(temperatureColor(undefined)).toBe(null);
    expect(temperatureColor(10, 40, 40)).toBe(null);
    expect(temperatureColor(10, 40, -20)).toBe(null);
  });

  it('rentang kustom menggeser pemetaan', () => {
    expect(temperatureColor(0, 0, 40)).toBe('#2563eb');
    expect(temperatureColor(40, 0, 40)).toBe('#dc2626');
    expect(temperatureColor(20, 0, 40)).not.toBe(temperatureColor(20));
  });
});

describe('humidityColor', () => {
  it('kering = pucat, lembap = biru tua (default 0..100 %RH)', () => {
    expect(humidityColor(0)).toBe('#fef9c3');
    expect(humidityColor(100)).toBe('#1d4ed8');
    expect(humidityColor(-5)).toBe('#fef9c3');
    expect(humidityColor(150)).toBe('#1d4ed8');
  });

  it('nilai null atau rentang invalid → null', () => {
    expect(humidityColor(null)).toBe(null);
    expect(humidityColor(undefined)).toBe(null);
    expect(humidityColor(50, 100, 0)).toBe(null);
  });
});

describe('gradientCss', () => {
  it('menghasilkan linear-gradient dari semua stop', () => {
    const css = gradientCss(TEMP_STOPS);
    expect(css.startsWith('linear-gradient(90deg,')).toBe(true);
    expect(css).toContain('#2563eb');
    expect(css).toContain('#dc2626');
  });

  it('default skala konsisten dengan konstanta', () => {
    expect(DEFAULT_TEMP_SCALE).toEqual({ min: -20, max: 40 });
    expect(DEFAULT_HUM_SCALE).toEqual({ min: 0, max: 100 });
  });
});
