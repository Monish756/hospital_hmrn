import { useCallback, useEffect, useRef, useState } from "react";
import { api, EVENT_TYPES, SEVERITIES, label, fmtDateTime } from "../lib/api";
import { Alert, Field, Loading, Modal, Empty } from "../components/ui";

const STATUS_BADGE = { queued: "gray", processing: "warn", needs_review: "warn", confirmed: "success", failed: "danger" };

/** Health Scanner: upload medical documents, watch OCR+AI processing, review & confirm extracted data. */
export default function Scanner() {
  const [docs, setDocs] = useState(null); const [err, setErr] = useState(""); const [ok, setOk] = useState("");
  const [docType, setDocType] = useState("other"); const [docDate, setDocDate] = useState("");
  const [drag, setDrag] = useState(false); const [uploading, setUploading] = useState(false);
  const [review, setReview] = useState(null); const inputRef = useRef();

  const load = useCallback(() => api.documents().then(setDocs).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  // poll while any document is still processing
  useEffect(() => {
    if (!docs?.some((d) => d.status === "queued" || d.status === "processing")) return;
    const t = setInterval(load, 2500); return () => clearInterval(t);
  }, [docs, load]);

  const upload = async (files) => {
    setErr(""); setOk(""); setUploading(true);
    try {
      for (const f of files) {
        const form = new FormData();
        form.append("file", f); form.append("doc_type", docType); if (docDate) form.append("document_date", docDate);
        await api.uploadDocument(form);
      }
      setOk(`${files.length} file(s) uploaded. OCR and AI extraction are running in the background.`);
      load();
    } catch (ex) { setErr(ex.message); } finally { setUploading(false); }
  };
  const onDrop = (e) => { e.preventDefault(); setDrag(false); upload([...e.dataTransfer.files]); };

  const openReview = async (d) => { const full = await api.document(d.id); setReview(full); };
  const del = async (d) => { if (window.confirm(`Delete ${d.original_filename}? Confirmed records derived from it stay in your memory.`)) { await api.deleteDocument(d.id); load(); } };

  return (
    <div className="container">
      <div className="page-head"><div><h1>Health Scanner</h1><p className="muted">Upload prescriptions, lab reports and discharge summaries. HMRN reads them with OCR, structures them with medical AI, and asks you to confirm before anything joins your health memory.</p></div></div>
      <Alert kind="error">{err}</Alert><Alert kind="success">{ok}</Alert>

      <div className="card">
        <div className="form-row" style={{ marginBottom: ".8rem" }}>
          <Field label="Document type"><select value={docType} onChange={(e) => setDocType(e.target.value)}><option value="other">Auto-detect</option><option value="prescription">Prescription</option><option value="lab_report">Lab report</option><option value="discharge_summary">Discharge summary</option><option value="consultation">Consultation note</option><option value="vaccination">Vaccination record</option></select></Field>
          <Field label="Document date (optional)"><input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} /></Field>
        </div>
        <div className={`dropzone ${drag ? "active" : ""}`} onClick={() => inputRef.current.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
          {uploading ? <span className="spinner" /> : <><strong>Drop files here or click to choose</strong><div className="small muted">PDF, JPG, PNG, TIFF, WEBP · up to 25 MB · photos of paper prescriptions work</div></>}
          <input ref={inputRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.tiff,.bmp,.webp" style={{ display: "none" }} onChange={(e) => upload([...e.target.files])} />
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Your documents</h2><button className="btn ghost sm" onClick={load}>Refresh</button></div>
        {!docs ? <Loading /> : !docs.length ? <Empty>No documents yet.</Empty> : (
          <div className="table-wrap"><table><thead><tr><th>File</th><th>Type</th><th>Status</th><th>Engines</th><th>Uploaded</th><th></th></tr></thead><tbody>
            {docs.map((d) => <tr key={d.id}>
              <td><a href={api.documentFileUrl(d.id)} target="_blank" rel="noreferrer">{d.original_filename}</a><div className="small muted">{(d.size_bytes / 1024).toFixed(0)} KB</div></td>
              <td>{label(d.doc_type)}</td>
              <td><span className={`badge ${STATUS_BADGE[d.status]}`}>{label(d.status)}</span>{d.error && <div className="small" style={{ color: "var(--hmrn-emergency)" }}>{d.error}</div>}</td>
              <td className="small muted">{d.ocr_engine || "—"}<br />{d.extraction_engine || ""}</td>
              <td className="small">{fmtDateTime(d.uploaded_at)}</td>
              <td><div className="actions">
                {d.status === "needs_review" && <button className="btn sm" onClick={() => openReview(d)}>Review</button>}
                {d.status === "confirmed" && <button className="btn secondary sm" onClick={() => openReview(d)}>View</button>}
                {d.status === "failed" && <button className="btn secondary sm" onClick={async () => { await api.reprocessDocument(d.id); load(); }}>Retry</button>}
                <button className="btn ghost sm" onClick={() => del(d)}>✕</button></div></td>
            </tr>)}
          </tbody></table></div>
        )}
      </div>

      {review && <ReviewModal doc={review} onClose={() => setReview(null)} onConfirmed={() => { setReview(null); setOk("Confirmed. The records are now part of your health memory."); load(); }} />}
    </div>
  );
}

function ReviewModal({ doc, onClose, onConfirmed }) {
  const ex = doc.extraction || { events: [], medications: [], allergies: [], warnings: [] };
  const readOnly = doc.status === "confirmed";
  const [events, setEvents] = useState(ex.events.map((e) => ({ ...e, _keep: true })));
  const [meds, setMeds] = useState(ex.medications.map((m) => ({ ...m, _keep: true })));
  const [allergies, setAllergies] = useState(ex.allergies.map((a) => ({ ...a, _keep: true })));
  const [docType, setDocType] = useState(doc.doc_type); const [docDate, setDocDate] = useState(doc.document_date || ex.document_date || "");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [showOcr, setShowOcr] = useState(false);

  const upd = (setter) => (i, k, v) => setter((arr) => arr.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const uE = upd(setEvents), uM = upd(setMeds), uA = upd(setAllergies);

  const confirm = async () => {
    setBusy(true); setErr("");
    try {
      await api.confirmDocument(doc.id, {
        doc_type: docType, document_date: docDate || null, provider: ex.provider, facility: ex.facility,
        events: events.filter((e) => e._keep), medications: meds.filter((m) => m._keep), allergies: allergies.filter((a) => a._keep),
      });
      onConfirmed();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={readOnly ? "Document details" : "Review extracted information"} onClose={onClose}>
      <p className="small muted">{doc.original_filename} · OCR: {doc.ocr_engine} · Extraction: {doc.extraction_engine}</p>
      {ex.summary && <Alert kind="info">{ex.summary}</Alert>}
      {ex.warnings?.length > 0 && <Alert kind="warn"><strong>Check carefully:</strong><ul style={{ margin: ".3rem 0 0 1rem" }}>{ex.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></Alert>}
      <Alert kind="error">{err}</Alert>
      {!readOnly && <Alert kind="warn">Nothing below is saved until you press <strong>Confirm</strong>. Untick anything that is wrong and edit values to match the original document.</Alert>}
      <div className="form-row">
        <Field label="Document type"><select disabled={readOnly} value={docType} onChange={(e) => setDocType(e.target.value)}>{["prescription", "lab_report", "discharge_summary", "consultation", "vaccination", "other"].map((t) => <option key={t} value={t}>{label(t)}</option>)}</select></Field>
        <Field label="Document date"><input disabled={readOnly} type="date" value={docDate || ""} onChange={(e) => setDocDate(e.target.value)} /></Field>
        <Field label="Provider / facility"><input disabled value={[ex.provider, ex.facility].filter(Boolean).join(" · ") || "—"} /></Field>
      </div>

      <div className="review-section"><h3>Medical events ({events.length})</h3>
        {!events.length && <p className="muted small">None detected.</p>}
        {events.map((e, i) => <div className="review-row" key={i}>
          <input type="checkbox" disabled={readOnly} checked={e._keep} onChange={(ev) => uE(i, "_keep", ev.target.checked)} />
          <div className="form">
            <div className="form-row">
              <select disabled={readOnly} value={e.event_type || "other"} onChange={(ev) => uE(i, "event_type", ev.target.value)}>{EVENT_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</select>
              <input disabled={readOnly} value={e.title || ""} onChange={(ev) => uE(i, "title", ev.target.value)} placeholder="Title" />
              <input disabled={readOnly} type="date" value={e.event_date || ""} onChange={(ev) => uE(i, "event_date", ev.target.value)} />
            </div>
            <textarea disabled={readOnly} value={e.description || ""} onChange={(ev) => uE(i, "description", ev.target.value)} style={{ minHeight: 56 }} />
          </div></div>)}
      </div>
      <div className="review-section"><h3>Medications ({meds.length})</h3>
        {!meds.length && <p className="muted small">None detected.</p>}
        {meds.map((m, i) => <div className="review-row" key={i}>
          <input type="checkbox" disabled={readOnly} checked={m._keep} onChange={(ev) => uM(i, "_keep", ev.target.checked)} />
          <div className="form-row">
            <input disabled={readOnly} value={m.name || ""} onChange={(ev) => uM(i, "name", ev.target.value)} placeholder="Name" />
            <input disabled={readOnly} value={m.dosage || ""} onChange={(ev) => uM(i, "dosage", ev.target.value)} placeholder="Dosage" />
            <input disabled={readOnly} value={m.frequency || ""} onChange={(ev) => uM(i, "frequency", ev.target.value)} placeholder="Frequency" />
            <input disabled={readOnly} value={m.purpose || ""} onChange={(ev) => uM(i, "purpose", ev.target.value)} placeholder="Purpose" />
          </div></div>)}
      </div>
      <div className="review-section"><h3>Allergies ({allergies.length})</h3>
        {!allergies.length && <p className="muted small">None detected.</p>}
        {allergies.map((a, i) => <div className="review-row" key={i}>
          <input type="checkbox" disabled={readOnly} checked={a._keep} onChange={(ev) => uA(i, "_keep", ev.target.checked)} />
          <div className="form-row">
            <input disabled={readOnly} value={a.allergen || ""} onChange={(ev) => uA(i, "allergen", ev.target.value)} placeholder="Allergen" />
            <input disabled={readOnly} value={a.reaction || ""} onChange={(ev) => uA(i, "reaction", ev.target.value)} placeholder="Reaction" />
            <select disabled={readOnly} value={a.severity || "moderate"} onChange={(ev) => uA(i, "severity", ev.target.value)}>{SEVERITIES.map((s) => <option key={s}>{s}</option>)}</select>
          </div></div>)}
      </div>

      <button className="btn ghost sm" style={{ marginTop: ".8rem" }} onClick={() => setShowOcr((s) => !s)}>{showOcr ? "Hide" : "Show"} raw OCR text</button>
      {showOcr && <div className="ocr-text">{doc.ocr_text || "(empty)"}</div>}
      <div className="actions" style={{ marginTop: "1rem" }}>
        {!readOnly && <button className="btn accent" disabled={busy} onClick={confirm}>{busy ? "Saving…" : "Confirm & add to health memory"}</button>}
        <a className="btn secondary" href={api.documentFileUrl(doc.id)} target="_blank" rel="noreferrer">Open original</a>
        <button className="btn ghost" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
