# HMRN — Health Memory Recovery Network

A database-backed healthcare web application that keeps a continuous, chronological **health memory** for every registered patient and makes it available to authorised doctors in an emergency — including when the patient is unconscious — through an HMRN ID or an emergency QR card.

HMRN **supports** clinical decisions; it never makes them. Nothing the AI extracts enters a patient's record until the patient confirms it, and no medication or treatment is ever auto-approved.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite, React Router, plain CSS (HMRN theme in `frontend/src/styles.css`) |
| Backend | Python Flask, REST API, server-side sessions (HttpOnly cookies) |
| Database | SQLite via SQLAlchemy (`backend/instance/hmrn.db`, auto-created) |
| Passwords | Werkzeug PBKDF2 hashing |
| OCR | Tesseract (`pytesseract`) + OpenCV preprocessing; `pdfplumber` for PDF text layers; `pdf2image` for scanned PDFs |
| AI medical intelligence | Google Gemini via the backend (`GEMINI_API_KEY`); rule-based fallback when no key is set |
| Background jobs | In-process worker thread (swap for RQ/Celery by replacing `services/worker.py`) |
| Tests | `pytest` (backend API) · `vitest` + Testing Library (frontend) |

## Project layout

```
hmrn/
├── backend/
│   ├── run.py                 # entry point (loads ../.env)
│   ├── requirements.txt
│   ├── app/
│   │   ├── __init__.py        # create_app(), CORS, security headers, serves frontend/dist
│   │   ├── config.py
│   │   ├── models.py          # User, Patient, Doctor, Allergy, Medication, MedicalEvent,
│   │   │                      # Document, AccessGrant, AuditLog, AssistantMessage
│   │   ├── utils.py           # auth decorators, audit(), access-grant checks
│   │   ├── api/               # auth, patients, documents, doctors, assistant blueprints
│   │   └── services/          # ocr.py, ai.py (Gemini), worker.py (job queue)
│   └── tests/test_api.py
├── frontend/
│   ├── index.html, vite.config.js, package.json
│   └── src/
│       ├── App.jsx            # routes + role guards
│       ├── styles.css         # HMRN visual theme
│       ├── lib/               # api.js (REST client), auth.jsx (session context)
│       ├── components/        # Nav/Modal/ui, Timeline, EmergencyCard (QR), Assistant
│       └── pages/             # Landing, Auth, PatientDashboard, PatientTimeline,
│                              # Scanner, PatientMisc (card/access/profile), Doctor (portal,
│                              # emergency access, patient view)
├── .env.example
└── README.md
```

## Prerequisites

* Python 3.10+
* Node.js 18+
* **Tesseract OCR** on the PATH (or set `TESSERACT_CMD`)
  * Ubuntu/Debian: `sudo apt install tesseract-ocr poppler-utils`
  * macOS: `brew install tesseract poppler`
  * Windows: install from https://github.com/UB-Mannheim/tesseract/wiki and set `TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe`; install poppler and add its `bin` to PATH for scanned PDFs.
* A Gemini API key (https://aistudio.google.com/) — optional; without it the scanner uses a rule-based extractor and the assistant answers from the record only.

## Run in development

```bash
# 1. configure
cp .env.example .env            # then edit: set HMRN_SECRET_KEY and GEMINI_API_KEY

# 2. backend (terminal 1)
cd backend
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python run.py                   # http://localhost:5000

# 3. frontend (terminal 2)
cd frontend
npm install
npm run dev                     # http://localhost:5173  (proxies /api to :5000)
```

Open http://localhost:5173, create a **patient** account, add allergies/medications/events or scan a prescription, then open the **Emergency card**. Create a **doctor** account in a private window and use *Emergency access* with the patient's HMRN ID (or scan the QR, which opens `/doctor/emergency?token=…`).

## Run in production (single server)

```bash
cd frontend && npm run build          # creates frontend/dist
cd ../backend && pip install gunicorn
HMRN_COOKIE_SECURE=1 HMRN_FRONTEND_ORIGIN=https://your-domain gunicorn -w 2 -b 0.0.0.0:5000 run:app
```
Flask serves `frontend/dist` automatically when it exists. Put it behind HTTPS (nginx/Caddy). Use one gunicorn worker per process if you keep the in-process job queue, or switch to RQ/Celery.

## Tests

```bash
cd backend && pytest -q          # 12 API tests (OCR is stubbed; no Tesseract needed)
cd frontend && npm test          # component tests
```

## How the core workflow is implemented

**Health memory.** `MedicalEvent` rows form the timeline from `Patient.memory_started_at`. Every event, medication and allergy stores `source` (`patient` or `document`) and `source_document_id`, so a doctor can always see where a fact came from and when it was recorded.

**Health scanner.** `POST /api/documents/upload` stores the file, creates a `Document(status=queued)` and enqueues a job. The worker runs OCR (`services/ocr.py`), then Gemini extraction (`services/ai.py`) into `extraction_json`, and sets `status=needs_review`. The patient reviews/edits/unticks items in the UI and calls `POST /api/documents/<id>/confirm`; only then are events, medications and allergies written to the memory with `source=document`.

**Doctor access.** Two grant types in `AccessGrant`:
* *standard* — doctor requests by HMRN ID, patient approves/revokes in *Access & privacy*.
* *emergency* (break-glass) — doctor supplies the QR token or HMRN ID, a clinical reason (≥10 chars) and an attestation checkbox. Access is granted immediately, expires after `HMRN_EMERGENCY_ACCESS_MINUTES` (default 60), and is written to the patient's audit log with the doctor's name, hospital and reason.
All doctor reads of a record or document are audited; patients can rotate the QR token at any time, which invalidates printed cards.

**AI assistant.** Grounded in the patient's confirmed record (`api/assistant.py::build_context`), with a system prompt that forbids prescribing or approving treatment and redirects to a licensed doctor.

## Environment variables

See `.env.example`. Never commit `.env`.

## Security notes

* Sessions: HttpOnly, SameSite=Lax cookies; set `HMRN_COOKIE_SECURE=1` behind HTTPS.
* Uploads: extension allow-list, 25 MB cap, random stored filenames, served only to the owner or a doctor with an active grant.
* Doctor accounts carry a `verified` flag (default false) for an admin verification step; add an admin UI or flip it in the DB before trusting registrations in production.
* Private contact fields are excluded from the emergency summary; the doctor sees clinical data plus the emergency contact.

## UI note

The original `hmrn-app.html` was not provided with the build request, so the theme in `frontend/src/styles.css` and the component layouts were created to the HMRN brief (landing page, patient/doctor portals, dashboard cards, medical timeline, health scanner, AI assistant, emergency card, navigation, modals, responsive layouts). To match an existing design exactly, drop its CSS variables and markup into `styles.css` and the matching components.
