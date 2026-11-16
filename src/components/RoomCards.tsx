// Kartu 9 ruangan MVP (FR-04) + strip alur produksi (SRS §3.2).
// Klik kartu (atau ruangan di 3D) memilih ruangan untuk panel telemetri.
import { useEffect, useState } from 'react';
import { FLOW, ROOMS, nodesForRoom } from '../config/devices';
import { computeRoomStatus, roomFreshness, useIiotStore } from '../store/useStore';
import type { RoomStatus } from '../store/useStore';

function fmtVal(v: number | null | undefined): string {
  if (v === null || v === undefined) return '--';
  return v.toFixed(1);
}

function fmtTime(ts: number | null): string {
  if (!ts) return '--';
  return new Date(ts).toLocaleTimeString('id-ID', { hour12: false });
}

export function FlowStrip(props: { compact?: boolean }) {
  return (
    <nav className="flow-strip" aria-label="Alur produksi">
      <span className="flow-title">Alur produksi:</span>
      {FLOW.map((id, i) => (
        <span key={id} className="flow-step">
          {i > 0 && <span className="flow-arrow" aria-hidden="true">→</span>}
          <span className="flow-chip">{id}</span>
        </span>
      ))}
      {!props.compact && (
        <span className="flow-note">R01 → R02 → R03 → R04 → R05 → R06 → R07A → R07B → R08 (SRS §3.2)</span>
      )}
    </nav>
  );
}

const STATUS_LABEL: Record<RoomStatus, string> = {
  NORMAL: 'Normal',
  WARNING: 'Alert aktif',
  OFFLINE: 'Offline',
  NO_DATA: 'Tanpa data',
};

export default function RoomCards() {
  const rooms = useIiotStore((s) => s.rooms);
  const devices = useIiotStore((s) => s.devices);
  const alerts = useIiotStore((s) => s.alerts);
  const selectedRoomId = useIiotStore((s) => s.selectedRoomId);
  const setSelected = useIiotStore((s) => s.setSelectedRoomId);
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  const now = Date.now();

  return (
    <section aria-label="Kartu ruangan">
      <div className="room-cards">
        {ROOMS.map((room) => {
          const runtime = rooms[room.id];
          const status = computeRoomStatus(room.id, { rooms, devices, alerts }, now);
          const freshness = roomFreshness(runtime, now);
          const latest = runtime.latest;
          const nodes = nodesForRoom(room.id);
          const tone =
            status === 'NORMAL' ? 'green' : status === 'WARNING' ? 'amber' : status === 'OFFLINE' ? 'red' : 'grey';
          return (
            <article
              key={room.id}
              className={`room-card tone-${tone}${selectedRoomId === room.id ? ' selected' : ''}`}
              onClick={() => setSelected(room.id)}
              role="button"
              tabIndex={0}
              aria-label={`${room.id} ${room.name} — ${STATUS_LABEL[status]}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelected(room.id);
                }
              }}
            >
              <div className="room-card-head">
                <div>
                  <strong>
                    {room.id} — {room.name}
                  </strong>
                  <span className="device-id">{nodes.map((n) => n.deviceId).join(' • ')}</span>
                </div>
                <span className={`state-badge ${tone}`}>{STATUS_LABEL[status]}</span>
              </div>
              <div className="room-values">
                <span>
                  Hum <strong>{latest ? `${fmtVal(latest.humidity)} %RH` : '--'}</strong>
                </span>
                <span>
                  Temp <strong>{latest ? `${fmtVal(latest.temperature)} °C` : '--'}</strong>
                </span>
                {room.hasPressure && (
                  <span>
                    ΔP <strong>{latest?.pressure !== null && latest?.pressure !== undefined ? `${fmtVal(latest.pressure)} Pa` : '--'}</strong>
                  </span>
                )}
              </div>
              <div className="room-meta">
                <span>
                  Update: <strong>{fmtTime(runtime.receivedAt)}</strong>
                </span>
                <span>
                  Freshness: <strong>{freshness}</strong>
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
