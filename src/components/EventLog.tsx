// Event / activity log — SRS §5.1, UI-10, FR-20, AC-17.
// Perintah, state update, connect/disconnect/reconnect, error validasi.
// Kredensial TIDAK PERNAH ditulis ke log (§11).
import { useSmartHome } from '../store/useStore';

const KIND_LABEL: Record<string, string> = {
  command: 'PERINTAH',
  state: 'STATE',
  telemetry: 'TELEMETRI',
  connection: 'KONEKSI',
  availability: 'PERANGKAT',
  validation: 'VALIDASI',
  mode: 'MODE',
  info: 'INFO',
};

export default function EventLog() {
  const events = useSmartHome((s) => s.events);
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
