import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, fmtDate, fmtDateTime, label } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Alert, Field, Loading, Empty, SeverityBadge, SourceBadge } from "../components/ui";
import Timeline from "../components/Timeline";
import Assistant from "../components/Assistant";
import EmergencyCard from "../components/EmergencyCard";

/** Doctor portal home: patients with active/pending grants, HMRN ID lookup, standard access request. */
export function DoctorPortal() {
  const { user, profile } = useAuth();
  const [grants, setGrants] = useState(null); const [hmrn, setHmrn] = useState(""); const [reason, setReason] = useState("");
  const [look, setLook] = useState(null); const [err, setErr] = useState(""); const [ok, setOk] = useState("");
  const load = useCallback(() => api.doctorPatients().then(setGrants), []);
  useEffect(() => { load(); }, [load]);
  const lookup = async (e) => { e.preventDefault(); setErr(""); setOk(""); setLook(null); try { setLook(await api.lookup(hmrn)); } catch (ex) { setErr(ex.message); } };
  const request = async () => { setErr(""); try { await api.requestAccess({ hmrn_id: hmrn, reason }); setOk("Access request sent. The patient will see it in their portal."); load(); } catch (ex) { setErr(ex.message); } };
  const active = grants?.filter((g) => g.active) || [], pending = grants?.filter((g) => g.status === "pending") || [];
  return (
    <div className="container">
      <div className="page-head"><div><h1>Doctor Portal</h1><p className="muted">Dr. {user.full_name} · {profile.specialization || "General"} · {profile.hospital || "—"} {!profile.verified && <span className="badge warn">Unverified</span>}</p></div>
        <Link className="btn danger" to="/doctor/emergency">🆘 Emergency access</Link></div>
      <div className="grid grid-2">
        <div className="card">
          <h2>Find a patient</h2><p className="muted small">Enter the HMRN ID printed on the patient's emergency card.</p>
          <form className="form" onSubmit={lookup}><div className="form-row" style={{ gridTemplateColumns: "1fr auto" }}><input placeholder="HMRN-XXXXXXXX" value={hmrn} onChange={(e) => setHmrn(e.target.value.toUpperCase())} required /><button className="btn">Look up</button></div></form>
          <Alert kind="error">{err}</Alert><Alert kind="success">{ok}</Alert>
          {look && <div className="item" style={{ marginTop: ".8rem" }}><div><strong>{look.full_name}</strong> <span className="muted small">{look.age ?? "?"}y · {look.gender || "—"} · <span className="blood">{look.blood_group || "?"}</span></span><div className="meta mono">{look.hmrn_id}</div></div>
            <div className="actions">{look.has_access ? <Link className="btn sm" to={`/doctor/patient/${look.patient_id}`}>Open record</Link> : <div className="form"><input placeholder="Reason for access" value={reason} onChange={(e) => setReason(e.target.value)} /><button className="btn secondary sm" onClick={request}>Request access</button></div>}</div></div>}
        </div>
        <div className="card">
          <h2>Your patients</h2>
          {!grants ? <Loading /> : !active.length && !pending.length ? <Empty>No patient access yet.</Empty> : <div className="list">
            {active.map((g) => <div key={g.id} className="item"><div><strong>{g.patient_name}</strong> <span className="mono small muted">{g.patient_hmrn_id}</span><div className="meta">{g.grant_type === "emergency" ? <span className="badge danger">Emergency</span> : <span className="badge success">Approved</span>}{g.expires_at && ` · until ${fmtDateTime(g.expires_at)}`}</div></div><Link className="btn sm" to={`/doctor/patient/${g.patient_id}`}>Open</Link></div>)}
            {pending.map((g) => <div key={g.id} className="item"><div><strong>{g.patient_name}</strong><div className="meta"><span className="badge warn">Awaiting patient approval</span></div></div></div>)}
          </div>}
        </div>
      </div>
    </div>
  );
}

/** Break-glass emergency access: via QR token (?token=) or HMRN ID, with attestation + reason. */
export function EmergencyAccess() {
  const [params] = useSearchParams(); const nav = useNavigate();
  const [f, setF] = useState({ emergency_token: params.get("token") || "", hmrn_id: "", reason: "", attestation: false });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { const d = await api.emergencyAccess(f); nav(`/doctor/patient/${d.patient_id}?emergency=1`); }
    catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };
  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <div className="card" style={{ borderColor: "var(--hmrn-emergency)" }}>
        <h1 style={{ color: "var(--hmrn-emergency)" }}>🆘 Emergency access</h1>
        <p className="small">For patients who cannot consent (unconscious, incapacitated). Access is granted <strong>immediately</strong>, limited in time, and <strong>logged with your name, registration number and reason</strong>. The patient is notified. Misuse is a serious breach.</p>
        <Alert kind="error">{err}</Alert>
        <form className="form" onSubmit={submit}>
          {f.emergency_token ? <Alert kind="info">Emergency QR token detected from the patient's card.</Alert> :
            <Field label="Patient HMRN ID"><input value={f.hmrn_id} onChange={(e) => setF({ ...f, hmrn_id: e.target.value.toUpperCase() })} placeholder="HMRN-XXXXXXXX" required={!f.emergency_token} /></Field>}
          <Field label="Clinical reason (required)"><textarea required minLength={10} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. Unconscious after road traffic accident, brought to ER at 14:20, no relatives present" /></Field>
          <label className="checkbox"><input type="checkbox" checked={f.attestation} onChange={(e) => setF({ ...f, attestation: e.target.checked })} required /> I attest that this is a genuine medical emergency and the patient cannot provide consent.</label>
          <button className="btn danger lg" disabled={busy}>{busy ? "Opening…" : "Open emergency record"}</button>
        </form>
      </div>
    </div>
  );
}

/** Patient record view for an authorised doctor: emergency summary first, then full timeline/documents/assistant. */
export function DoctorPatientView() {
  const { id } = useParams(); const [params] = useSearchParams();
  const [rec, setRec] = useState(null); const [summary, setSummary] = useState(null); const [err, setErr] = useState(""); const [tab, setTab] = useState("summary");
  useEffect(() => {
    Promise.all([api.record(id), api.emergencySummary(id)]).then(([r, s]) => { setRec(r); setSummary(s); }).catch((e) => setErr(e.message));
  }, [id]);
  if (err) return <div className="container"><Alert kind="error">{err}</Alert><Link to="/doctor">← Back</Link></div>;
  if (!rec) return <Loading />;
  const p = rec.patient, es = summary.emergency_summary, g = summary.grant;
  return (
    <div className="container">
      {params.get("emergency") && <Alert kind="warn">🆘 Emergency (break-glass) access granted. Expires {fmtDateTime(g.expires_at)}. This access has been logged and the patient notified.</Alert>}
      <div className="page-head"><div><h1>{p.full_name}</h1><p className="muted"><span className="mono">{p.hmrn_id}</span> · {p.age ?? "?"} y · {p.gender || "—"} · Blood group <span className="blood">{p.blood_group || "?"}</span> · memory since {fmtDate(p.memory_started_at)}</p></div>
        <div className="actions"><span className={`badge ${g.grant_type === "emergency" ? "danger" : "success"}`}>{g.grant_type} access</span><Link className="btn secondary sm" to="/doctor">← Portal</Link></div></div>
      <Alert kind="info">{es.disclaimer}</Alert>

      <div className="tabs">{[["summary", "Emergency summary"], ["timeline", "Full timeline"], ["documents", `Documents (${rec.documents.length})`], ["assistant", "AI assistant"], ["card", "Emergency card"]].map(([k, t]) => <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{t}</button>)}</div>

      {tab === "summary" && <>
        <div className="grid grid-2">
          <div className="card" style={{ borderColor: rec.allergies.length ? "var(--hmrn-emergency)" : undefined }}>
            <div className="card-head"><h2>⚠️ Allergies</h2><span className="badge danger">{rec.allergies.length}</span></div>
            {!rec.allergies.length ? <p className="muted">No allergies recorded (absence of a record is not proof of absence).</p> : <div className="list">{rec.allergies.map((a) => <div key={a.id} className="item"><div><strong>{a.allergen}</strong> <SeverityBadge s={a.severity} /><div className="meta">{a.reaction || "reaction unspecified"} · <SourceBadge source={a.source} docId={a.source_document_id} /> · {fmtDate(a.recorded_at)}</div></div></div>)}</div>}
          </div>
          <div className="card">
            <div className="card-head"><h2>💊 Current medications</h2><span className="badge success">{rec.medications.length}</span></div>
            {!rec.medications.length ? <p className="muted">None recorded.</p> : <div className="table-wrap"><table><thead><tr><th>Drug</th><th>Dose</th><th>Frequency</th><th>For</th><th>Source</th></tr></thead><tbody>{rec.medications.map((m) => <tr key={m.id}><td><strong>{m.name}</strong></td><td>{m.dosage}</td><td>{m.frequency}</td><td className="small">{m.purpose}{m.prescribed_by && <div className="muted">by {m.prescribed_by}</div>}</td><td><SourceBadge source={m.source} docId={m.source_document_id} /></td></tr>)}</tbody></table></div>}
          </div>
        </div>
        <div className="grid grid-2" style={{ marginTop: "1rem" }}>
          <div className="card"><h2>Patient-reported</h2>
            <p><strong>Chronic conditions:</strong> {p.chronic_conditions || "—"}</p>
            <p><strong>Emergency notes:</strong> {p.emergency_notes || "—"}</p>
            <p><strong>Organ donor:</strong> {p.organ_donor ? "Yes" : "Not recorded"}</p>
            <p><strong>Emergency contact:</strong> {p.emergency_contact_name || "—"} {p.emergency_contact_relation && `(${p.emergency_contact_relation})`} {p.emergency_contact_phone}</p></div>
          <div className="card"><h2>Critical history</h2>
            {!es.critical_events.length ? <p className="muted">No surgeries, hospitalisations, diagnoses or injuries recorded.</p> : <div className="list">{es.critical_events.map((e) => <div key={e.id} className="item"><div><span className="badge">{label(e.event_type)}</span> <strong>{e.title}</strong><div className="meta">{fmtDate(e.event_date)} {e.facility && `· ${e.facility}`} {e.provider && `· ${e.provider}`}</div>{e.description && <div className="small">{e.description.slice(0, 220)}{e.description.length > 220 ? "…" : ""}</div>}</div></div>)}</div>}
          </div>
        </div>
      </>}
      {tab === "timeline" && <div className="card"><Timeline events={rec.events} docLink={api.documentFileUrl} /></div>}
      {tab === "documents" && <div className="card">{!rec.documents.length ? <Empty>No documents.</Empty> : <div className="table-wrap"><table><thead><tr><th>File</th><th>Type</th><th>Date</th><th>Status</th><th>Summary</th></tr></thead><tbody>
        {rec.documents.map((d) => <tr key={d.id}><td><a href={api.documentFileUrl(d.id)} target="_blank" rel="noreferrer">{d.original_filename}</a></td><td>{label(d.doc_type)}</td><td>{fmtDate(d.document_date)}</td><td><span className={`badge ${d.status === "confirmed" ? "success" : "gray"}`}>{label(d.status)}</span></td><td className="small">{d.extraction?.summary}</td></tr>)}
      </tbody></table></div>}<p className="small muted" style={{ marginTop: ".6rem" }}>Only patient-confirmed extractions are in the health memory; unconfirmed documents are listed for completeness.</p></div>}
      {tab === "assistant" && <Assistant patientId={Number(id)} />}
      {tab === "card" && <EmergencyCard patient={p} allergies={rec.allergies} medications={rec.medications} />}
    </div>
  );
}

export function DoctorProfilePage() {
  const { profile, setProfile } = useAuth();
  const [f, setF] = useState(profile); const [msg, setMsg] = useState("");
  const save = async (e) => { e.preventDefault(); const d = await api.updateDoctor(f); setProfile(d); setMsg("Saved."); };
  return (
    <div className="container" style={{ maxWidth: 640 }}><h1>Doctor profile</h1><Alert kind="success">{msg}</Alert>
      <form className="card form" onSubmit={save}>
        <div className="form-row"><Field label="Registration number"><input value={f.registration_number || ""} onChange={(e) => setF({ ...f, registration_number: e.target.value })} /></Field><Field label="Specialization"><input value={f.specialization || ""} onChange={(e) => setF({ ...f, specialization: e.target.value })} /></Field></div>
        <div className="form-row"><Field label="Hospital / clinic"><input value={f.hospital || ""} onChange={(e) => setF({ ...f, hospital: e.target.value })} /></Field><Field label="Phone"><input value={f.phone || ""} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field></div>
        <div><button className="btn">Save</button></div>
      </form></div>
  );
}
