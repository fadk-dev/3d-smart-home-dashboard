// Status bar atas — SRS IIoT Catering v1.1 FR-04, FR-07.
// Status yang selalu terlihat: mode aplikasi, koneksi broker, hitungan ruangan
// (normal / alert / offline), jumlah alert aktif, dan peran UI.
import { useEffect, useState } from 'react';
import {
  activeAlertCount,
  computeRoomStatus,
  useIiotStore,
} from '../store/useStore';
import { ROOMS } from '../config/devices';
import type { UserRole } from '../config';

function Badge(props: { label: string; tone: 'green' | 'amber' | 'red' | 'grey' | 'blue' }) {
  const colors: Record<string, string> = {
    green: '#e6f4ea,#137333',
    amber: '#fef3c7,#92400e',
    red: '#fde8e8,#991b1b',
    grey: '#eceff1,#455a64',
    blue: '#e3f2fd,#1565c0',
  };
  const [bg, fg] = (colors[props.tone] ?? colors.grey).split(',');
  return (
    <span
      style={{
        background: bg,
        color: fg,
        borderRadius: 999,
        padding: '3px 10px',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.3,
        whiteSpace: 'nowrap',
      }}
    >
      {props.label}
    </span>
  );
}

export default function StatusBar(props: { sceneStatus: string }) {
  const mode = useIiotStore((s) => s.mode);
  const brokerStatus = useIiotStore((s) => s.brokerStatus);
  const rooms = useIiotStore((s) => s.rooms);
  const devices = useIiotStore((s) => s.devices);
  const alerts = useIiotStore((s) => s.alerts);
  const role = useIiotStore((s) => s.role);
  const setRole = useIiotStore((s) => s.setRole);
  const [, setNow] = useState(Date.now());
  // Tick 5 detik agar status ruangan ikut berubah tanpa pesan baru.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const now = Date.now();
  const statuses = ROOMS.map((r) => computeRoomStatus(r.id, { rooms, devices, alerts }, now));
  const normalCount = statuses.filter((s) => s === 'NORMAL').length;
  const warningCount = statuses.filter((s) => s === 'WARNING').length;
  const offlineCount = statuses.filter((s) => s === 'OFFLINE').length;
  const noDataCount = statuses.filter((s) => s === 'NO_DATA').length;
  const activeAlerts = activeAlertCount(alerts);

  const brokerTone =
    brokerStatus === 'CONNECTED'
      ? 'green'
      : brokerStatus === 'CONNECTING'
        ? 'amber'
        : brokerStatus === 'ERROR'
          ? 'red'
          : 'grey';
  const sceneTone =
    props.sceneStatus === 'READY' ? 'green' : props.sceneStatus === 'ERROR' ? 'red' : 'amber';
  const roomsTone = offlineCount > 0 ? 'red' : warningCount > 0 ? 'amber' : 'green';

  return (
    <header className="statusbar">
      <div className="brand">
        <span className="brand-mark">🏭</span>
        <div>
          <strong>IIoT Catering — Monitoring Rumah Produksi</strong>
          <span className="brand-sub">Denah 12 × 10 m • 9 ruangan MVP • 9 node sensor • ΔP R06↔R05</span>
        </div>
      </div>
      <div className="badges" role="status" aria-label="Status sistem">
        <Badge label={mode === 'LIVE' ? '● LIVE' : '● SIMULATION'} tone={mode === 'LIVE' ? 'blue' : 'amber'} />
        <Badge label={`Broker: ${brokerStatus}`} tone={brokerTone} />
        <Badge
          label={`Ruangan: ${normalCount} normal • ${warningCount} alert • ${offlineCount} offline${noDataCount > 0 ? ` • ${noDataCount} tanpa data` : ''}`}
          tone={roomsTone}
        />
        <Badge label={`Alert aktif: ${activeAlerts}`} tone={activeAlerts > 0 ? 'red' : 'green'} />
        <Badge label={`Scene: ${props.sceneStatus}`} tone={sceneTone} />
        <label className="role-switch">
          <span>Peran</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            aria-label="Peran pengguna (UI lokal, tanpa autentikasi)"
          >
            <option value="ADMIN">Administrator</option>
            <option value="OPERATOR">Operator Produksi</option>
          </select>
        </label>
      </div>
    </header>
  );
}
