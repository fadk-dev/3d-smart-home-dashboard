// Filter Visualisasi 3D — panel khusus untuk konfigurasi pewarnaan lantai
// ruangan di scene 3D menurut nilai sensor.
// Mode: Status (hijau/amber/merah seperti biasa), Suhu (biru dingin → merah
// panas), Kelembapan (pucat kering → biru tua lembap), atau Keduanya
// (separuh lantai suhu + separuh kelembapan). Rentang skala warna bisa
// diatur; nilai di luar rentang dijepit ke ujung skala. Ruangan offline
// tetap merah berdenyut dan ruangan tanpa data tetap abu-abu di semua mode.
import { useState } from 'react';
import { gradientCss, HUM_STOPS, TEMP_STOPS } from '../lib/colorScale';
import type { VizMode } from '../lib/colorScale';
import { useIiotStore } from '../store/useStore';

const MODES: Array<{ id: VizMode; label: string; hint: string }> = [
  { id: 'status', label: 'Status', hint: 'Normal / Peringatan / Offline' },
  { id: 'temperature', label: 'Suhu (°C)', hint: 'Biru dingin → merah panas' },
  { id: 'humidity', label: 'Kelembapan (%RH)', hint: 'Pucat kering → biru lembap' },
  { id: 'both', label: 'Keduanya', hint: 'Separuh suhu + separuh kelembapan' },
];

const STATUS_SWATCHES: Array<{ color: string; label: string }> = [
  { color: '#cfe3cf', label: 'Normal' },
  { color: '#fbe3b0', label: 'Peringatan' },
  { color: '#f6c6c6', label: 'Offline' },
  { color: '#e9e5db', label: 'Tanpa data' },
];

function ScaleInputs(props: {
  label: string;
  unit: string;
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}) {
  const apply = (nextMin: number, nextMax: number) => {
    if (Number.isFinite(nextMin) && Number.isFinite(nextMax) && nextMax > nextMin) {
      props.onChange(nextMin, nextMax);
    }
  };
  return (
    <label className="viz-scale">
      {props.label} ({props.unit})
      <span className="viz-scale-inputs">
        <input
          type="number"
          value={props.min}
          onChange={(e) => apply(Number(e.target.value), props.max)}
          aria-label={`${props.label} minimum`}
        />
        <span>–</span>
        <input
          type="number"
          value={props.max}
          onChange={(e) => apply(props.min, Number(e.target.value))}
          aria-label={`${props.label} maksimum`}
        />
      </span>
    </label>
  );
}

function LegendBar(props: { title: string; gradient: string; minLabel: string; maxLabel: string }) {
  return (
    <div className="viz-legend">
      <div className="viz-legend-title">{props.title}</div>
      <div className="viz-bar" style={{ background: props.gradient }} aria-hidden="true" />
      <div className="viz-legend-labels">
        <span>{props.minLabel}</span>
        <span>{props.maxLabel}</span>
      </div>
    </div>
  );
}

export default function VizFilterPanel() {
  const scene = useIiotStore((s) => s.scene);
  const setScene = useIiotStore((s) => s.setScene);
  const [open, setOpen] = useState(true);
  const reset = () =>
    setScene({
      vizMode: 'status',
      tempMin: -20,
      tempMax: 40,
      humMin: 0,
      humMax: 100,
    });

  return (
    <section className="viz-panel" aria-label="Filter visualisasi 3D">
      <div className="viz-panel-head">
        <h2>Filter Visualisasi 3D</h2>
        <span className="viz-head-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? 'Sembunyikan' : 'Tampilkan'}
          </button>
          <button type="button" className="btn-ghost" onClick={reset}>
            Reset
          </button>
        </span>
      </div>
      {open && (
        <>
      <p className="viz-note">
        Warnai lantai tiap ruangan menurut nilai sensor terakhir. Bisa tampil sendiri-sendiri
        (suhu saja / kelembapan saja) atau bersama-sama (keduanya).
      </p>
      <div className="viz-modes" role="radiogroup" aria-label="Mode visualisasi">
        {MODES.map((m) => (
          <label key={m.id} className={`viz-mode${scene.vizMode === m.id ? ' active' : ''}`}>
            <input
              type="radio"
              name="viz-mode"
              value={m.id}
              checked={scene.vizMode === m.id}
              onChange={() => setScene({ vizMode: m.id })}
            />
            <span className="viz-mode-label">{m.label}</span>
            <span className="viz-mode-hint">{m.hint}</span>
          </label>
        ))}
      </div>
      {(scene.vizMode === 'temperature' || scene.vizMode === 'both') && (
        <div className="viz-scales">
          <ScaleInputs
            label="Skala suhu"
            unit="°C"
            min={scene.tempMin}
            max={scene.tempMax}
            onChange={(min, max) => setScene({ tempMin: min, tempMax: max })}
          />
        </div>
      )}
      {(scene.vizMode === 'humidity' || scene.vizMode === 'both') && (
        <div className="viz-scales">
          <ScaleInputs
            label="Skala kelembapan"
            unit="%RH"
            min={scene.humMin}
            max={scene.humMax}
            onChange={(min, max) => setScene({ humMin: min, humMax: max })}
          />
        </div>
      )}
      <div className="viz-legends">
        {scene.vizMode === 'status' && (
          <div className="viz-legend">
            <div className="viz-legend-title">Status ruangan</div>
            <div className="viz-swatches">
              {STATUS_SWATCHES.map((s) => (
                <span key={s.label} className="viz-swatch">
                  <span className="viz-swatch-color" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
          </div>
        )}
        {(scene.vizMode === 'temperature' || scene.vizMode === 'both') && (
          <LegendBar
            title="Suhu"
            gradient={gradientCss(TEMP_STOPS)}
            minLabel={`${scene.tempMin} °C · Dingin`}
            maxLabel={`${scene.tempMax} °C · Panas`}
          />
        )}
        {(scene.vizMode === 'humidity' || scene.vizMode === 'both') && (
          <LegendBar
            title="Kelembapan"
            gradient={gradientCss(HUM_STOPS)}
            minLabel={`${scene.humMin} %RH · Kering`}
            maxLabel={`${scene.humMax} %RH · Lembap`}
          />
        )}
      </div>
      <p className="viz-note viz-note-sub">
        Mode &apos;Keduanya&apos;: sisi barat lantai = suhu, sisi timur = kelembapan. Ruangan
        offline tetap merah berdenyut; ruangan tanpa data tetap abu-abu.
      </p>
        </>
      )}
    </section>
  );
}
