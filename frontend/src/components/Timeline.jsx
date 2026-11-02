import { fmtDate, label } from "../lib/api";
import { Empty, SeverityBadge, SourceBadge } from "./ui";

/** Chronological medical timeline (newest first), grouped by year. */
export default function Timeline({ events, onEdit, onDelete, docLink }) {
  if (!events?.length) return <Empty>No medical events recorded yet. Your health memory grows as you add events or confirm scanned documents.</Empty>;
  const byYear = {};
  for (const e of events) {
    const y = e.event_date.slice(0, 4);
    (byYear[y] ||= []).push(e);
  }
  const years = Object.keys(byYear).sort((a, b) => b - a);
  return (
    <div className="timeline">
      {years.map((y) => (
        <div key={y}>
          <div className="tl-year">{y}</div>
          {byYear[y].map((e) => (
            <div key={e.id} className={`tl-item ${e.event_type}`}>
              <div className="tl-card">
                <div className="card-head" style={{ marginBottom: ".3rem" }}>
                  <div>
                    <div className="tl-date">{fmtDate(e.event_date)} · {label(e.event_type)}</div>
                    <h3>{e.title}</h3>
                  </div>
                  <div className="actions">
                    {e.severity && <SeverityBadge s={e.severity} />}
                    <SourceBadge source={e.source} docId={e.source_document_id} />
                  </div>
                </div>
                {e.description && <p className="small" style={{ whiteSpace: "pre-wrap" }}>{e.description}</p>}
                <div className="meta small muted">
                  {e.provider && <span>👨‍⚕️ {e.provider} · </span>}
                  {e.facility && <span>🏥 {e.facility} · </span>}
                  recorded {fmtDate(e.created_at)}
                  {e.source_document_id && docLink && <> · <a href={docLink(e.source_document_id)} target="_blank" rel="noreferrer">view source document</a></>}
                </div>
                {(onEdit || onDelete) && (
                  <div className="actions" style={{ marginTop: ".5rem" }}>
                    {onEdit && <button className="btn secondary sm" onClick={() => onEdit(e)}>Edit</button>}
                    {onDelete && <button className="btn ghost sm" onClick={() => onDelete(e)}>Delete</button>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
