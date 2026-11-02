from datetime import date, datetime
from functools import wraps

from flask import jsonify, request, session

from .models import db, User, Patient, Doctor, AccessGrant, AuditLog


def current_user():
    uid = session.get("user_id")
    return User.query.get(uid) if uid else None


def login_required(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        user = current_user()
        if not user:
            return jsonify({"error": "Authentication required"}), 401
        request.user = user
        return fn(*a, **kw)
    return wrapper


def role_required(role):
    def deco(fn):
        @wraps(fn)
        @login_required
        def wrapper(*a, **kw):
            if request.user.role != role:
                return jsonify({"error": f"{role} role required"}), 403
            return fn(*a, **kw)
        return wrapper
    return deco


def audit(action, patient_id=None, detail=None, actor=None):
    user = actor or current_user()
    db.session.add(AuditLog(
        actor_user_id=user.id if user else None, patient_id=patient_id, action=action,
        detail=detail, ip_address=request.remote_addr if request else None,
    ))


def parse_date(s):
    if not s:
        return None
    try:
        return date.fromisoformat(str(s)[:10])
    except ValueError:
        return None


def doctor_can_access(doctor: Doctor, patient: Patient):
    """Return the active AccessGrant allowing this doctor to view this patient, else None."""
    for g in patient.grants:
        if g.doctor_id == doctor.id and g.is_active():
            return g
    return None


def resolve_patient_for_doctor(patient_id):
    """Shared guard for doctor endpoints. Returns (patient, grant) or (None, error_response)."""
    user = request.user
    if user.role == "patient":
        p = user.patient
        if p.id != int(patient_id):
            return None, (jsonify({"error": "Forbidden"}), 403)
        return p, None
    patient = Patient.query.get_or_404(patient_id)
    grant = doctor_can_access(user.doctor, patient)
    if not grant:
        return None, (jsonify({"error": "No active access grant for this patient"}), 403)
    return patient, None


def expire_grants():
    now = datetime.utcnow()
    for g in AccessGrant.query.filter(AccessGrant.status == "approved", AccessGrant.expires_at != None).all():  # noqa: E711
        if g.expires_at < now:
            g.status = "expired"
    db.session.commit()
