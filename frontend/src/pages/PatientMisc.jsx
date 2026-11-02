import { useCallback, useEffect, useState } from "react";
import { api, BLOOD_GROUPS, fmtDateTime, label } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Alert, Field, Loading, Empty } from "../components/ui";
import EmergencyCard from "../components/EmergencyCard";
import Assistant from "../components/Assistant";

export function PatientEmergencyCardPage() {
  const { profile, setProfile } = useAuth();
  const [rec, setRec] = useState(null); const [msg, setMsg] = useState("");
  useEffect(() => { api.record(profile.id).then(setRec); }, [profile.id]);
  const rotate = async () => {
    if (!window.confirm("Rotate the emergency QR token? Previously printed cards will stop working.")) return;
    const d = await api.rotateToken(); setProfile({ ...profile, emergency_token: d.emergency_token }); setMsg("Token rotated. Print a new card.");
  };
  if (!rec) return <Loading />;
  return (
    <div className="container">
      <div className="page-head"><div><h1>Emergency card</h1><p className="muted">Print this and keep it in your wallet. A registered doctor scanning the QR gets time-limited, attested emergency access to the summary below — and you see every access in your audit log.</p></div>
        <div className="actions no-print"><button className="btn" onClick={() => window.print()}>Print card</button><button className="btn secondary" onClick={rotate}>Rotate QR token</button></div></div>
      <Alert kind="success">{msg}</Alert>
      <EmergencyCard patient={rec.patient} allergies={rec.allergies} medications={rec.medications} token={profile.emergency_token} />
      <div className="card no-print" style={{ marginTop: "1rem", maxWidth: 560 }}>
        <h3>Doctors without a scanner</h3>
        <p className="small">They can type your HMRN ID <span className="mono">{rec.patient.hmrn_id}</span> in the Emergency Access page of the Doctor Portal. Keep your emergency notes, blood group and contact up to date on your <a href="/patient/profile">profile</a>.</p>
      </div>
    </div>
  );
}

export function PatientAssistantPage() {
  return <div className="container"><Assistant /></div>;
}

export function PatientAccessPage() {
  const [grants, setGrants] = useState(null); const [audit, setAudit] = useState(null); const [tab, setTab] = useState("grants");
  const load = useCallback(() => { api.myGrants().then(setGrants); api.myAudit().then(setAudit); }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (fn, id) => { await fn(id); load(); };
  return (
    <div className="container">
      <div className="page-head"><div><h1>Access & privacy</h1><p className="muted">Who can see your health memory, and everything that has happened to it.</p></div></div>
      <div className="tabs"><button className={tab === "grants" ? "active" : ""} onClick={() => setTab("grants")}>Doctor access</button><button className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}>Audit log</button></div>
      {tab === "grants" && (!grants ? <Loading /> : !grants.length ? <Empty>No doctor has requested access yet.</Empty> : <div className="list">{grants.map((g) => (
        <div key={g.id} className="item card"><div>
          <strong>Dr. {g.doctor_name}</strong> {g.doctor_hospital && <span className="muted small">· {g.doctor_hospital}</span>}
          <div className="meta">{g.grant_type === "emergency" ? <span className="badge danger">Emergency (break-glass)</span> : <span className="badge">Standard</span>} <span className={`badge ${g.active ? "success" : "gray"}`}>{g.status}</span>{g.expires_at && g.active && <span> · expires {fmtDateTime(g.expires_at)}</span>}</div>
          {g.reason && <div className="small" style={{ marginTop: ".3rem" }}>Reason: {g.reason}</div>}
          <div className="meta">requested {fmtDateTime(g.created_at)}</div></div>
          <div className="actions">
            {g.status === "pending" && <button className="btn accent sm" onClick={() => act(api.approveGrant, g.id)}>Approve</button>}
            {(g.status === "pending" || g.active) && <button className="btn danger sm" onClick={() => act(api.revokeGrant, g.id)}>{g.status === "pending" ? "Decline" : "Revoke"}</button>}
          </div></div>
      ))}</div>)}
      {tab === "audit" && (!audit ? <Loading /> : <div className="card table-wrap"><table><thead><tr><th>When</th><th>Action</th><th>By</th><th>Details</th></tr></thead><tbody>
        {audit.map((l) => <tr key={l.id}><td className="small">{fmtDateTime(l.created_at)}</td><td><span className={`badge ${l.action.includes("emergency") ? "danger" : l.action.startsWith("doctor") ? "warn" : "gray"}`}>{label(l.action)}</span></td><td className="small">{l.actor} <span className="muted">({l.actor_role})</span></td><td className="small">{l.detail}</td></tr>)}
      </tbody></table></div>)}
    </div>
  );
}

export function PatientProfilePage() {
  const { profile, setProfile, user, refresh } = useAuth();
  const [f, setF] = useState({ ...profile, full_name: user.full_name }); const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const save = async (e) => { e.preventDefault(); setErr(""); try { const p = await api.updatePatient(f); setProfile(p); refresh(); setMsg("Profile updated."); } catch (ex) { setErr(ex.message); } };
  const changePw = async (e) => { e.preventDefault(); setErr(""); try { await api.changePassword(pw); setPw({ current_password: "", new_password: "" }); setMsg("Password changed."); } catch (ex) { setErr(ex.message); } };
  return (
    <div className="container" style={{ maxWidth: 820 }}>
      <h1>Profile</h1><p className="muted">HMRN ID <span className="mono">{profile.hmrn_id}</span></p>
      <Alert kind="success">{msg}</Alert><Alert kind="error">{err}</Alert>
      <form className="card form" onSubmit={save}>
        <div className="form-row">
          <Field label="Full name"><input value={f.full_name || ""} onChange={set("full_name")} /></Field>
          <Field label="Date of birth"><input type="date" value={f.date_of_birth || ""} onChange={set("date_of_birth")} /></Field>
          <Field label="Gender"><select value={f.gender || ""} onChange={set("gender")}><option value="">—</option><option>male</option><option>female</option><option>other</option></select></Field>
          <Field label="Blood group"><select value={f.blood_group || ""} onChange={set("blood_group")}><option value="">—</option>{BLOOD_GROUPS.map((b) => <option key={b}>{b}</option>)}</select></Field>
        </div>
        <div className="form-row"><Field label="Phone"><input value={f.phone || ""} onChange={set("phone")} /></Field><Field label="Address"><input value={f.address || ""} onChange={set("address")} /></Field></div>
        <div className="form-row">
          <Field label="Emergency contact"><input value={f.emergency_contact_name || ""} onChange={set("emergency_contact_name")} /></Field>
          <Field label="Contact phone"><input value={f.emergency_contact_phone || ""} onChange={set("emergency_contact_phone")} /></Field>
          <Field label="Relationship"><input value={f.emergency_contact_relation || ""} onChange={set("emergency_contact_relation")} /></Field>
        </div>
        <Field label="Chronic conditions"><textarea value={f.chronic_conditions || ""} onChange={set("chronic_conditions")} /></Field>
        <Field label="Emergency notes (shown on your card, e.g. pacemaker, DNR wishes, implants)"><textarea value={f.emergency_notes || ""} onChange={set("emergency_notes")} /></Field>
        <label className="checkbox"><input type="checkbox" checked={!!f.organ_donor} onChange={set("organ_donor")} /> Registered organ donor</label>
        <div><button className="btn">Save profile</button></div>
      </form>
      <form className="card form" onSubmit={changePw}>
        <h3>Change password</h3>
        <div className="form-row"><Field label="Current password"><input type="password" required value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field><Field label="New password"><input type="password" minLength={8} required value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field></div>
        <div><button className="btn secondary">Update password</button></div>
      </form>
    </div>
  );
}
