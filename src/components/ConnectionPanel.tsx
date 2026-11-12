// Panel koneksi & pengaturan — SRS §6, FR-02, NFR-01/02.
// Mode LIVE/SIMULATION, URL broker WebSocket, kredensial opsional (hanya
// localStorage — tidak pernah masuk source code), tampilan interval sampling
// & timeout offline. Berpindah ke SIMULATION memutuskan koneksi live; terputus
// di LIVE tetap LIVE dengan badge DISCONNECTED (AC-10) — tidak pernah
// diam-diam fallback ke simulasi.
import { useState } from 'react';
import { OFFLINE_TIMEOUT_LIVE_MS, OFFLINE_TIMEOUT_SIM_MS, SAMPLING_INTERVAL_MS, SIM_TICK_MS } from '../config';
import { NODES, telemetryTopic } from '../config/devices';
import { mqttService } from '../mqtt/client';
import { useIiotStore } from '../store/useStore';

export default function ConnectionPanel() {
  const mode = useIiotStore((s) => s.mode);
  const brokerStatus = useIiotStore((s) => s.brokerStatus);
  const brokerUrl = useIiotStore((s) => s.brokerUrl);
  const mqttUsername = useIiotStore((s) => s.mqttUsername);
  const mqttPassword = useIiotStore((s) => s.mqttPassword);
  const setMode = useIiotStore((s) => s.setMode);
  const setBrokerUrl = useIiotStore((s) => s.setBrokerUrl);
  const setCredentials = useIiotStore((s) => s.setCredentials);

  const [url, setUrl] = useState(brokerUrl);
  const [username, setUsername] = useState(mqttUsername);
  const [password, setPassword] = useState(mqttPassword);

  const connect = () => {
    if (mode !== 'LIVE') {
      useIiotStore.getState().addEvent('info', 'Pindah ke mode LIVE untuk terhubung ke broker');
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
          ? `Mode simulasi dipercepat: 1 bacaan per node tiap ${SIM_TICK_MS / 1000} detik (baseline SRS 1 menit). Data sintetis, tidak ada publish ke broker.`
          : 'Mode live: data hanya dari broker MQTT (subscribe-only — aplikasi tidak pernah publish). Bila broker terputus, aplikasi tetap LIVE dengan status DISCONNECTED.'}
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
        atau log. Gunakan akun broker berhak minimum (subscribe-only).
      </p>

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

      <dl className="kv-list">
        <div>
          <dt>Interval sampling (baseline SRS)</dt>
          <dd>{SAMPLING_INTERVAL_MS / 1000} detik</dd>
        </div>
        <div>
          <dt>Interval simulasi (dipercepat)</dt>
          <dd>{SIM_TICK_MS / 1000} detik</dd>
        </div>
        <div>
          <dt>Timeout offline — LIVE</dt>
          <dd>{OFFLINE_TIMEOUT_LIVE_MS / 1000} detik (3× sampling)</dd>
        </div>
        <div>
          <dt>Timeout offline — SIMULATION</dt>
          <dd>{OFFLINE_TIMEOUT_SIM_MS / 1000} detik</dd>
        </div>
      </dl>

      <details className="device-config">
        <summary>Topik subscribe ({NODES.length} node)</summary>
        <ul>
          {NODES.map((n) => (
            <li key={n.deviceId}>
              <strong>{n.roomId}</strong> — {n.deviceId}
              <br />
              <code>{telemetryTopic(n.roomId, n.deviceId)}</code>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
