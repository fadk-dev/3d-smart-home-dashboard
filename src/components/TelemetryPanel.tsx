// Panel telemetri — SRS §5.1, UI-03/04/09, §5.4, §9.1/9.5.
// Nilai yang belum tersedia tampil "--", bukan 0. Grafik Recharts menampilkan
// 60 titik histori terakhir (suhu + kelembapan).
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
import { telemetryFreshness, useSmartHome } from '../store/useStore';

function fmtTime(ts: number | null): string {
  if (!ts) return '--';
  return new Date(ts).toLocaleTimeString('id-ID', { hour12: false });
}

export default function TelemetryPanel() {
  const telemetry = useSmartHome((s) => s.telemetry);
  const history = useSmartHome((s) => s.history);
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const freshness = telemetryFreshness(telemetry, Date.now());
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

  const chartData = history.map((p) => ({
    waktu: new Date(p.t).toLocaleTimeString('id-ID', { hour12: false }),
    suhu: p.temperatureC,
    kelembapan: p.humidityPct ?? null,
  }));

  return (
    <section className="panel" aria-label="Telemetri">
      <h2>Telemetri — Ruang Tamu (esp32_01)</h2>
      <div className="telemetry-grid">
        <div className="metric">
          <span className="metric-label">Suhu</span>
          <strong className="metric-value">
            {telemetry ? `${telemetry.temperatureC.toFixed(1)} °C` : '--'}
          </strong>
        </div>
        <div className="metric">
          <span className="metric-label">Kelembapan</span>
          <strong className="metric-value">
            {telemetry?.humidityPct !== undefined
              ? `${telemetry.humidityPct.toFixed(1)} %RH`
              : '--'}
          </strong>
        </div>
        <div className="metric">
          <span className="metric-label">Tekanan</span>
          <strong className="metric-value">
            {telemetry?.pressureHpa !== undefined
              ? `${telemetry.pressureHpa.toFixed(1)} hPa`
              : '--'}
          </strong>
        </div>
      </div>
      <div className="freshness-row">
        <span>
          Update terakhir: <strong>{fmtTime(telemetry?.receivedAt ?? null)}</strong>
        </span>
        <span
          className="freshness-badge"
          style={{ background: freshnessBg[freshnessTone], color: freshnessFg[freshnessTone] }}
        >
          {freshness === 'CURRENT'
            ? '● CURRENT'
            : freshness === 'STALE'
              ? '● STALE — data lama, bukan real-time'
              : '● UNAVAILABLE'}
        </span>
      </div>
      {chartData.length > 0 ? (
        <div style={{ width: '100%', height: 180 }} role="img" aria-label="Grafik histori suhu dan kelembapan">
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d5" />
              <XAxis dataKey="waktu" tick={{ fontSize: 10 }} minTickGap={40} />
              <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="suhu"
                name="Suhu (°C)"
                stroke="#d97706"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="kelembapan"
                name="Kelembapan (%RH)"
                stroke="#2563eb"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="empty">Belum ada data telemetri — menunggu pesan pertama.</p>
      )}
      <p className="hint">Histori: {history.length}/60 titik • interval baseline 2 detik</p>
    </section>
  );
}
