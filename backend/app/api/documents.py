"""Health scanner: upload -> OCR + AI extraction (background) -> patient reviews -> confirmed into memory."""
import json
import os
import uuid

from flask import Blueprint, current_app, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

from ..models import db, Document, MedicalEvent, Medication, Allergy
from ..utils import role_required, login_required, audit, parse_date, resolve_patient_for_doctor
from ..services import worker

bp = Blueprint("documents", __name__, url_prefix="/api/documents")


def _allowed(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in current_app.config["ALLOWED_EXTENSIONS"]


@bp.post("/upload")
@role_required("patient")
def upload():
    p = request.user.patient
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify({"error": "No file provided"}), 400
    if not _allowed(f.filename):
        return jsonify({"error": "Unsupported file type. Use PDF, PNG, JPG, TIFF, BMP or WEBP."}), 400
    ext = f.filename.rsplit(".", 1)[1].lower()
    stored = f"{p.hmrn_id}_{uuid.uuid4().hex}.{ext}"
    folder = current_app.config["UPLOAD_FOLDER"]
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, stored)
    f.save(path)

    doc = Document(patient_id=p.id, uploaded_by_user_id=request.user.id,
                   original_filename=secure_filename(f.filename) or f"document.{ext}",
                   stored_filename=stored, mime_type=f.mimetype, size_bytes=os.path.getsize(path),
                   doc_type=request.form.get("doc_type") or "other",
                   document_date=parse_date(request.form.get("document_date")), status="queued")
    db.session.add(doc)
    audit("upload_document", patient_id=p.id, detail=doc.original_filename)
    db.session.commit()
    worker.enqueue(current_app._get_current_object(), doc.id)
    return jsonify(doc.to_dict()), 202


@bp.get("")
@role_required("patient")
def list_docs():
    docs = Document.query.filter_by(patient_id=request.user.patient.id).order_by(Document.uploaded_at.desc()).all()
    return jsonify([d.to_dict() for d in docs])


def _get_doc_for_viewer(doc_id):
    doc = Document.query.get_or_404(doc_id)
    patient, err = resolve_patient_for_doctor(doc.patient_id)
    if err:
        return None, err
    return doc, None


@bp.get("/<int:doc_id>")
@login_required
def get_doc(doc_id):
    doc, err = _get_doc_for_viewer(doc_id)
    if err:
        return err
    return jsonify(doc.to_dict(include_text=True))


@bp.get("/<int:doc_id>/file")
@login_required
def get_file(doc_id):
    doc, err = _get_doc_for_viewer(doc_id)
    if err:
        return err
    if request.user.role == "doctor":
        audit("doctor_view_document", patient_id=doc.patient_id, detail=doc.original_filename)
        db.session.commit()
    return send_from_directory(current_app.config["UPLOAD_FOLDER"], doc.stored_filename,
                               as_attachment=False, download_name=doc.original_filename)


@bp.post("/<int:doc_id>/reprocess")
@role_required("patient")
def reprocess(doc_id):
    doc = Document.query.filter_by(id=doc_id, patient_id=request.user.patient.id).first_or_404()
    doc.status = "queued"
    db.session.commit()
    worker.enqueue(current_app._get_current_object(), doc.id)
    return jsonify(doc.to_dict()), 202


@bp.post("/<int:doc_id>/confirm")
@role_required("patient")
def confirm(doc_id):
    """Patient confirms (possibly edited) extracted items. Only confirmed items enter the health memory."""
    p = request.user.patient
    doc = Document.query.filter_by(id=doc_id, patient_id=p.id).first_or_404()
    d = request.get_json(silent=True) or {}
    created = {"events": 0, "medications": 0, "allergies": 0}

    for ev in d.get("events", []):
        if not (ev.get("title") or "").strip():
            continue
        ed = parse_date(ev.get("event_date")) or doc.document_date or doc.uploaded_at.date()
        db.session.add(MedicalEvent(
            patient_id=p.id, event_type=ev.get("event_type") or "other", title=ev["title"].strip(),
            description=ev.get("description"), event_date=ed, provider=ev.get("provider") or d.get("provider"),
            facility=ev.get("facility") or d.get("facility"), severity=ev.get("severity"),
            source="document", source_document_id=doc.id, created_by_user_id=request.user.id))
        created["events"] += 1

    for m in d.get("medications", []):
        if not (m.get("name") or "").strip():
            continue
        db.session.add(Medication(
            patient_id=p.id, name=m["name"].strip(), dosage=m.get("dosage"), frequency=m.get("frequency"),
            route=m.get("route"), purpose=m.get("purpose"), prescribed_by=m.get("prescribed_by") or d.get("provider"),
            start_date=parse_date(m.get("start_date")) or doc.document_date, source="document",
            source_document_id=doc.id))
        created["medications"] += 1

    for a in d.get("allergies", []):
        if not (a.get("allergen") or "").strip():
            continue
        exists = Allergy.query.filter(Allergy.patient_id == p.id,
                                      db.func.lower(Allergy.allergen) == a["allergen"].strip().lower()).first()
        if exists:
            continue
        db.session.add(Allergy(patient_id=p.id, allergen=a["allergen"].strip(), reaction=a.get("reaction"),
                               severity=a.get("severity") or "moderate", source="document",
                               source_document_id=doc.id))
        created["allergies"] += 1

    if d.get("doc_type"):
        doc.doc_type = d["doc_type"]
    if d.get("document_date"):
        doc.document_date = parse_date(d["document_date"])
    doc.status = "confirmed"
    audit("confirm_document", patient_id=p.id, detail=f"{doc.original_filename}: {json.dumps(created)}")
    db.session.commit()
    return jsonify({"document": doc.to_dict(), "created": created})


@bp.delete("/<int:doc_id>")
@role_required("patient")
def delete_doc(doc_id):
    doc = Document.query.filter_by(id=doc_id, patient_id=request.user.patient.id).first_or_404()
    try:
        os.remove(os.path.join(current_app.config["UPLOAD_FOLDER"], doc.stored_filename))
    except OSError:
        pass
    audit("delete_document", patient_id=doc.patient_id, detail=doc.original_filename)
    db.session.delete(doc)
    db.session.commit()
    return jsonify({"ok": True})
