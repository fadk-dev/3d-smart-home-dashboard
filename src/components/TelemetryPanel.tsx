// Panel telemetri ruangan terpilih — SRS §3.1, FR-04.
// Nilai besar + freshness + grafik histori Recharts (pemilih parameter) +
// daftar node ruangan (R07 punya 2 node) + rentang threshold.
// Nilai yang belum tersedia tampil "--", bukan 0.
import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PARAMETER_META } from '../config';
import type { Parameter } from '../config';
import { nodesForRoom, roomById } from '../config/devices';
import { effectiveDeviceStatus, roomFreshness, useIiotStore } from '../store/useStore';

function fmtTime(ts: number | null): string {
  if (!ts) return '--';
  return new Date(ts).toLocaleTimeString('id-ID', { hour12: false });
}

function fmtVal(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return '--';
  return v.toFixed(digits);
}

export default function TelemetryPanel() {
  const selectedRoomId = useIiotStore((s) => s.selectedRoomId);
  const room = useIiotStore((s) => s.rooms[s.selectedRoomId]);
  const devices = useIiotStore((s) => s.devices);
  const thresholds = useIiotStore((s) => s.thresholds[s.selectedRoomId]);
  const [param, setParam] = useState<Parameter>('temperature');
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const cfg = roomById(selectedRoomId);
  const latest = room.latest;
  const freshness = roomFreshness(room, Date.now());
  const freshnessTone =
    freshness === 'CURRENT' ? 'green' : freshness === 'STALE' ? 'amber' : 'grey';
  const freshnessBg: Record<string, string> = {
    green: '#e6f4ea',
    amber: '#fef3c7',
    grey: '#eceff1',
  };
  const freshnessFg: Record<string, string> = {
    green: '#137333',
    amber: '#92400e',
    grey: '#455a64',
  };

  const params: Parameter[] = cfg.hasPressure
    ? ['humidity', 'temperature', 'pressure']
    : ['humidity', 'temperature'];
  const shownParam = params.includes(param) ? param : 'temperature';

  const chartData = room.history.map((p) => ({
    waktu: new Date(p.t).toLocaleTimeString('id-ID', { hour12: false }),
    nilai: p[shownParam],
  }));
  const meta = PARAMETER_META[shownParam];
  const range = thresholds[shownParam];

  return (
    <section className="panel" aria-label="Telemetri ruangan terpilih">
      <h2>
        {cfg.id} — {cfg.name}
      </h2>
      <p className="hint" style={{ marginTop: -6 }}>
        {cfg.description}
      </p>
      <div className="telemetry-grid">
        <div className="metric">
          <span className="metric-label">Kelembapan</span>
          <strong className="metric-value">
            {latest ? `${fmtVal(latest.humidity)} %RH` : '--'}
          </strong>
          <span className="metric-range">
            {thresholds.humidity ? `${thresholds.humidity.min}–${thresholds.humidity.max} %RH` : ''}
          </span>
        </div>
        <div className="metric">
          <span className="metric-label">Suhu</span>
          <strong className="metric-value">
            {latest ? `${fmtVal(latest.temperature)} °C` : '--'}
          </strong>
          <span className="metric-range">
            {thresholds.temperature
              ? `${thresholds.temperature.min}–${thresholds.temperature.max} °C`
              : ''}
          </span>
        </div>
        {cfg.hasPressure && (
          <div className="metric">
            <span className="metric-label">ΔP vs R05</span>
            <strong className="metric-value">
              {latest?.pressure !== null && latest?.pressure !== undefined
                ? `${fmtVal(latest.pressure)} Pa`
                : '--'}
            </strong>
            <span className="metric-range">
              {thresholds.pressure ? `${thresholds.pressure.min}–${thresholds.pressure.max} Pa` : ''}
            </span>
          </div>
        )}
      </div>
      <div className="freshness-row">
        <span>
          Update terakhir: <strong>{fmtTime(room.receivedAt)}</strong>
          {room.latestDeviceId ? ` • ${room.latestDeviceId}` : ''}
        </span>
        <span
          className="freshness-badge"
          style={{ background: freshnessBg[freshnessTone], color: freshnessFg[freshnessTone] }}
        >
          {freshness === 'CURRENT'
            ? '● CURRENT'
            : freshness === 'STALE'
              ? '● STALE — data lama'
              : '● UNAVAILABLE'}
        </span>
      </div>

      <div className="field-row" style={{ marginTop: 12 }}>
        <span className="field-label">Parameter grafik</span>
        <div className="segmented" role="group" aria-label="Parameter grafik">
          {params.map((p) => (
            <button
              key={p}
              type="button"
              className={shownParam === p ? 'active' : ''}
              aria-pressed={shownParam === p}
              onClick={() => setParam(p)}
            >
              {PARAMETER_META[p].label}
            </button>
          ))}
        </div>
      </div>
      {chartData.length > 0 ? (
        <div style={{ width: '100%', height: 180 }} role="img" aria-label={`Grafik histori ${meta.label} ${cfg.name}`}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d5" />
              <XAxis dataKey="waktu" tick={{ fontSize: 10 }} minTickGap={40} />
              <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
              <Tooltip formatter={(v) => [`${v ?? '--'} ${meta.unit}`, meta.label]} />
              <Line
                type="monotone"
                dataKey="nilai"
                name={`${meta.label} (${meta.unit})`}
                stroke="#b45309"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="empty">Belum ada data telemetri — menunggu bacaan pertama.</p>
      )}
      <p className="hint">
        Histori: {room.history.length}/{240} titik di memori • threshold:{' '}
        {range ? `${range.min}–${range.max} ${range.unit}` : '--'}
      </p>

      <h3 className="subhead">Node sensor ruangan ini</h3>
      <ul className="node-list">
        {nodesForRoom(selectedRoomId).map((n) => {
          const dev = devices[n.deviceId];
          const st = dev ? effectiveDeviceStatus(dev, Date.now()) : 'STALE';
          const lr = dev?.lastReading;
          return (
            <li key={n.deviceId}>
              <code>{n.deviceId}</code>
              <span>
                {st} • terakhir {fmtTime(dev?.lastSeen ?? null)}
              </span>
              <span>
                {lr
                  ? `Hum ${fmtVal(lr.humidity)} %RH • Temp ${fmtVal(lr.temperature)} °C` +
                    (lr.pressure !== null ? ` • ΔP ${fmtVal(lr.pressure)} Pa` : '')
                  : '--'}
              </span>
              <span className="device-loc">{n.location}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
