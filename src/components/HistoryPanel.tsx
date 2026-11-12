// Panel riwayat — SRS §7 (Sensor Readings), FR-05, UC-07.
// Pilih ruangan + parameter + rentang tanggal (dalam data tersimpan) → grafik,
// tabel histori, ekspor CSV. Data dibaca dari IndexedDB (bukan hanya memori).
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
import type { Parameter, RoomId } from '../config';
import { ROOMS, nodesForRoom } from '../config/devices';
import { db } from '../lib/db';
import type { ReadingRecord } from '../lib/db';
import { buildCsv } from '../lib/csv';

function toInputValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString('id-ID', { hour12: false });
}

export default function HistoryPanel() {
  const [roomId, setRoomId] = useState<RoomId>('R06');
  const [param, setParam] = useState<Parameter>('temperature');
  const [from, setFrom] = useState<string>(() => toInputValue(Date.now() - 2 * 60 * 60 * 1000));
  const [to, setTo] = useState<string>(() => toInputValue(Date.now()));
  const [rows, setRows] = useState<ReadingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>('');

  const room = ROOMS.find((r) => r.id === roomId) ?? ROOMS[0];
  const params: Parameter[] = room.hasPressure
    ? ['humidity', 'temperature', 'pressure']
    : ['humidity', 'temperature'];
  const shownParam = params.includes(param) ? param : 'temperature';
  const meta = PARAMETER_META[shownParam];

  const load = async () => {
    const fromMs = Date.parse(from);
    const toMs = Date.parse(to);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) {
      setMessage('Rentang tanggal tidak valid: "dari" harus sebelum "sampai".');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const devices = nodesForRoom(roomId).map((n) => n.deviceId);
      const all: ReadingRecord[] = [];
      for (const d of devices) {
        const r = await db.getReadings(d, fromMs, toMs, 2000);
        all.push(...r);
      }
      all.sort((a, b) => a.ts - b.ts);
      setRows(all);
      setMessage(
        all.length === 0
          ? 'Tidak ada data pada rentang tersebut (data tersimpan maks. 2 jam terakhir di-seed + data live).'
          : `${all.length} bacaan ditemukan.`,
      );
    } catch {
      setMessage('Gagal membaca IndexedDB — periksa dukungan browser Anda.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chartData = rows.map((r) => ({
    waktu: new Date(r.ts).toLocaleTimeString('id-ID', { hour12: false }),
    nilai: r[shownParam],
    device: r.deviceId,
  }));

  const exportCsv = () => {
    if (rows.length === 0) return;
    const blob = new Blob([buildCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `riwayat-${roomId}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel" aria-label="Riwayat">
      <h2>Riwayat — Grafik, Tabel &amp; Ekspor CSV</h2>
      <div className="history-controls">
        <label className="field-inline">
          <span>Ruangan</span>
          <select
            value={roomId}
            onChange={(e) => setRoomId(e.target.value as RoomId)}
            aria-label="Pilih ruangan"
          >
            {ROOMS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} — {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field-inline">
          <span>Parameter</span>
          <select
            value={shownParam}
            onChange={(e) => setParam(e.target.value as Parameter)}
            aria-label="Pilih parameter"
          >
            {params.map((p) => (
              <option key={p} value={p}>
                {PARAMETER_META[p].label} ({PARAMETER_META[p].unit})
              </option>
            ))}
          </select>
        </label>
        <label className="field-inline">
          <span>Dari</span>
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="Tanggal mulai"
          />
        </label>
        <label className="field-inline">
          <span>Sampai</span>
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="Tanggal selesai"
          />
        </label>
        <button type="button" className="btn btn-primary" onClick={() => void load()} disabled={loading}>
          {loading ? 'Memuat…' : 'Tampilkan'}
        </button>
        <button type="button" className="btn" onClick={exportCsv} disabled={rows.length === 0}>
          Ekspor CSV
        </button>
      </div>
      {message && <p className="hint" role="status">{message}</p>}

      {chartData.length > 0 && (
        <div style={{ width: '100%', height: 260 }} role="img" aria-label={`Grafik histori ${meta.label} ${room.name}`}>
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
      )}

      {rows.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Device</th>
                <th>Kelembapan (%RH)</th>
                <th>Suhu (°C)</th>
                <th>ΔP (Pa)</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(-100).map((r) => (
                <tr key={r.id}>
                  <td>{fmtDateTime(r.ts)}</td>
                  <td>
                    <code>{r.deviceId}</code>
                  </td>
                  <td>{r.humidity !== null ? r.humidity.toFixed(1) : '--'}</td>
                  <td>{r.temperature !== null ? r.temperature.toFixed(1) : '--'}</td>
                  <td>{r.pressure !== null ? r.pressure.toFixed(1) : '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">Menampilkan maks. 100 baris terakhir dari hasil query.</p>
        </div>
      )}
    </section>
  );
}
