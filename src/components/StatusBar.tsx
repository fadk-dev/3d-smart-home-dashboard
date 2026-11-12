// Status bar atas — SRS §5.1, UI-07/08, NFR-14.
// Tiga status yang BERBEDA selalu terlihat: mode aplikasi, koneksi broker,
// dan availability perangkat (FR-13, AC-09).
import { useEffect, useState } from 'react';
import { effectiveAvailability, useSmartHome } from '../store/useStore';
import { DEVICES } from '../config/devices';

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
  const mode = useSmartHome((s) => s.mode);
  const brokerStatus = useSmartHome((s) => s.brokerStatus);
  const devices = useSmartHome((s) => s.devices);
  const [, setNow] = useState(Date.now());
  // Tick 1 detik agar STALE availability ikut berubah tanpa pesan baru (§4.4).
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const now = Date.now();
  const availabilities = DEVICES.map(
    (d) => effectiveAvailability(devices[d.deviceId], now),
  );
  const onlineCount = availabilities.filter((a) => a === 'ONLINE').length;
  const anyOffline = availabilities.includes('OFFLINE');
  const deviceTone = onlineCount === DEVICES.length ? 'green' : anyOffline ? 'red' : 'amber';
  const deviceLabel =
    onlineCount === DEVICES.length
      ? `Perangkat: ${onlineCount}/${DEVICES.length} ONLINE`
      : `Perangkat: ${onlineCount}/${DEVICES.length} online${anyOffline ? ' • ada OFFLINE' : ' • belum pasti'}`;

  const brokerTone =
    brokerStatus === 'CONNECTED'
      ? 'green'
      : brokerStatus === 'CONNECTING'
        ? 'amber'
        : brokerStatus === 'ERROR'
          ? 'red'
          : 'grey';
  const sceneTone = props.sceneStatus === 'READY' ? 'green' : props.sceneStatus === 'ERROR' ? 'red' : 'amber';

  return (
    <header className="statusbar">
      <div className="brand">
        <span className="brand-mark">⌂</span>
        <div>
          <strong>Smart Home 3D</strong>
          <span className="brand-sub">Denah 10 × 12 m • 1 lantai • ~90 m²</span>
        </div>
      </div>
      <div className="badges" role="status" aria-label="Status sistem">
        <Badge label={mode === 'LIVE' ? '● LIVE' : '● SIMULATION'} tone={mode === 'LIVE' ? 'blue' : 'amber'} />
        <Badge label={`Broker: ${brokerStatus}`} tone={brokerTone} />
        <Badge label={deviceLabel} tone={deviceTone} />
        <Badge label={`Scene: ${props.sceneStatus}`} tone={sceneTone} />
      </div>
    </header>
  );
}
