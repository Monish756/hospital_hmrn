"""Patient portal API: profile, allergies, medications, timeline events, audit log, access grants."""
from flask import Blueprint, jsonify, request

from ..models import db, Allergy, Medication, MedicalEvent, AccessGrant, AuditLog, Document
from ..utils import role_required, login_required, audit, parse_date, resolve_patient_for_doctor, expire_grants

bp = Blueprint("patients", __name__, url_prefix="/api/patients")

EVENT_TYPES = {"diagnosis", "surgery", "hospitalization", "prescription", "lab_result",
               "vaccination", "consultation", "injury", "other"}


# ---------- Profile ----------
@bp.get("/me")
@role_required("patient")
def my_profile():
    return jsonify(request.user.patient.to_dict())


@bp.put("/me")
@role_required("patient")
def update_profile():
    p = request.user.patient
    data = request.get_json(silent=True) or {}
    for f in ("gender", "blood_group", "phone", "address", "emergency_contact_name",
              "emergency_contact_phone", "emergency_contact_relation", "chronic_conditions", "emergency_notes"):
        if f in data:
            setattr(p, f, data[f])
    if "date_of_birth" in data:
        p.date_of_birth = parse_date(data["date_of_birth"])
    if "organ_donor" in data:
        p.organ_donor = bool(data["organ_donor"])
    if "full_name" in data and data["full_name"].strip():
        request.user.full_name = data["full_name"].strip()
    audit("update_profile", patient_id=p.id)
    db.session.commit()
    return jsonify(p.to_dict())


@bp.post("/me/rotate-emergency-token")
@role_required("patient")
def rotate_token():
    p = request.user.patient
    p.rotate_emergency_token()
    audit("rotate_emergency_token", patient_id=p.id)
    db.session.commit()
    return jsonify({"emergency_token": p.emergency_token})


# ---------- Summary / full record (patient or authorized doctor) ----------
@bp.get("/<int:patient_id>/record")
@login_required
def full_record(patient_id):
    expire_grants()
    patient, err = resolve_patient_for_doctor(patient_id)
    if err:
        return err
    if request.user.role == "doctor":
        audit("doctor_view_record", patient_id=patient.id,
              detail=f"Dr. {request.user.full_name} viewed full record")
        db.session.commit()
    events = sorted(patient.events, key=lambda e: (e.event_date, e.created_at), reverse=True)
    return jsonify({
        "patient": patient.to_dict(include_private=(request.user.role == "patient")),
        "allergies": [a.to_dict() for a in patient.allergies if a.active],
        "inactive_allergies": [a.to_dict() for a in patient.allergies if not a.active],
        "medications": [m.to_dict() for m in patient.medications if m.active],
        "past_medications": [m.to_dict() for m in patient.medications if not m.active],
        "events": [e.to_dict() for e in events],
        "documents": [d.to_dict() for d in sorted(patient.documents, key=lambda d: d.uploaded_at, reverse=True)],
    })


# ---------- Allergies ----------
@bp.post("/me/allergies")
@role_required("patient")
def add_allergy():
    p = request.user.patient
    d = request.get_json(silent=True) or {}
    if not (d.get("allergen") or "").strip():
        return jsonify({"error": "allergen required"}), 400
    a = Allergy(patient_id=p.id, allergen=d["allergen"].strip(), reaction=d.get("reaction"),
                severity=d.get("severity") or "moderate", source="patient")
    db.session.add(a)
    audit("add_allergy", patient_id=p.id, detail=a.allergen)
    db.session.commit()
    return jsonify(a.to_dict()), 201


@bp.put("/me/allergies/<int:aid>")
@role_required("patient")
def update_allergy(aid):
    a = Allergy.query.filter_by(id=aid, patient_id=request.user.patient.id).first_or_404()
    d = request.get_json(silent=True) or {}
    for f in ("allergen", "reaction", "severity"):
        if f in d:
            setattr(a, f, d[f])
    if "active" in d:
        a.active = bool(d["active"])
    audit("update_allergy", patient_id=a.patient_id, detail=a.allergen)
    db.session.commit()
    return jsonify(a.to_dict())


@bp.delete("/me/allergies/<int:aid>")
@role_required("patient")
def delete_allergy(aid):
    a = Allergy.query.filter_by(id=aid, patient_id=request.user.patient.id).first_or_404()
    audit("delete_allergy", patient_id=a.patient_id, detail=a.allergen)
    db.session.delete(a)
    db.session.commit()
    return jsonify({"ok": True})


# ---------- Medications ----------
@bp.post("/me/medications")
@role_required("patient")
def add_medication():
    p = request.user.patient
    d = request.get_json(silent=True) or {}
    if not (d.get("name") or "").strip():
        return jsonify({"error": "name required"}), 400
    m = Medication(patient_id=p.id, name=d["name"].strip(), dosage=d.get("dosage"),
                   frequency=d.get("frequency"), route=d.get("route"), purpose=d.get("purpose"),
                   prescribed_by=d.get("prescribed_by"), start_date=parse_date(d.get("start_date")),
                   end_date=parse_date(d.get("end_date")), source="patient")
    db.session.add(m)
    audit("add_medication", patient_id=p.id, detail=m.name)
    db.session.commit()
    return jsonify(m.to_dict()), 201


@bp.put("/me/medications/<int:mid>")
@role_required("patient")
def update_medication(mid):
    m = Medication.query.filter_by(id=mid, patient_id=request.user.patient.id).first_or_404()
    d = request.get_json(silent=True) or {}
    for f in ("name", "dosage", "frequency", "route", "purpose", "prescribed_by"):
        if f in d:
            setattr(m, f, d[f])
    if "start_date" in d:
        m.start_date = parse_date(d["start_date"])
    if "end_date" in d:
        m.end_date = parse_date(d["end_date"])
    if "active" in d:
        m.active = bool(d["active"])
    audit("update_medication", patient_id=m.patient_id, detail=m.name)
    db.session.commit()
    return jsonify(m.to_dict())


@bp.delete("/me/medications/<int:mid>")
@role_required("patient")
def delete_medication(mid):
    m = Medication.query.filter_by(id=mid, patient_id=request.user.patient.id).first_or_404()
    audit("delete_medication", patient_id=m.patient_id, detail=m.name)
    db.session.delete(m)
    db.session.commit()
    return jsonify({"ok": True})


# ---------- Timeline events ----------
@bp.post("/me/events")
@role_required("patient")
def add_event():
    p = request.user.patient
    d = request.get_json(silent=True) or {}
    et = d.get("event_type") or "other"
    if et not in EVENT_TYPES:
        return jsonify({"error": f"event_type must be one of {sorted(EVENT_TYPES)}"}), 400
    if not (d.get("title") or "").strip():
        return jsonify({"error": "title required"}), 400
    ed = parse_date(d.get("event_date"))
    if not ed:
        return jsonify({"error": "event_date (YYYY-MM-DD) required"}), 400
    e = MedicalEvent(patient_id=p.id, event_type=et, title=d["title"].strip(), description=d.get("description"),
                     event_date=ed, provider=d.get("provider"), facility=d.get("facility"),
                     severity=d.get("severity"), source="patient", created_by_user_id=request.user.id)
    db.session.add(e)
    audit("add_event", patient_id=p.id, detail=e.title)
    db.session.commit()
    return jsonify(e.to_dict()), 201


@bp.put("/me/events/<int:eid>")
@role_required("patient")
def update_event(eid):
    e = MedicalEvent.query.filter_by(id=eid, patient_id=request.user.patient.id).first_or_404()
    d = request.get_json(silent=True) or {}
    for f in ("title", "description", "provider", "facility", "severity"):
        if f in d:
            setattr(e, f, d[f])
    if "event_type" in d and d["event_type"] in EVENT_TYPES:
        e.event_type = d["event_type"]
    if "event_date" in d and parse_date(d["event_date"]):
        e.event_date = parse_date(d["event_date"])
    audit("update_event", patient_id=e.patient_id, detail=e.title)
    db.session.commit()
    return jsonify(e.to_dict())


@bp.delete("/me/events/<int:eid>")
@role_required("patient")
def delete_event(eid):
    e = MedicalEvent.query.filter_by(id=eid, patient_id=request.user.patient.id).first_or_404()
    audit("delete_event", patient_id=e.patient_id, detail=e.title)
    db.session.delete(e)
    db.session.commit()
    return jsonify({"ok": True})


# ---------- Access grants (patient side) ----------
@bp.get("/me/access")
@role_required("patient")
def my_grants():
    expire_grants()
    p = request.user.patient
    return jsonify([g.to_dict() for g in sorted(p.grants, key=lambda g: g.created_at, reverse=True)])


@bp.post("/me/access/<int:gid>/approve")
@role_required("patient")
def approve_grant(gid):
    g = AccessGrant.query.filter_by(id=gid, patient_id=request.user.patient.id).first_or_404()
    g.status = "approved"
    g.expires_at = None
    audit("approve_access", patient_id=g.patient_id, detail=f"doctor {g.doctor.user.full_name}")
    db.session.commit()
    return jsonify(g.to_dict())


@bp.post("/me/access/<int:gid>/revoke")
@role_required("patient")
def revoke_grant(gid):
    g = AccessGrant.query.filter_by(id=gid, patient_id=request.user.patient.id).first_or_404()
    g.status = "revoked"
    audit("revoke_access", patient_id=g.patient_id, detail=f"doctor {g.doctor.user.full_name}")
    db.session.commit()
    return jsonify(g.to_dict())


# ---------- Audit log ----------
@bp.get("/me/audit")
@role_required("patient")
def my_audit():
    logs = AuditLog.query.filter_by(patient_id=request.user.patient.id)\
        .order_by(AuditLog.created_at.desc()).limit(200).all()
    return jsonify([l.to_dict() for l in logs])


# ---------- Dashboard stats ----------
@bp.get("/me/dashboard")
@role_required("patient")
def dashboard():
    expire_grants()
    p = request.user.patient
    pending_docs = Document.query.filter_by(patient_id=p.id, status="needs_review").count()
    return jsonify({
        "hmrn_id": p.hmrn_id,
        "memory_started_at": p.memory_started_at.isoformat(),
        "counts": {
            "events": len(p.events),
            "active_medications": sum(1 for m in p.medications if m.active),
            "allergies": sum(1 for a in p.allergies if a.active),
            "documents": len(p.documents),
            "documents_needing_review": pending_docs,
            "active_grants": sum(1 for g in p.grants if g.is_active()),
            "pending_requests": sum(1 for g in p.grants if g.status == "pending"),
        },
        "recent_events": [e.to_dict() for e in sorted(p.events, key=lambda e: e.event_date, reverse=True)[:5]],
        "recent_access": [l.to_dict() for l in AuditLog.query.filter_by(patient_id=p.id)
                          .filter(AuditLog.action.in_(["emergency_access", "doctor_view_record"]))
                          .order_by(AuditLog.created_at.desc()).limit(5).all()],
    })
