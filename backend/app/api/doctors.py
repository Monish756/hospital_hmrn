"""Doctor portal + emergency (break-glass) access workflow."""
from datetime import datetime, timedelta

from flask import Blueprint, current_app, jsonify, request

from ..models import db, Patient, AccessGrant, AuditLog
from ..utils import role_required, audit, expire_grants, doctor_can_access

bp = Blueprint("doctors", __name__, url_prefix="/api/doctors")


@bp.get("/me")
@role_required("doctor")
def me():
    return jsonify(request.user.doctor.to_dict())


@bp.put("/me")
@role_required("doctor")
def update_me():
    d = request.user.doctor
    data = request.get_json(silent=True) or {}
    for f in ("specialization", "hospital", "phone", "registration_number"):
        if f in data:
            setattr(d, f, data[f])
    db.session.commit()
    return jsonify(d.to_dict())


@bp.get("/me/patients")
@role_required("doctor")
def my_patients():
    expire_grants()
    grants = sorted(request.user.doctor.grants, key=lambda g: g.created_at, reverse=True)
    return jsonify([g.to_dict() for g in grants])


@bp.post("/lookup")
@role_required("doctor")
def lookup():
    """Identify a patient by HMRN ID. Returns only identity + whether access exists."""
    hmrn_id = (request.get_json(silent=True) or {}).get("hmrn_id", "").strip().upper()
    p = Patient.query.filter_by(hmrn_id=hmrn_id).first()
    if not p:
        return jsonify({"error": "No patient with that HMRN ID"}), 404
    grant = doctor_can_access(request.user.doctor, p)
    return jsonify({"patient_id": p.id, "hmrn_id": p.hmrn_id, "full_name": p.user.full_name,
                    "blood_group": p.blood_group, "age": p.age(), "gender": p.gender,
                    "has_access": bool(grant), "grant": grant.to_dict() if grant else None})


@bp.post("/request-access")
@role_required("doctor")
def request_access():
    """Standard access: patient must approve."""
    d = request.get_json(silent=True) or {}
    p = Patient.query.filter_by(hmrn_id=(d.get("hmrn_id") or "").strip().upper()).first()
    if not p:
        return jsonify({"error": "No patient with that HMRN ID"}), 404
    existing = AccessGrant.query.filter_by(patient_id=p.id, doctor_id=request.user.doctor.id,
                                          grant_type="standard", status="pending").first()
    if existing:
        return jsonify(existing.to_dict())
    g = AccessGrant(patient_id=p.id, doctor_id=request.user.doctor.id, grant_type="standard",
                    status="pending", reason=d.get("reason"))
    db.session.add(g)
    audit("access_requested", patient_id=p.id, detail=f"Dr. {request.user.full_name}: {d.get('reason') or ''}")
    db.session.commit()
    return jsonify(g.to_dict()), 201


@bp.post("/emergency-access")
@role_required("doctor")
def emergency_access():
    """Break-glass access via emergency QR token (or HMRN ID + declared emergency).

    Access is time-limited, fully audited, and the patient is notified via their audit log.
    """
    d = request.get_json(silent=True) or {}
    token = (d.get("emergency_token") or "").strip()
    hmrn_id = (d.get("hmrn_id") or "").strip().upper()
    reason = (d.get("reason") or "").strip()
    if len(reason) < 10:
        return jsonify({"error": "A clinical reason (at least 10 characters) is required for emergency access"}), 400
    if not d.get("attestation"):
        return jsonify({"error": "You must attest that this is a genuine medical emergency"}), 400

    p = None
    if token:
        p = Patient.query.filter_by(emergency_token=token).first()
    elif hmrn_id:
        p = Patient.query.filter_by(hmrn_id=hmrn_id).first()
    if not p:
        audit("emergency_access_failed", detail=f"token/id not found by Dr. {request.user.full_name}")
        db.session.commit()
        return jsonify({"error": "Patient not found"}), 404

    minutes = current_app.config["EMERGENCY_ACCESS_MINUTES"]
    g = AccessGrant(patient_id=p.id, doctor_id=request.user.doctor.id, grant_type="emergency",
                    status="approved", reason=reason,
                    expires_at=datetime.utcnow() + timedelta(minutes=minutes))
    db.session.add(g)
    audit("emergency_access", patient_id=p.id,
          detail=f"BREAK-GLASS by Dr. {request.user.full_name} ({request.user.doctor.hospital or 'n/a'}); "
                 f"via {'QR token' if token else 'HMRN ID'}; reason: {reason}; expires in {minutes} min")
    db.session.commit()
    return jsonify({"grant": g.to_dict(), "patient_id": p.id, "emergency_summary": emergency_summary(p)})


def emergency_summary(p: Patient):
    events = sorted(p.events, key=lambda e: e.event_date, reverse=True)
    return {
        "patient": p.to_dict(include_private=False),
        "allergies": [a.to_dict() for a in p.allergies if a.active],
        "medications": [m.to_dict() for m in p.medications if m.active],
        "critical_events": [e.to_dict() for e in events
                            if e.event_type in ("surgery", "hospitalization", "diagnosis", "injury")][:10],
        "recent_events": [e.to_dict() for e in events[:10]],
        "documents": [d.to_dict() for d in sorted(p.documents, key=lambda d: d.uploaded_at, reverse=True)
                      if d.status == "confirmed"][:10],
        "disclaimer": ("Information is patient-recorded and/or document-derived and confirmed by the patient. "
                       "Verify before any clinical decision. HMRN does not approve medications or treatments."),
    }


@bp.get("/patients/<int:patient_id>/emergency-summary")
@role_required("doctor")
def get_emergency_summary(patient_id):
    expire_grants()
    p = Patient.query.get_or_404(patient_id)
    g = doctor_can_access(request.user.doctor, p)
    if not g:
        return jsonify({"error": "No active access grant"}), 403
    audit("doctor_view_emergency_summary", patient_id=p.id, detail=f"Dr. {request.user.full_name}")
    db.session.commit()
    return jsonify({"grant": g.to_dict(), "emergency_summary": emergency_summary(p)})


@bp.get("/patients/<int:patient_id>/audit")
@role_required("doctor")
def patient_audit_for_doctor(patient_id):
    p = Patient.query.get_or_404(patient_id)
    if not doctor_can_access(request.user.doctor, p):
        return jsonify({"error": "No active access grant"}), 403
    logs = AuditLog.query.filter_by(patient_id=p.id, actor_user_id=request.user.id)\
        .order_by(AuditLog.created_at.desc()).limit(50).all()
    return jsonify([l.to_dict() for l in logs])
