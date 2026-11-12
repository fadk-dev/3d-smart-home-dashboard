// Command Manager — SRS §4.3, FR-06/07/08/10, AC-03/04/05/07, NFR-02/04/05.
// Satu-satunya jalur pengiriman perintah lampu, dipakai panel 2D maupun klik
// objek 3D. Aturan:
//  - Mode SIMULATION: TIDAK PERNAH publish ke broker live (FR-19); perintah
//    dijawab oleh simulasi dengan requestId yang sama.
//  - Mode LIVE: publish QoS 1, retain false; pending ditampilkan ≤100 ms
//    (langsung, sinkron di store); timeout default 3000 ms (NFR-04).
//  - Confirmed state HANYA berasal dari pesan state (NFR-05) — publish yang
//    sukses bukan bukti aktuator berubah.
import { deviceById } from '../config/devices';
import type { LampState } from '../config';
import { buildLampCommand, validateLampCommand } from '../lib/validate';
import { effectiveAvailability, useSmartHome } from '../store/useStore';
import { mqttService } from './client';
import { simulateLampCommand } from '../sim/simulation';

export interface CommandResult {
  ok: boolean;
  reason?: string;
  requestId?: string;
}

/** Kirim perintah lampu ke target state eksplisit (bukan toggle) — SRS §6.5. */
export function sendLampCommand(deviceId: string, targetState: LampState): CommandResult {
  const store = useSmartHome.getState();
  const device = deviceById(deviceId);
  if (!device) return { ok: false, reason: `Perangkat tidak dikenal: ${deviceId}` };

  const dev = store.devices[deviceId];
  if (!dev) return { ok: false, reason: 'Perangkat tidak dikenal' };
  if (dev.pending) {
    return { ok: false, reason: 'Masih ada perintah yang menunggu konfirmasi' };
  }
  if (dev.confirmedState === targetState) {
    return { ok: false, reason: `Lampu sudah ${targetState}` };
  }

  const availability = effectiveAvailability(dev, Date.now());
  if (store.mode === 'SIMULATION') {
    // Jalur simulasi — tidak menyentuh mqttService sama sekali (FR-19).
    const cmd = buildLampCommand(deviceId, targetState);
    const v = validateLampCommand(cmd);
    if (!v.ok) return { ok: false, reason: v.error };
    store.startPending(deviceId, {
      requestId: cmd.requestId,
      targetState,
      issuedAt: cmd.issuedAt,
    });
    store.addEvent(
      'command',
      `[SIM] ${device.roomName}: perintah ${targetState} (${cmd.requestId})`,
    );
    simulateLampCommand(device, cmd);
    scheduleTimeout(deviceId, cmd.requestId, store.commandTimeoutMs);
    return { ok: true, requestId: cmd.requestId };
  }

  // Mode LIVE
  if (store.brokerStatus !== 'CONNECTED') {
    return { ok: false, reason: 'Broker belum terhubung' };
  }
  if (availability !== 'ONLINE') {
    return {
      ok: false,
      reason: `Perangkat ${availability.toLowerCase()} — kontrol dinonaktifkan`,
    };
  }
  const cmd = buildLampCommand(deviceId, targetState);
  const v = validateLampCommand(cmd);
  if (!v.ok) return { ok: false, reason: v.error };
  // Pending langsung ditulis ke store (feedback ≤100 ms, NFR-02).
  store.startPending(deviceId, {
    requestId: cmd.requestId,
    targetState,
    issuedAt: cmd.issuedAt,
  });
  store.addEvent(
    'command',
    `${device.roomName}: perintah ${targetState} (${cmd.requestId})`,
  );
  const published = mqttService.publishCommand(deviceId, cmd);
  if (!published) {
    // Publish gagal di transport — batalkan pending, jangan klaim terkirim.
    store.markCommandTimeout(deviceId, cmd.requestId);
    return { ok: false, reason: 'Gagal mengirim perintah ke broker' };
  }
  scheduleTimeout(deviceId, cmd.requestId, store.commandTimeoutMs);
  return { ok: true, requestId: cmd.requestId };
}

/** Toggle lampu: target = kebalikan confirmed state (atau ON bila belum diketahui). */
export function toggleLamp(deviceId: string): CommandResult {
  const dev = useSmartHome.getState().devices[deviceId];
  if (!dev) return { ok: false, reason: 'Perangkat tidak dikenal' };
  const target: LampState = dev.confirmedState === 'ON' ? 'OFF' : 'ON';
  return sendLampCommand(deviceId, target);
}

function scheduleTimeout(deviceId: string, requestId: string, timeoutMs: number): void {
  setTimeout(() => {
    useSmartHome.getState().markCommandTimeout(deviceId, requestId);
  }, timeoutMs);
}
