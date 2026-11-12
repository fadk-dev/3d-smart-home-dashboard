// App — komposisi dashboard (SRS §5.1).
// Efek mode: SIMULATION → jalankan simulasi & putuskan broker live;
// LIVE → hentikan simulasi (tetap LIVE walau broker DISCONNECTED, AC-10).
import { useEffect, useState } from 'react';
import StatusBar from './components/StatusBar';
import HouseScene from './components/HouseScene';
import TelemetryPanel from './components/TelemetryPanel';
import DevicePanel from './components/DevicePanel';
import EventLog from './components/EventLog';
import ConnectionPanel from './components/ConnectionPanel';
import { useSmartHome } from './store/useStore';
import { mqttService } from './mqtt/client';
import { startSimulation, stopSimulation } from './sim/simulation';

export default function App() {
  const mode = useSmartHome((s) => s.mode);
  const scene = useSmartHome((s) => s.scene);
  const setScene = useSmartHome((s) => s.setScene);
  const [sceneStatus, setSceneStatus] = useState('LOADING');

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

  return (
    <div className="app">
      <StatusBar sceneStatus={sceneStatus} />
      <main className="layout">
        <div className="canvas-wrap">
          <HouseScene onReady={() => setSceneStatus('READY')} />
          <div className="canvas-hint">
            Seret untuk rotate • Klik kanan seret untuk pan • Scroll untuk zoom • Klik lampu
            untuk menyalakan/mematikan
          </div>
          <fieldset className="scene-settings">
            <legend>Pengaturan tampilan (lokal — tidak mengubah perangkat)</legend>
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
          </fieldset>
        </div>
        <aside className="sidebar">
          <TelemetryPanel />
          <DevicePanel />
          <ConnectionPanel />
          <EventLog />
        </aside>
      </main>
    </div>
  );
}
