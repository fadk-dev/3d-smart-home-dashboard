// Panel perangkat — SRS §7 (Devices), FR-08, UC-03.
// Tabel 9 node: device_id, ruangan, lokasi, sensor, status, last_seen,
// toggle aktif/nonaktif (admin saja). Monitoring-only: tidak ada kontrol
// aktuator — toggle hanya menghentikan/mengaktifkan penerimaan data node.
import { useEffect, useState } from 'react';
import { NODES, roomById } from '../config/devices';
import { PARAMETER_META } from '../config';
import { effectiveDeviceStatus, useIiotStore } from '../store/useStore';

function fmtTime(ts: number | null): string {
  if (!ts) return '--';
  return new Date(ts).toLocaleTimeString('id-ID', { hour12: false });
}

export default function DevicePanel() {
  const devices = useIiotStore((s) => s.devices);
  const role = useIiotStore((s) => s.role);
  const setDeviceEnabled = useIiotStore((s) => s.setDeviceEnabled);
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const now = Date.now();
  const isAdmin = role === 'ADMIN';

  return (
    <section className="panel" aria-label="Perangkat">
      <h2>Perangkat — 9 Node Sensor</h2>
      {!isAdmin && (
        <p className="warn-banner">
          Peran Operator Produksi bersifat read-only: pengaktifan/nonaktif perangkat hanya
          untuk Administrator.
        </p>
      )}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Device ID</th>
              <th>Ruangan</th>
              <th>Lokasi</th>
              <th>Sensor</th>
              <th>Status</th>
              <th>Terakhir terlihat</th>
              <th>Aktif</th>
            </tr>
          </thead>
          <tbody>
            {NODES.map((n) => {
              const dev = devices[n.deviceId];
              const status = dev ? effectiveDeviceStatus(dev, now) : 'STALE';
              const tone =
                status === 'ONLINE' ? 'green' : status === 'STALE' ? 'amber' : status === 'OFFLINE' ? 'red' : 'grey';
              return (
                <tr key={n.deviceId}>
                  <td>
                    <code>{n.deviceId}</code>
                  </td>
                  <td>
                    {n.roomId} — {roomById(n.roomId).name}
                  </td>
                  <td>{n.location}</td>
                  <td>{n.sensors.map((s) => PARAMETER_META[s].label).join(' + ')}</td>
                  <td>
                    <span className={`state-badge ${tone}`}>{status}</span>
                  </td>
                  <td>{fmtTime(dev?.lastSeen ?? null)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={!isAdmin}
                      title={
                        isAdmin
                          ? dev?.enabled
                            ? 'Nonaktifkan node (berhenti memancarkan data)'
                            : 'Aktifkan node'
                          : 'Hanya Administrator yang dapat mengubah status perangkat'
                      }
                      aria-label={`${dev?.enabled ? 'Nonaktifkan' : 'Aktifkan'} ${n.deviceId}`}
                      onClick={() => setDeviceEnabled(n.deviceId, !dev?.enabled)}
                    >
                      {dev?.enabled ? 'Aktif' : 'Nonaktif'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">
        Node yang dinonaktifkan berhenti memancarkan data (simulasi) dan tidak memicu alert
        Device Offline. Status STALE = ada bacaan, tapi sudah &gt; 3 menit tanpa bacaan baru.
      </p>
    </section>
  );
}
