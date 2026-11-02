import { useCallback, useEffect, useState } from "react";
import { api, EVENT_TYPES, SEVERITIES, label, fmtDate } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Alert, Field, Loading, Modal, SeverityBadge, SourceBadge, Empty } from "../components/ui";
import Timeline from "../components/Timeline";

const emptyEvent = { event_type: "consultation", title: "", description: "", event_date: "", provider: "", facility: "", severity: "" };
const emptyMed = { name: "", dosage: "", frequency: "", route: "", purpose: "", prescribed_by: "", start_date: "" };
const emptyAllergy = { allergen: "", reaction: "", severity: "moderate" };

/** Timeline + medications + allergies: the full patient health memory, editable by the patient. */
export default function PatientTimeline() {
  const { profile } = useAuth();
  const [rec, setRec] = useState(null); const [err, setErr] = useState(""); const [ok, setOk] = useState("");
  const [modal, setModal] = useState(null); // {kind:'event'|'med'|'allergy', data, id?}
  const [filter, setFilter] = useState("all");

  const load = useCallback(() => api.record(profile.id).then(setRec).catch((e) => setErr(e.message)), [profile.id]);
  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault(); setErr(""); setOk("");
    const { kind, data, id } = modal;
    try {
      if (kind === "event") id ? await api.updateEvent(id, data) : await api.addEvent(data);
      if (kind === "med") id ? await api.updateMedication(id, data) : await api.addMedication(data);
      if (kind === "allergy") id ? await api.updateAllergy(id, data) : await api.addAllergy(data);
      setModal(null); setOk("Saved to your health memory."); load();
    } catch (ex) { setErr(ex.message); }
  };
  const del = async (kind, item) => {
    if (!window.confirm(`Delete "${item.title || item.name || item.allergen}" from your health memory?`)) return;
    if (kind === "event") await api.deleteEvent(item.id);
    if (kind === "med") await api.deleteMedication(item.id);
    if (kind === "allergy") await api.deleteAllergy(item.id);
    load();
  };
  const toggleMed = async (m) => { await api.updateMedication(m.id, { active: !m.active }); load(); };

  if (!rec) return <Loading />;
  const events = filter === "all" ? rec.events : rec.events.filter((e) => e.event_type === filter);
  const setData = (k) => (e) => setModal({ ...modal, data: { ...modal.data, [k]: e.target.value } });

  return (
    <div className="container">
      <div className="page-head">
        <div><h1>Medical timeline</h1><p className="muted">Every event in your health memory, in chronological order with its source.</p></div>
        <div className="actions">
          <button className="btn" onClick={() => setModal({ kind: "event", data: { ...emptyEvent } })}>+ Add event</button>
          <button className="btn secondary" onClick={() => setModal({ kind: "med", data: { ...emptyMed } })}>+ Medication</button>
          <button className="btn secondary" onClick={() => setModal({ kind: "allergy", data: { ...emptyAllergy } })}>+ Allergy</button>
        </div>
      </div>
      <Alert kind="error">{err}</Alert><Alert kind="success">{ok}</Alert>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-head"><h2>Allergies</h2><span className="badge danger">{rec.allergies.length} active</span></div>
          {!rec.allergies.length ? <Empty>No allergies recorded.</Empty> : <div className="list">{rec.allergies.map((a) => (
            <div key={a.id} className="item"><div><strong>{a.allergen}</strong> <SeverityBadge s={a.severity} /><div className="meta">{a.reaction || "Reaction not specified"} · <SourceBadge source={a.source} docId={a.source_document_id} /></div></div>
              <div className="actions"><button className="btn ghost sm" onClick={() => setModal({ kind: "allergy", id: a.id, data: { allergen: a.allergen, reaction: a.reaction || "", severity: a.severity } })}>Edit</button><button className="btn ghost sm" onClick={() => del("allergy", a)}>✕</button></div></div>
          ))}</div>}
        </div>
        <div className="card">
          <div className="card-head"><h2>Medications</h2><span className="badge success">{rec.medications.length} active</span></div>
          {!rec.medications.length ? <Empty>No active medications.</Empty> : <div className="list">{rec.medications.map((m) => (
            <div key={m.id} className="item"><div><strong>{m.name}</strong> {m.dosage} <span className="muted small">{m.frequency}{m.route ? ` · ${m.route}` : ""}</span>
              <div className="meta">{m.purpose && `${m.purpose} · `}{m.prescribed_by && `by ${m.prescribed_by} · `}since {fmtDate(m.start_date)} · <SourceBadge source={m.source} docId={m.source_document_id} /></div></div>
              <div className="actions"><button className="btn ghost sm" onClick={() => setModal({ kind: "med", id: m.id, data: { name: m.name, dosage: m.dosage || "", frequency: m.frequency || "", route: m.route || "", purpose: m.purpose || "", prescribed_by: m.prescribed_by || "", start_date: m.start_date || "" } })}>Edit</button>
                <button className="btn ghost sm" onClick={() => toggleMed(m)}>Stop</button></div></div>
          ))}</div>}
          {rec.past_medications.length > 0 && <details style={{ marginTop: ".8rem" }}><summary className="small muted">Past medications ({rec.past_medications.length})</summary>
            <div className="list" style={{ marginTop: ".5rem" }}>{rec.past_medications.map((m) => <div key={m.id} className="item"><div><strong>{m.name}</strong> {m.dosage}<div className="meta">{fmtDate(m.start_date)} – {fmtDate(m.end_date)}</div></div><button className="btn ghost sm" onClick={() => toggleMed(m)}>Resume</button></div>)}</div></details>}
        </div>
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <div className="card-head"><h2>Timeline ({events.length})</h2>
          <select style={{ width: "auto" }} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All types</option>{EVENT_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</select></div>
        <Timeline events={events} docLink={api.documentFileUrl}
          onEdit={(e) => setModal({ kind: "event", id: e.id, data: { event_type: e.event_type, title: e.title, description: e.description || "", event_date: e.event_date, provider: e.provider || "", facility: e.facility || "", severity: e.severity || "" } })}
          onDelete={(e) => del("event", e)} />
      </div>

      {modal && <Modal title={`${modal.id ? "Edit" : "Add"} ${modal.kind === "med" ? "medication" : modal.kind}`} onClose={() => setModal(null)}>
        <form className="form" onSubmit={save}>
          {modal.kind === "event" && <>
            <div className="form-row">
              <Field label="Type"><select value={modal.data.event_type} onChange={setData("event_type")}>{EVENT_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</select></Field>
              <Field label="Date"><input type="date" required value={modal.data.event_date} onChange={setData("event_date")} /></Field>
              <Field label="Severity"><select value={modal.data.severity} onChange={setData("severity")}><option value="">—</option><option>low</option><option>moderate</option><option>high</option></select></Field>
            </div>
            <Field label="Title"><input required value={modal.data.title} onChange={setData("title")} placeholder="e.g. Appendectomy" /></Field>
            <Field label="Details"><textarea value={modal.data.description} onChange={setData("description")} /></Field>
            <div className="form-row"><Field label="Doctor"><input value={modal.data.provider} onChange={setData("provider")} /></Field><Field label="Hospital / facility"><input value={modal.data.facility} onChange={setData("facility")} /></Field></div>
          </>}
          {modal.kind === "med" && <>
            <div className="form-row"><Field label="Name"><input required value={modal.data.name} onChange={setData("name")} /></Field><Field label="Dosage"><input value={modal.data.dosage} onChange={setData("dosage")} placeholder="500 mg" /></Field><Field label="Frequency"><input value={modal.data.frequency} onChange={setData("frequency")} placeholder="twice daily / 1-0-1" /></Field></div>
            <div className="form-row"><Field label="Route"><input value={modal.data.route} onChange={setData("route")} placeholder="oral" /></Field><Field label="Purpose"><input value={modal.data.purpose} onChange={setData("purpose")} /></Field><Field label="Prescribed by"><input value={modal.data.prescribed_by} onChange={setData("prescribed_by")} /></Field><Field label="Start date"><input type="date" value={modal.data.start_date} onChange={setData("start_date")} /></Field></div>
          </>}
          {modal.kind === "allergy" && <>
            <div className="form-row"><Field label="Allergen"><input required value={modal.data.allergen} onChange={setData("allergen")} placeholder="Penicillin" /></Field><Field label="Severity"><select value={modal.data.severity} onChange={setData("severity")}>{SEVERITIES.map((s) => <option key={s}>{s}</option>)}</select></Field></div>
            <Field label="Reaction"><input value={modal.data.reaction} onChange={setData("reaction")} placeholder="rash, anaphylaxis…" /></Field>
          </>}
          <div className="actions"><button className="btn">Save</button><button type="button" className="btn secondary" onClick={() => setModal(null)}>Cancel</button></div>
        </form>
      </Modal>}
    </div>
  );
}
