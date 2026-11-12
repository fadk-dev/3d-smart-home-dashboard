// Panel alert — SRS §7 (Alerts), FR-07, UC-08/09.
// Daftar alert dengan filter ruangan/status; Acknowledge + Resolve (admin saja).
// Dedup: satu alert aktif per (ruangan, parameter, tipe); auto-resolve saat
// nilai kembali normal ditangani store.
import { useState } from 'react';
import { ROOMS } from '../config/devices';
import type { AlertStatus } from '../config';
import { alertParameterLabel } from '../mqtt/commandService';
import { useIiotStore } from '../store/useStore';

function fmtTime(ts: number | null): string {
  if (!ts) return '--';
  return new Date(ts).toLocaleString('id-ID', { hour12: false });
}

export default function AlertsPanel() {
  const alerts = useIiotStore((s) => s.alerts);
  const role = useIiotStore((s) => s.role);
  const acknowledgeAlert = useIiotStore((s) => s.acknowledgeAlert);
  const resolveAlert = useIiotStore((s) => s.resolveAlert);
  const [roomFilter, setRoomFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const isAdmin = role === 'ADMIN';

  const filtered = alerts
    .filter((a) => (roomFilter === 'ALL' ? true : a.roomId === roomFilter))
    .filter((a) => (statusFilter === 'ALL' ? true : a.status === (statusFilter as AlertStatus)))
    .sort((a, b) => b.createdAt - a.createdAt);

  const activeCount = alerts.filter((a) => a.status === 'Active').length;

  return (
    <section className="panel" aria-label="Alert">
      <h2>
        Alert — {activeCount} aktif dari {alerts.length} total
      </h2>
      {!isAdmin && (
        <p className="warn-banner">
          Peran Operator Produksi bersifat read-only: acknowledge/resolve alert hanya untuk
          Administrator.
        </p>
      )}
      <div className="filter-row">
        <label className="field-inline">
          <span>Ruangan</span>
          <select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)} aria-label="Filter ruangan">
            <option value="ALL">Semua ruangan</option>
            {ROOMS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} — {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field-inline">
          <span>Status</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter status">
            <option value="ALL">Semua status</option>
            <option value="Active">Active</option>
            <option value="Acknowledged">Acknowledged</option>
            <option value="Resolved">Resolved</option>
          </select>
        </label>
      </div>
      {filtered.length === 0 ? (
        <p className="empty">Tidak ada alert yang cocok dengan filter.</p>
      ) : (
        <ol className="alert-list">
          {filtered.map((a) => {
            const tone = a.status === 'Active' ? 'red' : a.status === 'Acknowledged' ? 'amber' : 'green';
            return (
              <li key={a.id} className="alert-item">
                <div className="alert-head">
                  <strong>{a.alertType}</strong>
                  <span className={`state-badge ${tone}`}>{a.status}</span>
                </div>
                <div className="alert-meta">
                  <span>
                    {a.roomId} • {a.deviceId}
                  </span>
                  <span>Parameter: {alertParameterLabel(a.parameter)}</span>
                  <span>
                    Nilai aktual:{' '}
                    <strong>{a.actualValue !== null ? a.actualValue : '--'}</strong>
                  </span>
                  <span>
                    Threshold:{' '}
                    <strong>{a.thresholdValue !== null ? a.thresholdValue : '--'}</strong>
                  </span>
                  <span>Dibuat: {fmtTime(a.createdAt)}</span>
                  {a.resolvedAt && <span>Resolve: {fmtTime(a.resolvedAt)}</span>}
                </div>
                <div className="alert-actions">
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={!isAdmin || a.status !== 'Active'}
                    title={
                      isAdmin
                        ? 'Tandai alert sudah ditindaklanjuti'
                        : 'Hanya Administrator yang dapat acknowledge alert'
                    }
                    onClick={() => acknowledgeAlert(a.id)}
                  >
                    Acknowledge
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={!isAdmin || a.status === 'Resolved'}
                    title={
                      isAdmin
                        ? 'Tandai alert selesai'
                        : 'Hanya Administrator yang dapat resolve alert'
                    }
                    onClick={() => resolveAlert(a.id)}
                  >
                    Resolve
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
