import re
from flask import Blueprint, jsonify, request, session

from ..models import db, User, Patient, Doctor
from ..utils import current_user, login_required, audit, parse_date

bp = Blueprint("auth", __name__, url_prefix="/api/auth")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@bp.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role = data.get("role")
    full_name = (data.get("full_name") or "").strip()

    if not EMAIL_RE.match(email):
        return jsonify({"error": "Valid email required"}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400
    if role not in ("patient", "doctor"):
        return jsonify({"error": "Role must be patient or doctor"}), 400
    if not full_name:
        return jsonify({"error": "Full name required"}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already registered"}), 409

    user = User(email=email, role=role, full_name=full_name)
    user.set_password(password)
    db.session.add(user)
    db.session.flush()

    if role == "patient":
        p = Patient(
            user_id=user.id,
            date_of_birth=parse_date(data.get("date_of_birth")),
            gender=data.get("gender"), blood_group=data.get("blood_group"),
            phone=data.get("phone"), address=data.get("address"),
            emergency_contact_name=data.get("emergency_contact_name"),
            emergency_contact_phone=data.get("emergency_contact_phone"),
            emergency_contact_relation=data.get("emergency_contact_relation"),
            chronic_conditions=data.get("chronic_conditions"),
        )
        db.session.add(p)
    else:
        reg = (data.get("registration_number") or "").strip()
        if not reg:
            return jsonify({"error": "Medical registration number required for doctors"}), 400
        db.session.add(Doctor(user_id=user.id, registration_number=reg,
                              specialization=data.get("specialization"),
                              hospital=data.get("hospital"), phone=data.get("phone")))
    db.session.flush()
    audit("register", patient_id=user.patient.id if user.patient else None, actor=user)
    db.session.commit()

    session.clear()
    session.permanent = True
    session["user_id"] = user.id
    return jsonify({"user": user.to_dict(), "profile": _profile(user)}), 201


def _profile(user):
    if user.role == "patient":
        return user.patient.to_dict()
    return user.doctor.to_dict()


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(data.get("password") or ""):
        return jsonify({"error": "Invalid email or password"}), 401
    session.clear()
    session.permanent = True
    session["user_id"] = user.id
    audit("login", patient_id=user.patient.id if user.patient else None, actor=user)
    db.session.commit()
    return jsonify({"user": user.to_dict(), "profile": _profile(user)})


@bp.post("/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@bp.get("/me")
def me():
    user = current_user()
    if not user:
        return jsonify({"user": None}), 200
    return jsonify({"user": user.to_dict(), "profile": _profile(user)})


@bp.post("/change-password")
@login_required
def change_password():
    data = request.get_json(silent=True) or {}
    user = request.user
    if not user.check_password(data.get("current_password") or ""):
        return jsonify({"error": "Current password incorrect"}), 400
    if len(data.get("new_password") or "") < 8:
        return jsonify({"error": "New password must be at least 8 characters"}), 400
    user.set_password(data["new_password"])
    audit("change_password", actor=user)
    db.session.commit()
    return jsonify({"ok": True})
