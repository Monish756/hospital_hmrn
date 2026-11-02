"""AI assistant backed by Gemini, grounded in the patient's confirmed health memory."""
from flask import Blueprint, current_app, jsonify, request

from ..models import db, AssistantMessage, Patient
from ..utils import login_required, resolve_patient_for_doctor, audit
from ..services.ai import assistant_reply

bp = Blueprint("assistant", __name__, url_prefix="/api/assistant")


def build_context(p: Patient) -> str:
    lines = [f"Patient: {p.user.full_name}, HMRN ID {p.hmrn_id}, age {p.age() or 'unknown'}, "
             f"gender {p.gender or 'unknown'}, blood group {p.blood_group or 'unknown'}."]
    if p.chronic_conditions:
        lines.append(f"Chronic conditions (patient-entered): {p.chronic_conditions}")
    lines.append("Allergies: " + ("; ".join(f"{a.allergen} ({a.severity}; {a.reaction or 'reaction unspecified'})"
                                            for a in p.allergies if a.active) or "none recorded"))
    lines.append("Active medications: " + ("; ".join(
        f"{m.name} {m.dosage or ''} {m.frequency or ''} for {m.purpose or 'unspecified'}".strip()
        for m in p.medications if m.active) or "none recorded"))
    events = sorted(p.events, key=lambda e: e.event_date, reverse=True)[:25]
    lines.append("Medical timeline (newest first):")
    for e in events:
        lines.append(f"- {e.event_date} [{e.event_type}] {e.title}: {(e.description or '')[:200]} "
                     f"(source: {e.source})")
    return "\n".join(lines)


@bp.get("/history")
@login_required
def history():
    pid = request.args.get("patient_id", type=int)
    user = request.user
    if user.role == "patient":
        pid = user.patient.id
    msgs = AssistantMessage.query.filter_by(user_id=user.id, patient_id=pid)\
        .order_by(AssistantMessage.created_at.asc()).limit(100).all()
    return jsonify([m.to_dict() for m in msgs])


@bp.post("/chat")
@login_required
def chat():
    d = request.get_json(silent=True) or {}
    q = (d.get("message") or "").strip()
    if not q:
        return jsonify({"error": "message required"}), 400
    user = request.user
    if user.role == "patient":
        patient = user.patient
    else:
        patient, err = resolve_patient_for_doctor(d.get("patient_id") or 0)
        if err:
            return err
    prior = AssistantMessage.query.filter_by(user_id=user.id, patient_id=patient.id)\
        .order_by(AssistantMessage.created_at.desc()).limit(10).all()
    hist = [{"role": m.role, "content": m.content} for m in reversed(prior)]
    reply = assistant_reply(q, build_context(patient), hist,
                            current_app.config.get("GEMINI_API_KEY", ""),
                            current_app.config.get("GEMINI_MODEL", "gemini-1.5-flash"))
    db.session.add(AssistantMessage(user_id=user.id, patient_id=patient.id, role="user", content=q))
    db.session.add(AssistantMessage(user_id=user.id, patient_id=patient.id, role="assistant", content=reply))
    audit("assistant_query", patient_id=patient.id)
    db.session.commit()
    return jsonify({"reply": reply})


@bp.delete("/history")
@login_required
def clear_history():
    pid = request.args.get("patient_id", type=int)
    if request.user.role == "patient":
        pid = request.user.patient.id
    AssistantMessage.query.filter_by(user_id=request.user.id, patient_id=pid).delete()
    db.session.commit()
    return jsonify({"ok": True})
