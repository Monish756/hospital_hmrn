import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fmtDate, fmtDateTime } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Alert, Loading } from "../components/ui";
import Timeline from "../components/Timeline";

export default function PatientDashboard() {
  const { user } = useAuth();
  const [d, setD] = useState(null); const [err, setErr] = useState("");
  useEffect(() => { api.dashboard().then(setD).catch((e) => setErr(e.message)); }, []);
  if (err) return <div className="container"><Alert kind="error">{err}</Alert></div>;
  if (!d) return <Loading />;
  const c = d.counts;
  return (
    <div className="container">
      <div className="page-head">
        <div><h1>Welcome back, {user.full_name.split(" ")[0]}</h1>
          <p className="muted">HMRN ID <span className="mono">{d.hmrn_id}</span> · health memory since {fmtDate(d.memory_started_at)}</p></div>
        <div className="actions">
          <Link className="btn" to="/patient/scanner">Scan a document</Link>
          <Link className="btn secondary" to="/patient/emergency-card">Emergency card</Link>
        </div>
      </div>
      {c.documents_needing_review > 0 && <Alert kind="warn">{c.documents_needing_review} scanned document(s) are waiting for your review before they join your health memory. <Link to="/patient/scanner">Review now →</Link></Alert>}
      {c.pending_requests > 0 && <Alert kind="info">{c.pending_requests} doctor access request(s) pending. <Link to="/patient/access">Review →</Link></Alert>}
      <div className="grid grid-4">
        <div className="stat"><div className="value">{c.events}</div><div className="label">Medical events</div></div>
        <div className="stat accent"><div className="value">{c.active_medications}</div><div className="label">Active medications</div></div>
        <div className="stat danger"><div className="value">{c.allergies}</div><div className="label">Allergies</div></div>
        <div className="stat"><div className="value">{c.documents}</div><div className="label">Documents</div></div>
      </div>
      <div className="grid grid-2" style={{ marginTop: "1rem" }}>
        <div className="card">
          <div className="card-head"><h2>Recent events</h2><Link className="small" to="/patient/timeline">Full timeline →</Link></div>
          <Timeline events={d.recent_events} />
        </div>
        <div className="card">
          <div className="card-head"><h2>Recent doctor access</h2><Link className="small" to="/patient/access">Audit log →</Link></div>
          {!d.recent_access.length ? <p className="muted">No doctor has accessed your record yet.</p> : (
            <div className="list">{d.recent_access.map((l) => (
              <div key={l.id} className="item"><div><strong>{l.action === "emergency_access" ? "🆘 Emergency access" : "Record viewed"}</strong><div className="meta">{l.detail}</div></div><div className="meta">{fmtDateTime(l.created_at)}</div></div>
            ))}</div>
          )}
          <p className="small muted" style={{ marginTop: ".8rem" }}>Active grants: {c.active_grants}</p>
        </div>
      </div>
    </div>
  );
}
