// Panel threshold — SRS §7 (Thresholds), FR-06, UC-05.
// Admin mengatur min/max per parameter per ruangan; tersimpan di IndexedDB.
// Nilai default adalah CONTOH AWAL (SRS tidak memberi angka) — wajib
// dikonfirmasi admin sebelum dipakai operasional.
import { useState } from 'react';
import { PARAMETER_META, PARAMETER_ORDER } from '../config';
import type { Parameter, RoomId } from '../config';
import { ROOMS } from '../config/devices';
import { useIiotStore } from '../store/useStore';

export default function ThresholdPanel() {
  const thresholds = useIiotStore((s) => s.thresholds);
  const role = useIiotStore((s) => s.role);
  const setThreshold = useIiotStore((s) => s.setThreshold);
  const [drafts, setDrafts] = useState<Record<string, { min: string; max: string }>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = role === 'ADMIN';

  const rows: Array<{ roomId: RoomId; roomName: string; param: Parameter }> = [];
  for (const room of ROOMS) {
    for (const param of PARAMETER_ORDER) {
      if (thresholds[room.id][param]) {
        rows.push({ roomId: room.id, roomName: room.name, param });
      }
    }
  }

  const save = (roomId: RoomId, param: Parameter) => {
    const key = `${roomId}:${param}`;
    const d = drafts[key];
    const range = thresholds[roomId][param];
    if (!range) return;
    const min = d ? Number(d.min) : range.min;
    const max = d ? Number(d.max) : range.max;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
      setError(`${roomId} ${PARAMETER_META[param].label}: min harus lebih kecil dari max (angka valid).`);
      setSaved(null);
      return;
    }
    if (setThreshold(roomId, param, min, max)) {
      setError(null);
      setSaved(`${roomId} ${PARAMETER_META[param].label} disimpan: ${min}–${max} ${range.unit}`);
    }
  };

  return (
    <section className="panel" aria-label="Threshold">
      <h2>Threshold — Batas Min/Max per Ruangan</h2>
      <p className="warn-banner">
        Nilai di bawah ini adalah <strong>CONTOH AWAL</strong> — SRS tidak menetapkan angka
        threshold. Administrator wajib mengonfirmasi/menyesuaikan angka ini dengan standar
        operasional sebelum dipakai produksi.
      </p>
      {!isAdmin && (
        <p className="warn-banner">
          Peran Operator Produksi bersifat read-only: pengubahan threshold hanya untuk
          Administrator.
        </p>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {saved && <p className="ok-text" role="status">{saved}</p>}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Ruangan</th>
              <th>Parameter</th>
              <th>Min</th>
              <th>Max</th>
              <th>Satuan</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ roomId, roomName, param }) => {
              const range = thresholds[roomId][param];
              if (!range) return null;
              const key = `${roomId}:${param}`;
              const d = drafts[key];
              const minVal = d ? d.min : String(range.min);
              const maxVal = d ? d.max : String(range.max);
              return (
                <tr key={key}>
                  <td>
                    {roomId} — {roomName}
                  </td>
                  <td>{PARAMETER_META[param].label}</td>
                  <td>
                    <input
                      type="number"
                      step="any"
                      value={minVal}
                      disabled={!isAdmin}
                      aria-label={`Minimum ${PARAMETER_META[param].label} ${roomId}`}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [key]: { min: e.target.value, max: maxVal },
                        }))
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="any"
                      value={maxVal}
                      disabled={!isAdmin}
                      aria-label={`Maksimum ${PARAMETER_META[param].label} ${roomId}`}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [key]: { min: minVal, max: e.target.value },
                        }))
                      }
                    />
                  </td>
                  <td>{range.unit}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-small"
                      disabled={!isAdmin}
                      title={
                        isAdmin
                          ? 'Simpan threshold baris ini'
                          : 'Hanya Administrator yang dapat mengubah threshold'
                      }
                      onClick={() => save(roomId, param)}
                    >
                      Simpan
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">
        Threshold disimpan per ruangan per parameter di IndexedDB dan langsung dipakai
        evaluasi alert untuk bacaan berikutnya. Perubahan tidak memerlukan restart.
      </p>
    </section>
  );
}
