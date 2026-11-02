"""SQLAlchemy models for HMRN — Health Memory Recovery Network."""
import secrets
import string
from datetime import datetime, date

from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()


def _gen_hmrn_id() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "HMRN-" + "".join(secrets.choice(alphabet) for _ in range(8))


def _gen_token(n: int = 32) -> str:
    return secrets.token_urlsafe(n)


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # patient | doctor
    full_name = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    patient = db.relationship("Patient", back_populates="user", uselist=False, cascade="all, delete-orphan")
    doctor = db.relationship("Doctor", back_populates="user", uselist=False, cascade="all, delete-orphan")

    def set_password(self, pw: str):
        self.password_hash = generate_password_hash(pw)

    def check_password(self, pw: str) -> bool:
        return check_password_hash(self.password_hash, pw)

    def to_dict(self):
        return {"id": self.id, "email": self.email, "role": self.role, "full_name": self.full_name}


class Patient(db.Model):
    __tablename__ = "patients"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), unique=True, nullable=False)
    hmrn_id = db.Column(db.String(20), unique=True, nullable=False, default=_gen_hmrn_id, index=True)
    emergency_token = db.Column(db.String(64), unique=True, nullable=False, default=_gen_token, index=True)
    date_of_birth = db.Column(db.Date)
    gender = db.Column(db.String(20))
    blood_group = db.Column(db.String(10))
    phone = db.Column(db.String(30))
    address = db.Column(db.String(300))
    emergency_contact_name = db.Column(db.String(200))
    emergency_contact_phone = db.Column(db.String(30))
    emergency_contact_relation = db.Column(db.String(100))
    chronic_conditions = db.Column(db.Text)  # free text, patient-entered
    organ_donor = db.Column(db.Boolean, default=False)
    emergency_notes = db.Column(db.Text)
    memory_started_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship("User", back_populates="patient")
    allergies = db.relationship("Allergy", back_populates="patient", cascade="all, delete-orphan")
    medications = db.relationship("Medication", back_populates="patient", cascade="all, delete-orphan")
    events = db.relationship("MedicalEvent", back_populates="patient", cascade="all, delete-orphan")
    documents = db.relationship("Document", back_populates="patient", cascade="all, delete-orphan")
    grants = db.relationship("AccessGrant", back_populates="patient", cascade="all, delete-orphan")

    def age(self):
        if not self.date_of_birth:
            return None
        today = date.today()
        return today.year - self.date_of_birth.year - (
            (today.month, today.day) < (self.date_of_birth.month, self.date_of_birth.day)
        )

    def rotate_emergency_token(self):
        self.emergency_token = _gen_token()

    def to_dict(self, include_private=True):
        d = {
            "id": self.id,
            "hmrn_id": self.hmrn_id,
            "full_name": self.user.full_name,
            "date_of_birth": self.date_of_birth.isoformat() if self.date_of_birth else None,
            "age": self.age(),
            "gender": self.gender,
            "blood_group": self.blood_group,
            "chronic_conditions": self.chronic_conditions,
            "organ_donor": self.organ_donor,
            "emergency_notes": self.emergency_notes,
            "emergency_contact_name": self.emergency_contact_name,
            "emergency_contact_phone": self.emergency_contact_phone,
            "emergency_contact_relation": self.emergency_contact_relation,
            "memory_started_at": self.memory_started_at.isoformat() if self.memory_started_at else None,
        }
        if include_private:
            d.update({
                "email": self.user.email,
                "phone": self.phone,
                "address": self.address,
                "emergency_token": self.emergency_token,
            })
        return d


class Doctor(db.Model):
    __tablename__ = "doctors"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), unique=True, nullable=False)
    registration_number = db.Column(db.String(100), nullable=False)
    specialization = db.Column(db.String(150))
    hospital = db.Column(db.String(200))
    phone = db.Column(db.String(30))
    verified = db.Column(db.Boolean, default=False)

    user = db.relationship("User", back_populates="doctor")
    grants = db.relationship("AccessGrant", back_populates="doctor", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "full_name": self.user.full_name,
            "email": self.user.email,
            "registration_number": self.registration_number,
            "specialization": self.specialization,
            "hospital": self.hospital,
            "phone": self.phone,
            "verified": self.verified,
        }


class Allergy(db.Model):
    __tablename__ = "allergies"
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=False, index=True)
    allergen = db.Column(db.String(200), nullable=False)
    reaction = db.Column(db.String(300))
    severity = db.Column(db.String(20), default="moderate")  # mild|moderate|severe|life-threatening
    source = db.Column(db.String(50), default="patient")  # patient|doctor|document
    source_document_id = db.Column(db.Integer, db.ForeignKey("documents.id"))
    recorded_at = db.Column(db.DateTime, default=datetime.utcnow)
    active = db.Column(db.Boolean, default=True)

    patient = db.relationship("Patient", back_populates="allergies")

    def to_dict(self):
        return {
            "id": self.id, "allergen": self.allergen, "reaction": self.reaction,
            "severity": self.severity, "source": self.source,
            "source_document_id": self.source_document_id,
            "recorded_at": self.recorded_at.isoformat(), "active": self.active,
        }


class Medication(db.Model):
    __tablename__ = "medications"
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=False, index=True)
    name = db.Column(db.String(200), nullable=False)
    dosage = db.Column(db.String(100))
    frequency = db.Column(db.String(100))
    route = db.Column(db.String(50))
    purpose = db.Column(db.String(300))
    prescribed_by = db.Column(db.String(200))
    start_date = db.Column(db.Date)
    end_date = db.Column(db.Date)
    active = db.Column(db.Boolean, default=True)
    source = db.Column(db.String(50), default="patient")
    source_document_id = db.Column(db.Integer, db.ForeignKey("documents.id"))
    recorded_at = db.Column(db.DateTime, default=datetime.utcnow)

    patient = db.relationship("Patient", back_populates="medications")

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "dosage": self.dosage, "frequency": self.frequency,
            "route": self.route, "purpose": self.purpose, "prescribed_by": self.prescribed_by,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "active": self.active, "source": self.source,
            "source_document_id": self.source_document_id,
            "recorded_at": self.recorded_at.isoformat(),
        }


class MedicalEvent(db.Model):
    """One entry in the patient's chronological health memory."""
    __tablename__ = "medical_events"
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=False, index=True)
    event_type = db.Column(db.String(50), nullable=False)
    # diagnosis|surgery|hospitalization|prescription|lab_result|vaccination|consultation|injury|other
    title = db.Column(db.String(250), nullable=False)
    description = db.Column(db.Text)
    event_date = db.Column(db.Date, nullable=False, index=True)
    provider = db.Column(db.String(200))
    facility = db.Column(db.String(200))
    severity = db.Column(db.String(20))
    source = db.Column(db.String(50), default="patient")
    source_document_id = db.Column(db.Integer, db.ForeignKey("documents.id"))
    confirmed = db.Column(db.Boolean, default=True)
    created_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    patient = db.relationship("Patient", back_populates="events")

    def to_dict(self):
        return {
            "id": self.id, "event_type": self.event_type, "title": self.title,
            "description": self.description, "event_date": self.event_date.isoformat(),
            "provider": self.provider, "facility": self.facility, "severity": self.severity,
            "source": self.source, "source_document_id": self.source_document_id,
            "confirmed": self.confirmed, "created_at": self.created_at.isoformat(),
        }


class Document(db.Model):
    __tablename__ = "documents"
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=False, index=True)
    uploaded_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    original_filename = db.Column(db.String(300), nullable=False)
    stored_filename = db.Column(db.String(300), nullable=False)
    mime_type = db.Column(db.String(100))
    size_bytes = db.Column(db.Integer)
    doc_type = db.Column(db.String(50), default="other")  # prescription|lab_report|discharge_summary|other
    status = db.Column(db.String(30), default="queued")  # queued|processing|needs_review|confirmed|failed
    ocr_text = db.Column(db.Text)
    ocr_engine = db.Column(db.String(100))
    extraction_json = db.Column(db.Text)  # AI-structured candidate data awaiting confirmation
    extraction_engine = db.Column(db.String(100))
    error = db.Column(db.Text)
    document_date = db.Column(db.Date)
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)
    processed_at = db.Column(db.DateTime)

    patient = db.relationship("Patient", back_populates="documents")

    def to_dict(self, include_text=False):
        import json
        d = {
            "id": self.id, "original_filename": self.original_filename, "mime_type": self.mime_type,
            "size_bytes": self.size_bytes, "doc_type": self.doc_type, "status": self.status,
            "ocr_engine": self.ocr_engine, "extraction_engine": self.extraction_engine,
            "error": self.error,
            "document_date": self.document_date.isoformat() if self.document_date else None,
            "uploaded_at": self.uploaded_at.isoformat(),
            "processed_at": self.processed_at.isoformat() if self.processed_at else None,
            "extraction": json.loads(self.extraction_json) if self.extraction_json else None,
        }
        if include_text:
            d["ocr_text"] = self.ocr_text
        return d


class AccessGrant(db.Model):
    """Doctor access to a patient record: patient-approved or emergency (break-glass)."""
    __tablename__ = "access_grants"
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=False, index=True)
    doctor_id = db.Column(db.Integer, db.ForeignKey("doctors.id"), nullable=False, index=True)
    grant_type = db.Column(db.String(20), nullable=False)  # standard | emergency
    status = db.Column(db.String(20), default="pending")  # pending|approved|revoked|expired
    reason = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime)

    patient = db.relationship("Patient", back_populates="grants")
    doctor = db.relationship("Doctor", back_populates="grants")

    def is_active(self):
        if self.status != "approved":
            return False
        if self.expires_at and self.expires_at < datetime.utcnow():
            return False
        return True

    def to_dict(self):
        return {
            "id": self.id, "patient_id": self.patient_id, "doctor_id": self.doctor_id,
            "patient_name": self.patient.user.full_name, "patient_hmrn_id": self.patient.hmrn_id,
            "doctor_name": self.doctor.user.full_name, "doctor_hospital": self.doctor.hospital,
            "grant_type": self.grant_type, "status": self.status, "reason": self.reason,
            "created_at": self.created_at.isoformat(),
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "active": self.is_active(),
        }


class AuditLog(db.Model):
    __tablename__ = "audit_logs"
    id = db.Column(db.Integer, primary_key=True)
    actor_user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), index=True)
    action = db.Column(db.String(100), nullable=False)
    detail = db.Column(db.Text)
    ip_address = db.Column(db.String(60))
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    def to_dict(self):
        actor = User.query.get(self.actor_user_id) if self.actor_user_id else None
        return {
            "id": self.id, "action": self.action, "detail": self.detail,
            "actor": actor.full_name if actor else "system",
            "actor_role": actor.role if actor else None,
            "ip_address": self.ip_address, "created_at": self.created_at.isoformat(),
        }


class AssistantMessage(db.Model):
    __tablename__ = "assistant_messages"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), index=True)
    role = db.Column(db.String(20), nullable=False)  # user | assistant
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {"id": self.id, "role": self.role, "content": self.content,
                "created_at": self.created_at.isoformat()}
