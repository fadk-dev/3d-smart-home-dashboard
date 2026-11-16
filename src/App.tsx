// App — komposisi dashboard IIoT Catering (SRS v1.1 MVP).
// Tab: Dashboard / Riwayat / Perangkat / Threshold / Alert.
// Efek mode: SIMULATION → jalankan simulasi & putuskan broker live;
// LIVE → hentikan simulasi (tetap LIVE walau broker DISCONNECTED, AC-10).
// Saat mount: pulihkan threshold/perangkat/alert/histori dari IndexedDB,
// lalu mulai simulasi (mode default SIMULATION).
import { useEffect, useState } from 'react';
import StatusBar from './components/StatusBar';
import HouseScene from './components/HouseScene';
import TelemetryPanel from './components/TelemetryPanel';
import DevicePanel from './components/DevicePanel';
import EventLog from './components/EventLog';
import ConnectionPanel from './components/ConnectionPanel';
import ThresholdPanel from './components/ThresholdPanel';
import AlertsPanel from './components/AlertsPanel';
import HistoryPanel from './components/HistoryPanel';
import VizFilterPanel from './components/VizFilterPanel';
import RoomCards, { FlowStrip } from './components/RoomCards';
import { activeAlertCount, useIiotStore } from './store/useStore';
import { mqttService } from './mqtt/client';
import { startSimulation, stopSimulation } from './sim/simulation';

type Tab = 'dashboard' | 'riwayat' | 'perangkat' | 'threshold' | 'alert';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'riwayat', label: 'Riwayat' },
  { id: 'perangkat', label: 'Perangkat' },
  { id: 'threshold', label: 'Threshold' },
  { id: 'alert', label: 'Alert' },
];

export default function App() {
  const mode = useIiotStore((s) => s.mode);
  const scene = useIiotStore((s) => s.scene);
  const setScene = useIiotStore((s) => s.setScene);
  const alerts = useIiotStore((s) => s.alerts);
  const [sceneStatus, setSceneStatus] = useState('LOADING');
  const [tab, setTab] = useState<Tab>('dashboard');
  const [sceneSettingsOpen, setSceneSettingsOpen] = useState(true);

  // Pulihkan data lokal sekali saat mount, lalu mulai simulasi bila mode SIMULATION.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await useIiotStore.getState().restoreFromDb();
      if (!cancelled && useIiotStore.getState().mode === 'SIMULATION') {
        startSimulation();
      }
    })();
    return () => {
      cancelled = true;
      stopSimulation();
    };
  }, []);

  useEffect(() => {
    if (mode === 'SIMULATION') {
      mqttService.disconnect();
      startSimulation();
    } else {
      stopSimulation();
    }
    return () => {
      stopSimulation();
    };
  }, [mode]);

  // Pemeriksaan offline berkala (5 dtk) — AC-10.
  useEffect(() => {
    const id = setInterval(() => useIiotStore.getState().checkOffline(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const activeAlerts = activeAlertCount(alerts);

  return (
    <div className="app">
      <StatusBar sceneStatus={sceneStatus} />
      <nav className="tabs" aria-label="Navigasi utama">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab-btn${tab === t.id ? ' active' : ''}`}
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'alert' && activeAlerts > 0 && (
              <span className="tab-badge" aria-label={`${activeAlerts} alert aktif`}>
                {activeAlerts}
              </span>
            )}
          </button>
        ))}
      </nav>
      <main className="main">
        {tab === 'dashboard' && (
          <div className="dashboard-3d">
            {/* 3D adalah dasar halaman; semua widget tampil sebagai overlay di atasnya.
                Tab lain (Riwayat/Perangkat/Threshold/Alert) tetap memakai layout normal. */}
            <div className="canvas-base">
              <HouseScene onReady={() => setSceneStatus('READY')} />
            </div>
            <div className="overlay overlay-flow">
              <FlowStrip compact />
            </div>
            <div className="overlay overlay-view" aria-label="Pengaturan tampilan 3D">
              <VizFilterPanel />
              <section className="scene-settings" aria-label="Pengaturan tampilan 3D">
                <div className="scene-settings-head">
                  <h2>Pengaturan tampilan</h2>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setSceneSettingsOpen((v) => !v)}
                    aria-expanded={sceneSettingsOpen}
                  >
                    {sceneSettingsOpen ? 'Sembunyikan' : 'Tampilkan'}
                  </button>
                </div>
                {sceneSettingsOpen && (
                  <div className="scene-settings-body">
                    <label>
                      <input
                        type="checkbox"
                        checked={scene.autoRotate}
                        onChange={(e) => setScene({ autoRotate: e.target.checked })}
                      />
                      Auto-rotate
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={scene.shadows}
                        onChange={(e) => setScene({ shadows: e.target.checked })}
                      />
                      Bayangan
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={scene.showLabels}
                        onChange={(e) => setScene({ showLabels: e.target.checked })}
                      />
                      Tampilkan label
                    </label>
                    <label>
                      Tinggi tembok
                      <input
                        type="range"
                        min={0.6}
                        max={3.0}
                        step={0.1}
                        value={scene.wallHeight}
                        onChange={(e) => setScene({ wallHeight: Number(e.target.value) })}
                        aria-label="Tinggi tembok (meter)"
                      />
                      <span className="slider-val">{scene.wallHeight.toFixed(1)} m</span>
                    </label>
                    <label>
                      Opasitas tembok
                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={scene.wallOpacity}
                        onChange={(e) => setScene({ wallOpacity: Number(e.target.value) })}
                        aria-label="Opasitas tembok"
                      />
                      <span className="slider-val">{Math.round(scene.wallOpacity * 100)}%</span>
                    </label>
                    <label>
                      Kualitas
                      <select
                        value={scene.quality}
                        onChange={(e) =>
                          setScene({ quality: e.target.value === 'low' ? 'low' : 'high' })
                        }
                        aria-label="Kualitas render"
                      >
                        <option value="high">Tinggi</option>
                        <option value="low">Rendah</option>
                      </select>
                    </label>
                    <p className="hint" style={{ margin: 0 }}>
                      Lokal — tidak mengubah perangkat.
                    </p>
                  </div>
                )}
              </section>
            </div>
            <aside className="overlay overlay-side" aria-label="Panel informasi">
              <TelemetryPanel />
              <EventLog />
            </aside>
            <div className="overlay overlay-rooms">
              <RoomCards />
            </div>
            <div className="overlay overlay-hint canvas-hint">
              Seret untuk rotate • Klik kanan seret untuk pan • Scroll untuk zoom • Klik
              ruangan atau beacon sensor untuk memilih
            </div>
          </div>
        )}
        {tab === 'riwayat' && <HistoryPanel />}
        {tab === 'perangkat' && (
          <div className="tab-stack">
            <DevicePanel />
            <ConnectionPanel />
          </div>
        )}
        {tab === 'threshold' && <ThresholdPanel />}
        {tab === 'alert' && <AlertsPanel />}
      </main>
    </div>
  );
}
