import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { BLOOD_GROUPS } from "../lib/api";
import { Alert, Field } from "../components/ui";

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ email: "", password: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { const d = await login(f); nav(d.user.role === "patient" ? "/patient" : "/doctor"); }
    catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };
  return (
    <div className="container" style={{ maxWidth: 460 }}>
      <div className="card">
        <h1>Sign in</h1>
        <p className="muted">Access your HMRN patient or doctor portal.</p>
        <Alert kind="error">{err}</Alert>
        <form className="form" onSubmit={submit}>
          <Field label="Email"><input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Password"><input type="password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          <button className="btn lg" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <p className="small muted" style={{ marginTop: "1rem" }}>New here? <Link to="/register">Create an account</Link></p>
      </div>
    </div>
  );
}

export function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [role, setRole] = useState("patient");
  const [f, setF] = useState({ full_name: "", email: "", password: "", blood_group: "", gender: "", date_of_birth: "",
    phone: "", emergency_contact_name: "", emergency_contact_phone: "", emergency_contact_relation: "",
    chronic_conditions: "", registration_number: "", specialization: "", hospital: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { await register({ ...f, role }); nav(role === "patient" ? "/patient" : "/doctor"); }
    catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };
  return (
    <div className="container" style={{ maxWidth: 720 }}>
      <div className="card">
        <h1>Create your HMRN account</h1>
        <div className="tabs">
          <button className={role === "patient" ? "active" : ""} onClick={() => setRole("patient")} type="button">I'm a patient</button>
          <button className={role === "doctor" ? "active" : ""} onClick={() => setRole("doctor")} type="button">I'm a doctor</button>
        </div>
        <Alert kind="error">{err}</Alert>
        <form className="form" onSubmit={submit}>
          <div className="form-row">
            <Field label="Full name"><input required value={f.full_name} onChange={set("full_name")} /></Field>
            <Field label="Email"><input type="email" required value={f.email} onChange={set("email")} /></Field>
            <Field label="Password (min 8 chars)"><input type="password" minLength={8} required value={f.password} onChange={set("password")} /></Field>
          </div>
          {role === "patient" ? <>
            <div className="form-row">
              <Field label="Date of birth"><input type="date" value={f.date_of_birth} onChange={set("date_of_birth")} /></Field>
              <Field label="Gender"><select value={f.gender} onChange={set("gender")}><option value="">—</option><option>male</option><option>female</option><option>other</option></select></Field>
              <Field label="Blood group"><select value={f.blood_group} onChange={set("blood_group")}><option value="">—</option>{BLOOD_GROUPS.map((b) => <option key={b}>{b}</option>)}</select></Field>
              <Field label="Phone"><input value={f.phone} onChange={set("phone")} /></Field>
            </div>
            <div className="form-row">
              <Field label="Emergency contact name"><input value={f.emergency_contact_name} onChange={set("emergency_contact_name")} /></Field>
              <Field label="Emergency contact phone"><input value={f.emergency_contact_phone} onChange={set("emergency_contact_phone")} /></Field>
              <Field label="Relationship"><input value={f.emergency_contact_relation} onChange={set("emergency_contact_relation")} placeholder="spouse, parent…" /></Field>
            </div>
            <Field label="Known chronic conditions (optional)"><textarea value={f.chronic_conditions} onChange={set("chronic_conditions")} placeholder="e.g. Type 2 diabetes, hypertension" /></Field>
          </> : <>
            <div className="form-row">
              <Field label="Medical registration number"><input required value={f.registration_number} onChange={set("registration_number")} /></Field>
              <Field label="Specialization"><input value={f.specialization} onChange={set("specialization")} /></Field>
              <Field label="Hospital / clinic"><input value={f.hospital} onChange={set("hospital")} /></Field>
              <Field label="Phone"><input value={f.phone} onChange={set("phone")} /></Field>
            </div>
            <Alert kind="warn">Doctor accounts are marked unverified until an administrator confirms the registration number. Emergency access is always attested and audited.</Alert>
          </>}
          <button className="btn lg" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
        </form>
        <p className="small muted" style={{ marginTop: "1rem" }}>Already registered? <Link to="/login">Sign in</Link></p>
      </div>
    </div>
  );
}
