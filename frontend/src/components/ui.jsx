import { useEffect, useState } from "react";
import { NavLink, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function Nav() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const doLogout = async () => { await logout(); nav("/"); };
  const links = !user ? [
    ["/", "Home"], ["/login", "Sign in"], ["/register", "Create account"],
  ] : user.role === "patient" ? [
    ["/patient", "Dashboard"], ["/patient/timeline", "Timeline"], ["/patient/scanner", "Health Scanner"],
    ["/patient/assistant", "AI Assistant"], ["/patient/emergency-card", "Emergency Card"], ["/patient/access", "Access & Privacy"],
    ["/patient/profile", "Profile"],
  ] : [
    ["/doctor", "Doctor Portal"], ["/doctor/emergency", "Emergency Access"], ["/doctor/profile", "Profile"],
  ];
  return (
    <header className="nav">
      <div className="nav-inner">
        <Link to="/" className="brand"><span className="brand-mark">H</span>HMRN</Link>
        <button className="nav-toggle" aria-label="Menu" onClick={() => setOpen((o) => !o)}>☰</button>
        <nav className={`nav-links ${open ? "open" : ""}`} onClick={() => setOpen(false)}>
          {links.map(([to, t]) => <NavLink key={to} to={to} end={to === "/patient" || to === "/doctor" || to === "/"}>{t}</NavLink>)}
          {user && <button onClick={doLogout}>Sign out ({user.full_name.split(" ")[0]})</button>}
        </nav>
      </div>
    </header>
  );
}

export function Alert({ kind = "info", children }) {
  if (!children) return null;
  return <div className={`alert ${kind}`}>{children}</div>;
}

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="card-head"><h2>{title}</h2><button className="btn ghost sm" onClick={onClose}>✕</button></div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return <label className="field">{label}{children}</label>;
}

export function Loading() {
  return <div style={{ padding: "2rem", textAlign: "center" }}><span className="spinner" /></div>;
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function SeverityBadge({ s }) {
  const cls = s === "life-threatening" || s === "severe" || s === "high" ? "danger" : s === "moderate" ? "warn" : "gray";
  return <span className={`badge ${cls}`}>{s || "n/a"}</span>;
}

export function SourceBadge({ source, docId }) {
  return <span className="badge gray" title={docId ? `From document #${docId}` : "Entered by patient"}>
    {source === "document" ? `document #${docId}` : source}
  </span>;
}
