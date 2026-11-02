import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function Landing() {
  const { user } = useAuth();
  const portal = user ? (user.role === "patient" ? "/patient" : "/doctor") : null;
  return (
    <>
      <section className="hero">
        <div className="hero-inner">
          <div>
            <span className="badge" style={{ background: "rgba(255,255,255,.2)", color: "#fff" }}>Health Memory Recovery Network</span>
            <h1>Your medical history, available when you can't speak for yourself.</h1>
            <p>HMRN keeps a continuous, verified health memory — allergies, medications, surgeries, prescriptions and reports — and lets authorised doctors reach it in an emergency through your HMRN ID or emergency QR card.</p>
            <div className="actions" style={{ marginTop: "1.2rem" }}>
              {portal ? <Link className="btn secondary lg" to={portal}>Open my portal</Link> : <>
                <Link className="btn secondary lg" to="/register">Create a health memory</Link>
                <Link className="btn lg" style={{ background: "rgba(255,255,255,.15)" }} to="/login">Sign in</Link>
              </>}
            </div>
          </div>
          <div className="card" style={{ color: "var(--hmrn-text)" }}>
            <h3>The emergency scenario</h3>
            <p className="small">A patient is brought in unconscious after an accident. Family hasn't arrived. The treating doctor scans the HMRN emergency QR, attests to the emergency, and within seconds sees:</p>
            <ul className="small" style={{ paddingLeft: "1.1rem", margin: ".4rem 0" }}>
              <li>Blood group, known allergies and severity</li>
              <li>Current medications and dosages</li>
              <li>Previous surgeries, hospitalisations and diagnoses</li>
              <li>Source documents — prescriptions, lab reports, discharge summaries</li>
            </ul>
            <p className="small muted">Every access is time-limited, logged and visible to the patient. HMRN supports clinical decisions; it never makes them.</p>
          </div>
        </div>
      </section>
      <section className="features grid grid-4">
        {[
          ["🧠", "Continuous health memory", "A chronological timeline from the day your account is created — every event dated and sourced."],
          ["📄", "Health scanner", "Upload prescriptions, lab reports and discharge summaries. OCR + AI extract the facts; you confirm before anything is saved."],
          ["🆘", "Emergency card & QR", "A printable card with your HMRN ID and a QR that opens a break-glass workflow for registered doctors."],
          ["🔐", "Privacy by design", "Standard access needs your approval. Emergency access is attested, time-boxed and fully audited."],
        ].map(([i, t, d]) => <div key={t} className="feature"><div className="icon">{i}</div><h3>{t}</h3><p className="small muted">{d}</p></div>)}
      </section>
    </>
  );
}
