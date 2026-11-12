// Panel kontrol perangkat — SRS §5.1, UI-05/06/13, FR-07/08/09/10, AC-05/07.
// Satu kartu per lampu: confirmed state (hanya dari pesan state), pending
// target + spinner, TIMEOUT/UNKNOWN, tombol ON/OFF. Tombol dinonaktifkan
// dengan alasan yang jelas bila perangkat offline/unknown atau broker
// terputus dalam mode LIVE (§11).
import { useEffect, useState } from 'react';
import { DEVICES } from '../config/devices';
import { sendLampCommand } from '../mqtt/commandService';
import { effectiveAvailability, useSmartHome } from '../store/useStore';
import type { LampState } from '../config';

export default function DevicePanel() {
  const devices = useSmartHome((s) => s.devices);
  const mode = useSmartHome((s) => s.mode);
  const brokerStatus = useSmartHome((s) => s.brokerStatus);
  const selectedDeviceId = useSmartHome((s) => s.selectedDeviceId);
  const setSelected = useSmartHome((s) => s.setSelectedDeviceId);
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const now = Date.now();

  return (
    <section className="panel" aria-label="Kontrol perangkat">
      <h2>Kontrol Lampu</h2>
      <div className="device-list">
        {DEVICES.map((d) => {
          const dev = devices[d.deviceId];
          const availability = effectiveAvailability(dev, now);
          const confirmed = dev.confirmedState;
          const pending = dev.pending;
          const canControl =
            mode === 'SIMULATION'
              ? availability === 'ONLINE'
              : brokerStatus === 'CONNECTED' && availability === 'ONLINE';
          const disabledReason =
            mode === 'LIVE' && brokerStatus !== 'CONNECTED'
              ? 'Broker belum terhubung'
              : availability !== 'ONLINE'
                ? `Perangkat ${availability.toLowerCase()} — kontrol dinonaktifkan`
                : pending
                  ? 'Menunggu konfirmasi perangkat…'
                  : null;

          const statusLabel = pending
            ? `PENDING → ${pending.targetState}`
            : confirmed
              ? `ON` === confirmed
                ? 'ON'
                : 'OFF'
              : dev.lastOutcome === 'TIMEOUT'
                ? 'TIMEOUT'
                : 'UNKNOWN';
          const statusTone = pending
            ? 'amber'
            : confirmed === 'ON'
              ? 'green'
              : confirmed === 'OFF'
                ? 'grey'
                : 'red';

          const send = (target: LampState) => {
            const res = sendLampCommand(d.deviceId, target);
            if (!res.ok) {
              useSmartHome.getState().addEvent('info', `${d.roomName}: ${res.reason}`);
            }
          };

          return (
            <article
              key={d.deviceId}
              className={`device-card${selectedDeviceId === d.deviceId ? ' selected' : ''}`}
              onClick={() => setSelected(d.deviceId)}
            >
              <div className="device-head">
                <div>
                  <strong>{d.roomName}</strong>
                  <span className="device-id">
                    {d.roomId} / {d.deviceId}
                  </span>
                </div>
                <span className={`state-badge ${statusTone}`} aria-live="polite">
                  {pending && <span className="spinner" aria-hidden="true" />}
                  {statusLabel}
                </span>
              </div>
              <div className="device-meta">
                <span>
                  Terkonfirmasi:{' '}
                  <strong>{confirmed ?? '--'}</strong>
                </span>
                <span>
                  Availability: <strong>{availability}</strong>
                </span>
                {pending && (
                  <span>
                    Target pending: <strong>{pending.targetState}</strong>
                  </span>
                )}
                {dev.lastOutcome === 'TIMEOUT' && !pending && (
                  <span className="warn">
                    Perintah terakhir timeout — state terakhir dipertahankan; perangkat tidak
                    diklaim gagal.
                  </span>
                )}
              </div>
              <div className="device-actions" role="group" aria-label={`Kontrol lampu ${d.roomName}`}>
                <button
                  type="button"
                  className="btn btn-on"
                  disabled={!canControl || confirmed === 'ON'}
                  title={disabledReason ?? 'Nyalakan lampu'}
                  aria-label={`Nyalakan lampu ${d.roomName}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    send('ON');
                  }}
                >
                  ON
                </button>
                <button
                  type="button"
                  className="btn btn-off"
                  disabled={!canControl || confirmed === 'OFF'}
                  title={disabledReason ?? 'Matikan lampu'}
                  aria-label={`Matikan lampu ${d.roomName}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    send('OFF');
                  }}
                >
                  OFF
                </button>
              </div>
              {disabledReason && <p className="disabled-reason">{disabledReason}</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
