// Panel koneksi & pengaturan — SRS §5.1, §10, NFR-04/12/14.
// Mode LIVE/SIMULATION, URL broker WebSocket, kredensial opsional (hanya
// localStorage — tidak pernah masuk source code), timeout perintah.
// Berpindah ke SIMULATION memutuskan koneksi live; terputus di LIVE tetap
// LIVE dengan badge DISCONNECTED (AC-10) — tidak pernah diam-diam fallback
// ke simulasi.
import { useState } from 'react';
import { DEFAULT_COMMAND_TIMEOUT_MS } from '../config';
import { DEVICES } from '../config/devices';
import { mqttService } from '../mqtt/client';
import { useSmartHome } from '../store/useStore';

export default function ConnectionPanel() {
  const mode = useSmartHome((s) => s.mode);
  const brokerStatus = useSmartHome((s) => s.brokerStatus);
  const brokerUrl = useSmartHome((s) => s.brokerUrl);
  const mqttUsername = useSmartHome((s) => s.mqttUsername);
  const mqttPassword = useSmartHome((s) => s.mqttPassword);
  const commandTimeoutMs = useSmartHome((s) => s.commandTimeoutMs);
  const setMode = useSmartHome((s) => s.setMode);
  const setBrokerUrl = useSmartHome((s) => s.setBrokerUrl);
  const setCredentials = useSmartHome((s) => s.setCredentials);
  const setCommandTimeoutMs = useSmartHome((s) => s.setCommandTimeoutMs);

  const [url, setUrl] = useState(brokerUrl);
  const [username, setUsername] = useState(mqttUsername);
  const [password, setPassword] = useState(mqttPassword);
  const [timeout, setTimeout] = useState(String(commandTimeoutMs));

  const connect = () => {
    if (mode !== 'LIVE') {
      useSmartHome.getState().addEvent('info', 'Pindah ke mode LIVE untuk terhubung ke broker');
      setMode('LIVE');
    }
    setBrokerUrl(url);
    setCredentials(username, password);
    mqttService.connect(url, username, password);
  };

  const disconnect = () => mqttService.disconnect();

  return (
    <section className="panel" aria-label="Koneksi dan pengaturan">
      <h2>Koneksi &amp; Pengaturan</h2>

      <div className="field-row" role="group" aria-label="Mode aplikasi">
        <span className="field-label">Mode</span>
        <div className="segmented">
          <button
            type="button"
            className={mode === 'SIMULATION' ? 'active' : ''}
            aria-pressed={mode === 'SIMULATION'}
            onClick={() => setMode('SIMULATION')}
          >
            SIMULATION
          </button>
          <button
            type="button"
            className={mode === 'LIVE' ? 'active' : ''}
            aria-pressed={mode === 'LIVE'}
            onClick={() => setMode('LIVE')}
          >
            LIVE
          </button>
        </div>
      </div>
      <p className="hint">
        {mode === 'SIMULATION'
          ? 'Mode simulasi: data sintetis, tidak ada publish ke broker.'
          : 'Mode live: data & perintah dari/ke broker MQTT. Bila broker terputus, aplikasi tetap LIVE dengan status DISCONNECTED.'}
      </p>

      <label className="field">
        <span>URL Broker (MQTT over WebSocket)</span>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="wss://broker.emqx.io:8084/mqtt"
          aria-label="URL broker MQTT"
        />
      </label>
      <div className="field-duo">
        <label className="field">
          <span>Username (opsional)</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
            aria-label="Username broker (opsional)"
          />
        </label>
        <label className="field">
          <span>Password (opsional)</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            aria-label="Password broker (opsional)"
          />
        </label>
      </div>
      <p className="hint">
        Kredensial disimpan di localStorage browser saja, tidak pernah masuk source code
        atau log. Gunakan akun broker berhak minimum (NFR-12).
      </p>

      <label className="field">
        <span>Timeout perintah (ms) — default {DEFAULT_COMMAND_TIMEOUT_MS}</span>
        <input
          type="number"
          min={500}
          max={30000}
          step={500}
          value={timeout}
          onChange={(e) => {
            setTimeout(e.target.value);
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v >= 500 && v <= 30000) setCommandTimeoutMs(v);
          }}
          aria-label="Timeout perintah dalam milidetik"
        />
      </label>

      <div className="conn-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={brokerStatus === 'CONNECTED' || brokerStatus === 'CONNECTING'}
          onClick={connect}
        >
          {brokerStatus === 'CONNECTING' ? 'Menghubungkan…' : 'Hubungkan'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={brokerStatus === 'DISCONNECTED'}
          onClick={disconnect}
        >
          Putuskan
        </button>
      </div>

      <details className="device-config">
        <summary>Konfigurasi perangkat ({DEVICES.length})</summary>
        <ul>
          {DEVICES.map((d) => (
            <li key={d.deviceId}>
              <strong>{d.roomName}</strong> — {d.roomId} / {d.deviceId}
              {d.hasTelemetry ? ' • telemetri' : ' • lampu saja'}
              <br />
              <code>smarthome/{d.roomId}/{d.deviceId}/#</code>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
