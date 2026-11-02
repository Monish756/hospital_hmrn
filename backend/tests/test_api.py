import io
import pytest

from app import create_app
from app.config import TestConfig
from app.services import ai


@pytest.fixture
def app():
    app = create_app(TestConfig)
    yield app


@pytest.fixture
def client(app):
    return app.test_client()


def register_patient(client, email="pat@example.com"):
    r = client.post("/api/auth/register", json={
        "email": email, "password": "strongpass123", "role": "patient", "full_name": "Test Patient",
        "date_of_birth": "1990-05-04", "blood_group": "O+", "gender": "male",
        "emergency_contact_name": "Jane", "emergency_contact_phone": "+91 9000000000"})
    assert r.status_code == 201, r.json
    return r.json


def register_doctor(client, email="doc@example.com"):
    r = client.post("/api/auth/register", json={
        "email": email, "password": "strongpass123", "role": "doctor", "full_name": "Dr Who",
        "registration_number": "TN-12345", "hospital": "City Hospital"})
    assert r.status_code == 201, r.json
    return r.json


def login(client, email):
    r = client.post("/api/auth/login", json={"email": email, "password": "strongpass123"})
    assert r.status_code == 200
    return r.json


def test_health(client):
    assert client.get("/api/health").json["status"] == "ok"


def test_register_login_and_profile(client):
    data = register_patient(client)
    assert data["profile"]["hmrn_id"].startswith("HMRN-")
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").json["user"] is None
    login(client, "pat@example.com")
    me = client.get("/api/patients/me").json
    assert me["blood_group"] == "O+"
    assert me["age"] >= 36


def test_weak_password_rejected(client):
    r = client.post("/api/auth/register", json={"email": "x@y.com", "password": "short", "role": "patient",
                                                "full_name": "X"})
    assert r.status_code == 400


def test_patient_memory_crud(client):
    register_patient(client)
    a = client.post("/api/patients/me/allergies", json={"allergen": "Penicillin", "severity": "severe",
                                                        "reaction": "Anaphylaxis"})
    assert a.status_code == 201
    m = client.post("/api/patients/me/medications", json={"name": "Metformin", "dosage": "500mg",
                                                          "frequency": "BD"})
    assert m.status_code == 201
    e = client.post("/api/patients/me/events", json={"event_type": "surgery", "title": "Appendectomy",
                                                     "event_date": "2020-01-15", "facility": "Apollo"})
    assert e.status_code == 201
    bad = client.post("/api/patients/me/events", json={"event_type": "nope", "title": "x", "event_date": "2020-01-01"})
    assert bad.status_code == 400

    pid = client.get("/api/patients/me").json["id"]
    rec = client.get(f"/api/patients/{pid}/record").json
    assert len(rec["allergies"]) == 1 and len(rec["medications"]) == 1 and len(rec["events"]) == 1
    dash = client.get("/api/patients/me/dashboard").json
    assert dash["counts"]["allergies"] == 1


def test_doctor_cannot_access_without_grant(client):
    p = register_patient(client)
    pid = p["profile"]["id"]
    client.post("/api/auth/logout")
    register_doctor(client)
    r = client.get(f"/api/patients/{pid}/record")
    assert r.status_code == 403


def test_standard_access_request_and_approval(client):
    p = register_patient(client)
    hmrn = p["profile"]["hmrn_id"]
    pid = p["profile"]["id"]
    client.post("/api/auth/logout")
    register_doctor(client)
    look = client.post("/api/doctors/lookup", json={"hmrn_id": hmrn}).json
    assert look["has_access"] is False
    req = client.post("/api/doctors/request-access", json={"hmrn_id": hmrn, "reason": "Follow-up"})
    assert req.status_code == 201
    gid = req.json["id"]
    client.post("/api/auth/logout")
    login(client, "pat@example.com")
    grants = client.get("/api/patients/me/access").json
    assert grants[0]["status"] == "pending"
    client.post(f"/api/patients/me/access/{gid}/approve")
    client.post("/api/auth/logout")
    login(client, "doc@example.com")
    assert client.get(f"/api/patients/{pid}/record").status_code == 200
    # patient revokes
    client.post("/api/auth/logout")
    login(client, "pat@example.com")
    client.post(f"/api/patients/me/access/{gid}/revoke")
    client.post("/api/auth/logout")
    login(client, "doc@example.com")
    assert client.get(f"/api/patients/{pid}/record").status_code == 403


def test_emergency_break_glass_via_qr_token(client):
    p = register_patient(client)
    token = p["profile"]["emergency_token"]
    client.post("/api/patients/me/allergies", json={"allergen": "Sulfa drugs", "severity": "life-threatening"})
    client.post("/api/auth/logout")
    register_doctor(client)
    # missing attestation
    r = client.post("/api/doctors/emergency-access", json={"emergency_token": token, "reason": "Unconscious after RTA"})
    assert r.status_code == 400
    r = client.post("/api/doctors/emergency-access", json={"emergency_token": token,
                                                           "reason": "Unconscious after RTA", "attestation": True})
    assert r.status_code == 200, r.json
    summ = r.json["emergency_summary"]
    assert summ["allergies"][0]["allergen"] == "Sulfa drugs"
    assert "phone" not in summ["patient"]  # private fields hidden
    pid = r.json["patient_id"]
    assert client.get(f"/api/doctors/patients/{pid}/emergency-summary").status_code == 200
    # patient sees it in audit log
    client.post("/api/auth/logout")
    login(client, "pat@example.com")
    actions = [l["action"] for l in client.get("/api/patients/me/audit").json]
    assert "emergency_access" in actions


def test_rotate_token_invalidates_old(client):
    p = register_patient(client)
    old = p["profile"]["emergency_token"]
    new = client.post("/api/patients/me/rotate-emergency-token").json["emergency_token"]
    assert new != old
    client.post("/api/auth/logout")
    register_doctor(client)
    r = client.post("/api/doctors/emergency-access", json={"emergency_token": old, "reason": "Emergency case x",
                                                           "attestation": True})
    assert r.status_code == 404


def test_document_upload_and_confirm(client, app, monkeypatch):
    register_patient(client)
    # stub OCR so the test doesn't depend on tesseract being installed
    from app.services import ocr
    monkeypatch.setattr(ocr, "run_ocr", lambda path, mime, cmd="": (
        "Dr. A. Kumar, Apollo Clinic  Date: 12/03/2024\nRx\nTab. Amoxicillin 500mg 1-0-1 x 5 days\n"
        "Allergy to Ibuprofen\n", "stub"))
    r = client.post("/api/documents/upload", data={"file": (io.BytesIO(b"fake"), "rx.png"),
                                                   "doc_type": "prescription"},
                    content_type="multipart/form-data")
    assert r.status_code == 202
    doc_id = r.json["id"]
    doc = client.get(f"/api/documents/{doc_id}").json
    assert doc["status"] == "needs_review"
    ext = doc["extraction"]
    assert any(m["name"].lower().startswith("amoxicillin") for m in ext["medications"])
    assert any(a["allergen"].lower() == "ibuprofen" for a in ext["allergies"])
    # patient edits + confirms
    ext["medications"][0]["purpose"] = "Infection"
    r = client.post(f"/api/documents/{doc_id}/confirm", json=ext)
    assert r.status_code == 200
    assert r.json["created"]["medications"] >= 1
    pid = client.get("/api/patients/me").json["id"]
    rec = client.get(f"/api/patients/{pid}/record").json
    assert rec["medications"][0]["source"] == "document"
    assert rec["events"][0]["source_document_id"] == doc_id


def test_bad_upload_type(client):
    register_patient(client)
    r = client.post("/api/documents/upload", data={"file": (io.BytesIO(b"x"), "evil.exe")},
                    content_type="multipart/form-data")
    assert r.status_code == 400


def test_fallback_extractor():
    data = ai.fallback_extract("Discharge summary\nAdmitted 2024-01-02\nTab. Pantoprazole 40mg OD\nAllergies: Penicillin, Dust")
    assert data["document_type"] == "discharge_summary"
    assert data["document_date"] == "2024-01-02"
    assert {a["allergen"] for a in data["allergies"]} == {"Penicillin", "Dust"}


def test_assistant_without_key(client):
    register_patient(client)
    r = client.post("/api/assistant/chat", json={"message": "What are my allergies?"})
    assert r.status_code == 200
    assert "doctor" in r.json["reply"].lower()
    assert len(client.get("/api/assistant/history").json) == 2
