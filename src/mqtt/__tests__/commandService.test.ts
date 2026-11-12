// Unit test layanan evaluasi threshold & alert — FR-06/FR-07.
// Modul ini dulu Command Manager; MVP monitoring-only: TIDAK ADA publish.
// Test di sini membuktikan: (1) evaluasi threshold murni benar, (2) klien MQTT
// tidak punya method publish sama sekali, (3) simulasi tidak pernah menyentuh
// broker.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THRESHOLDS, NODES } from '../../config/devices';
import { useIiotStore } from '../../store/useStore';
import type { DeviceRuntime } from '../../store/useStore';
import {
  alertKey,
  evaluateParameter,
  evaluateReading,
} from '../../mqtt/commandService';
import { mqttService } from '../../mqtt/client';
import { startSimulation, stopSimulation } from '../../sim/simulation';

function freshDevices(): Record<string, DeviceRuntime> {
  const out: Record<string, DeviceRuntime> = {};
  for (const config of NODES) {
    out[config.deviceId] = {
      config,
      enabled: true,
      status: 'OFFLINE',
      lastSeen: null,
      lastTs: undefined,
      lastReading: null,
      lastInvalidAt: null,
      invalidCount: 0,
      lastTelemetryLogAt: null,
    };
  }
  return out;
}

beforeEach(() => {
  vi.useFakeTimers();
  useIiotStore.setState({
    mode: 'SIMULATION',
    brokerStatus: 'DISCONNECTED',
    devices: freshDevices(),
    alerts: [],
    events: [],
  });
});

afterEach(() => {
  stopSimulation();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('evaluateParameter — per parameter', () => {
  it('normal di dalam rentang → null', () => {
    expect(evaluateParameter('temperature', 24, { min: 18, max: 26 })).toBeNull();
    expect(evaluateParameter('humidity', 60, { min: 40, max: 65 })).toBeNull();
    expect(evaluateParameter('pressure', 8, { min: 2.5, max: 15 })).toBeNull();
  });

  it('di atas max → High dengan thresholdValue = max', () => {
    const b = evaluateParameter('temperature', 30, { min: 18, max: 26 });
    expect(b?.alertType).toBe('Temperature High');
    expect(b?.thresholdValue).toBe(26);
    expect(b?.actualValue).toBe(30);
  });

  it('di bawah min → Low dengan thresholdValue = min', () => {
    const b = evaluateParameter('humidity', 30, { min: 40, max: 65 });
    expect(b?.alertType).toBe('Humidity Low');
    expect(b?.thresholdValue).toBe(40);
  });

  it('tekanan diferensial (ΔP) dievaluasi sama', () => {
    expect(evaluateParameter('pressure', 1, { min: 2.5, max: 15 })?.alertType).toBe('Pressure Low');
    expect(evaluateParameter('pressure', 20, { min: 2.5, max: 15 })?.alertType).toBe('Pressure High');
  });

  it('nilai null / tanpa threshold → null (tidak ada alert palsu)', () => {
    expect(evaluateParameter('pressure', null, { min: 2.5, max: 15 })).toBeNull();
    expect(evaluateParameter('temperature', 24, undefined)).toBeNull();
  });

  it('tepat di batas min/max masih normal', () => {
    expect(evaluateParameter('temperature', 18, { min: 18, max: 26 })).toBeNull();
    expect(evaluateParameter('temperature', 26, { min: 18, max: 26 })).toBeNull();
  });
});

describe('evaluateReading — satu bacaan lengkap', () => {
  it('R06 normal → tanpa pelanggaran', () => {
    expect(
      evaluateReading(
        { humidity: 60, temperature: 23, pressure: 8 },
        DEFAULT_THRESHOLDS.R06,
      ),
    ).toEqual([]);
  });

  it('R06 ΔP di bawah 2.5 Pa → Pressure Low', () => {
    const out = evaluateReading(
      { humidity: 60, temperature: 23, pressure: 1.0 },
      DEFAULT_THRESHOLDS.R06,
    );
    expect(out).toHaveLength(1);
    expect(out[0].alertType).toBe('Pressure Low');
  });

  it('beberapa parameter sekaligus → beberapa pelanggaran', () => {
    const out = evaluateReading(
      { humidity: 90, temperature: 30, pressure: null },
      DEFAULT_THRESHOLDS.R06,
    );
    expect(out.map((b) => b.alertType).sort()).toEqual([
      'Humidity High',
      'Temperature High',
    ]);
  });

  it('R03 dingin (−18 °C) normal; −25 °C → Temperature Low', () => {
    expect(
      evaluateReading({ humidity: 70, temperature: -18, pressure: null }, DEFAULT_THRESHOLDS.R03),
    ).toEqual([]);
    const out = evaluateReading(
      { humidity: 70, temperature: -25, pressure: null },
      DEFAULT_THRESHOLDS.R03,
    );
    expect(out[0].alertType).toBe('Temperature Low');
    expect(out[0].thresholdValue).toBe(-22);
  });
});

describe('alertKey — dedup', () => {
  it('kunci sama untuk ruangan+parameter+tipe yang sama', () => {
    expect(alertKey('R06', 'pressure', 'Pressure High')).toBe(
      alertKey('R06', 'pressure', 'Pressure High'),
    );
    expect(alertKey('R06', 'pressure', 'Pressure High')).not.toBe(
      alertKey('R06', 'pressure', 'Pressure Low'),
    );
    expect(alertKey('R06', 'pressure', 'Pressure High')).not.toBe(
      alertKey('R05', 'pressure', 'Pressure High'),
    );
  });
});

describe('monitoring-only — TIDAK ADA publish', () => {
  it('mqttService tidak memiliki method publish sama sekali', () => {
    const svc = mqttService as unknown as Record<string, unknown>;
    expect(svc.publish).toBeUndefined();
    expect(svc.publishCommand).toBeUndefined();
  });

  it('simulasi tidak pernah memanggil connect broker (nol panggilan)', () => {
    const connectSpy = vi.spyOn(mqttService, 'connect');
    startSimulation();
    vi.advanceTimersByTime(30_000);
    expect(connectSpy).not.toHaveBeenCalled();
    expect(useIiotStore.getState().brokerStatus).toBe('DISCONNECTED');
  });
});
