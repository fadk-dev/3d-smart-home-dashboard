// MQTT integration module — SRS §4.1, §6, FR-24/25.
// Satu-satunya tempat yang menyentuh mqtt.js. UI dan scene 3D TIDAK BOLEH
// mengimpor modul ini; mereka memakai store + commandService.
// Tanggung jawab: connect, subscribe (QoS 1), route pesan → validator → store,
// reconnect + resubscribe otomatis, publish command (QoS 1, retain false).
import mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
import { lampCommandTopic, subscribeTopics } from '../config';
import { DEVICES, deviceById } from '../config/devices';
import { useSmartHome } from '../store/useStore';
import {
  parseJson,
  validateAvailability,
  validateLampState,
  validateTelemetry,
} from '../lib/validate';
import type { LampCommandPayload } from '../lib/validate';

class MqttService {
  private client: MqttClient | null = null;

  get connected(): boolean {
    return this.client?.connected === true;
  }

  connect(url: string, username?: string, password?: string): void {
    this.disconnect();
    const store = useSmartHome.getState();
    store.setBrokerStatus('CONNECTING');
    store.addEvent('connection', `Menghubungkan ke broker ${url} …`);

    const clientId = `smarthome-web-${Math.random().toString(36).slice(2, 10)}`;
    this.client = mqtt.connect(url, {
      clientId,
      username: username || undefined,
      password: password || undefined,
      reconnectPeriod: 5_000,
      connectTimeout: 10_000,
      clean: true,
    });

    this.client.on('connect', () => {
      const s = useSmartHome.getState();
      s.setBrokerStatus('CONNECTED');
      s.addEvent('connection', 'Terhubung ke broker — resubscribe semua topik');
      this.resubscribe();
    });

    this.client.on('reconnect', () => {
      useSmartHome.getState().setBrokerStatus('CONNECTING');
    });

    const onDown = () => {
      const s = useSmartHome.getState();
      if (s.brokerStatus !== 'DISCONNECTED') {
        s.setBrokerStatus('DISCONNECTED');
        s.addEvent('connection', 'Koneksi broker terputus — mencoba reconnect otomatis');
        s.clearPendingOnDisconnect();
      }
    };
    this.client.on('offline', onDown);
    this.client.on('close', onDown);

    this.client.on('error', (err) => {
      const s = useSmartHome.getState();
      s.setBrokerStatus('ERROR');
      s.addEvent('connection', `Error koneksi broker: ${err.message}`);
    });

    this.client.on('message', (topic, payload) => {
      this.handleMessage(topic, payload.toString());
    });
  }

  /** Subscribe ulang semua topik aktif (FR-24/25) — dipanggil setiap (re)connect. */
  resubscribe(): void {
    if (!this.client) return;
    const topics = DEVICES.flatMap((d) => subscribeTopics(d));
    this.client.subscribe(topics, { qos: 1 }, (err) => {
      if (err) {
        useSmartHome
          .getState()
          .addEvent('connection', `Gagal subscribe: ${err.message}`);
      }
    });
  }

  disconnect(): void {
    if (this.client) {
      try {
        this.client.end(true);
      } catch {
        /* abaikan */
      }
      this.client = null;
    }
    const s = useSmartHome.getState();
    if (s.brokerStatus !== 'DISCONNECTED') {
      s.setBrokerStatus('DISCONNECTED');
      s.clearPendingOnDisconnect();
    }
  }

  /** Publish command lampu: QoS 1, retain FALSE (AC-04, R-02). */
  publishCommand(deviceId: string, payload: LampCommandPayload): boolean {
    if (!this.client || !this.client.connected) return false;
    const device = deviceById(deviceId);
    if (!device) return false;
    this.client.publish(
      lampCommandTopic(device),
      JSON.stringify(payload),
      { qos: 1, retain: false },
      (err) => {
        if (err) {
          useSmartHome
            .getState()
            .addEvent('command', `Gagal publish command ke ${deviceId}: ${err.message}`);
        }
      },
    );
    return true;
  }

  private handleMessage(topic: string, raw: string): void {
    const store = useSmartHome.getState();
    const now = Date.now();
    // Cari perangkat pemilik topik ini.
    const device = DEVICES.find((d) => topic.startsWith(`smarthome/${d.roomId}/${d.deviceId}/`));
    if (!device) return; // topik di luar konteks — abaikan
    const parsed = parseJson(raw);
    if (!parsed.ok) {
      store.addEvent('validation', `Pesan ditolak (${topic}): ${parsed.error}`);
      return;
    }
    if (topic.endsWith('/telemetry')) {
      const v = validateTelemetry(parsed.value, device.deviceId, now);
      if (!v.ok) {
        store.addEvent('validation', `Telemetri ditolak (${device.deviceId}): ${v.error}`);
        return;
      }
      store.applyTelemetry(v.value, now);
    } else if (topic.endsWith('/availability')) {
      const v = validateAvailability(parsed.value, device.deviceId, now);
      if (!v.ok) {
        store.addEvent('validation', `Availability ditolak (${device.deviceId}): ${v.error}`);
        return;
      }
      store.applyAvailability(v.value, now);
    } else if (topic.endsWith('/lamp/state')) {
      const v = validateLampState(parsed.value, device.deviceId, now);
      if (!v.ok) {
        store.addEvent('validation', `State lampu ditolak (${device.deviceId}): ${v.error}`);
        return;
      }
      store.applyLampState(v.value, now);
    }
    // Topik lain (mis. /lamp/command yang tidak sengaja ter-subscribe) diabaikan:
    // web app tidak boleh memproses command sebagai state.
  }
}

export const mqttService = new MqttService();
