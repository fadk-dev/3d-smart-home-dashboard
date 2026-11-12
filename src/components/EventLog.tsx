// Event / activity log — SRS §7, FR-07, NFR-06.
// Alert, koneksi/reconnect, error validasi, perubahan threshold/perangkat,
// ringkasan telemetri (di-throttle). Kredensial TIDAK PERNAH ditulis ke log.
import { useIiotStore } from '../store/useStore';

const KIND_LABEL: Record<string, string> = {
  telemetry: 'TELEMETRI',
  connection: 'KONEKSI',
  alert: 'ALERT',
  validation: 'VALIDASI',
  mode: 'MODE',
  device: 'PERANGKAT',
  info: 'INFO',
  threshold: 'THRESHOLD',
};

export default function EventLog() {
  const events = useIiotStore((s) => s.events);
  return (
    <section className="panel" aria-label="Log aktivitas">
      <h2>Log Aktivitas</h2>
      {events.length === 0 ? (
        <p className="empty">Belum ada peristiwa.</p>
      ) : (
        <ol className="event-log">
          {events.map((e) => (
            <li key={e.id} className={`event-kind-${e.kind}`}>
              <time>{new Date(e.ts).toLocaleTimeString('id-ID', { hour12: false })}</time>
              <span className="event-kind">{KIND_LABEL[e.kind] ?? e.kind}</span>
              <span>{e.message}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
