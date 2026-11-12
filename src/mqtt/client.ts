// MQTT integration module — SRS IIoT Catering v1.1 §6, FR-02.
// SUBSCRIBE-ONLY. Satu-satunya tempat yang menyentuh mqtt.js. UI dan scene 3D
// TIDAK BOLEH mengimpor modul ini; mereka memakai store.
// Tanggung jawab: connect, subscribe (QoS 1), route pesan → validator → store,
// reconnect + resubscribe otomatis (backoff), retained dengan freshness check.
//
// TIDAK ADA method publish di modul ini — MVP adalah monitoring-only; tidak
// ada perintah yang dikirim ke perangkat (tidak ada kontrol lampu/HVAC).
import mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
import { subscribeTopics } from '../config/devices';
import { useIiotStore } from '../store/useStore';
import { parseJson, validateTelemetry } from '../lib/validate';

class MqttService {
  private client: MqttClient | null = null;

  get connected(): boolean {
    return this.client?.connected === true;
  }

  connect(url: string, username?: string, password?: string): void {
    this.disconnect();
    const store = useIiotStore.getState();
    store.setBrokerStatus('CONNECTING');
    store.addEvent('connection', `Menghubungkan ke broker ${url} …`);

    const clientId = `iiot-catering-web-${Math.random().toString(36).slice(2, 10)}`;
    this.client = mqtt.connect(url, {
      clientId,
      username: username || undefined,
      password: password || undefined,
      reconnectPeriod: 5_000,
      connectTimeout: 10_000,
      clean: true,
    });

    this.client.on('connect', () => {
      const s = useIiotStore.getState();
      s.setBrokerStatus('CONNECTED');
      s.addEvent('connection', 'Terhubung ke broker — resubscribe semua topik telemetri');
      this.resubscribe();
    });

    this.client.on('reconnect', () => {
      useIiotStore.getState().setBrokerStatus('CONNECTING');
    });

    const onDown = () => {
      const s = useIiotStore.getState();
      if (s.brokerStatus !== 'DISCONNECTED') {
        s.setBrokerStatus('DISCONNECTED');
        s.addEvent('connection', 'Koneksi broker terputus — mencoba reconnect otomatis');
      }
    };
    this.client.on('offline', onDown);
    this.client.on('close', onDown);

    this.client.on('error', (err) => {
      const s = useIiotStore.getState();
      s.setBrokerStatus('ERROR');
      s.addEvent('connection', `Error koneksi broker: ${err.message}`);
    });

    this.client.on('message', (topic, payload) => {
      this.handleMessage(topic, payload.toString());
    });
  }

  /** Subscribe ulang semua topik telemetri — dipanggil setiap (re)connect. */
  resubscribe(): void {
    if (!this.client) return;
    const topics = subscribeTopics();
    this.client.subscribe(topics, { qos: 1 }, (err) => {
      if (err) {
        useIiotStore.getState().addEvent('connection', `Gagal subscribe: ${err.message}`);
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
    const s = useIiotStore.getState();
    if (s.brokerStatus !== 'DISCONNECTED') {
      s.setBrokerStatus('DISCONNECTED');
    }
  }

  private handleMessage(topic: string, raw: string): void {
    const store = useIiotStore.getState();
    const now = Date.now();
    // Topik: iiot/catering/{room_id}/{device_id}/telemetry
    const m = /^iiot\/catering\/(R0\d)\/(NODE-R0\d-\d{3})\/telemetry$/.exec(topic);
    if (!m) return; // topik di luar kontrak — abaikan
    const [, topicRoomId, topicDeviceId] = m;
    const parsed = parseJson(raw);
    if (!parsed.ok) {
      store.recordInvalid(topicDeviceId, `Payload bukan JSON: ${parsed.error}`, now);
      return;
    }
    // device_id/room_id payload harus cocok dengan topik (FR-02).
    if (parsed.value.device_id !== topicDeviceId || parsed.value.room_id !== topicRoomId) {
      store.recordInvalid(
        topicDeviceId,
        'device_id/room_id payload tidak sesuai topik',
        now,
      );
      return;
    }
    const v = validateTelemetry(parsed.value, now);
    if (!v.ok) {
      store.recordInvalid(topicDeviceId, v.error, now);
      return;
    }
    // Pesan retained lama tetap diproses (dedup berdasarkan timestamp menolak
    // yang lebih lama dari bacaan terakhir); freshness dinilai dari last_seen.
    store.applyTelemetry(v.value, now);
  }
}

export const mqttService = new MqttService();
