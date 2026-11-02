"""AI medical intelligence via Gemini (server-side only).

Two responsibilities:
  1. extract_medical_data(text) -> structured candidates (events, medications, allergies)
     that the PATIENT must confirm before anything is written to their health memory.
  2. assistant_reply(question, context) -> informational answer for the AI assistant.

If GEMINI_API_KEY is missing, a conservative rule-based fallback is used and clearly labelled,
so the application still works end-to-end without an API key.
"""
import json
import logging
import re
from datetime import date

log = logging.getLogger("hmrn.ai")

EXTRACTION_PROMPT = """You are a clinical document extraction engine for HMRN (Health Memory Recovery Network).
Read the OCR text of a medical document and return ONLY a JSON object with this exact shape:

{
  "document_type": "prescription|lab_report|discharge_summary|consultation|vaccination|other",
  "document_date": "YYYY-MM-DD or null",
  "provider": "doctor name or null",
  "facility": "hospital/clinic/lab name or null",
  "summary": "2-3 sentence plain-language summary",
  "events": [
    {"event_type": "diagnosis|surgery|hospitalization|prescription|lab_result|vaccination|consultation|injury|other",
     "title": "short title", "description": "details incl. key values", "event_date": "YYYY-MM-DD or null", "severity": "low|moderate|high|null"}
  ],
  "medications": [
    {"name": "", "dosage": "", "frequency": "", "route": "", "purpose": "", "prescribed_by": ""}
  ],
  "allergies": [
    {"allergen": "", "reaction": "", "severity": "mild|moderate|severe|life-threatening"}
  ],
  "warnings": ["anything a treating doctor must double-check, e.g. unclear dosage or OCR uncertainty"]
}

Rules: never invent data not present in the text; leave fields null/empty when unsure; use ISO dates;
copy drug names exactly as written; do not give treatment advice. Output JSON only, no markdown.

OCR TEXT:
\"\"\"
{text}
\"\"\"
"""

ASSISTANT_SYSTEM = """You are the HMRN AI health assistant. You help the user understand their recorded health memory
(medications, allergies, medical events, documents). You give clear, cautious, informational explanations.
You NEVER prescribe, approve, or recommend starting/stopping a medication, injection or treatment —
always direct clinical decisions to a licensed doctor. If the question is an emergency, tell the user to
contact emergency services. Keep answers concise and refer to the patient's records when relevant."""


def _client(api_key: str, model: str):
    import google.generativeai as genai
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(model)


def _strip_json(s: str) -> str:
    s = s.strip()
    s = re.sub(r"^```(?:json)?", "", s).strip()
    s = re.sub(r"```$", "", s).strip()
    start, end = s.find("{"), s.rfind("}")
    return s[start:end + 1] if start != -1 and end != -1 else s


# ---------- Fallback extractor (no API key) ----------
_DATE_RE = re.compile(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b|\b(\d{4})-(\d{2})-(\d{2})\b")
_MED_LINE_RE = re.compile(
    r"^[ \t]*(?:\d+[.)]\s*)?(?:tab(?:let)?|cap(?:sule)?|syp|syrup|inj|t|rx)\.?[ \t:]+"
    r"([A-Z][A-Za-z0-9\-]+(?:[ \t]+[A-Z][A-Za-z0-9\-]+)?)[ \t]*([\d.]+[ \t]*(?:mg|mcg|g|ml|iu))?",
    re.IGNORECASE | re.MULTILINE)
_PREFIX_WORDS = {"tab", "tablet", "cap", "capsule", "syp", "syrup", "inj", "rx", "t"}
_ALLERGY_RE = re.compile(r"allerg(?:y|ies|ic)\s*(?:to|:)?\s*([A-Za-z ,/]+)", re.IGNORECASE)
_FREQ_RE = re.compile(r"\b(\d-\d-\d|od|bd|bid|tid|tds|qid|once daily|twice daily|thrice daily|hs|sos)\b", re.IGNORECASE)


def _first_date(text: str):
    m = _DATE_RE.search(text)
    if not m:
        return None
    try:
        if m.group(4):
            return f"{m.group(4)}-{m.group(5)}-{m.group(6)}"
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000
        return date(y, mo, d).isoformat()
    except ValueError:
        return None


def fallback_extract(text: str) -> dict:
    lower = text.lower()
    doc_type = "other"
    if any(k in lower for k in ("discharge", "admitted", "admission")):
        doc_type = "discharge_summary"
    elif any(k in lower for k in ("haemoglobin", "hemoglobin", "lab", "test result", "reference range", "specimen")):
        doc_type = "lab_report"
    elif any(k in lower for k in ("rx", "tab.", "tablet", "prescription", "cap.")):
        doc_type = "prescription"

    meds = []
    for m in _MED_LINE_RE.finditer(text):
        if m.group(1).split()[0].lower() in _PREFIX_WORDS:
            continue
        line_end = text.find("\n", m.start())
        line = text[m.start():line_end if line_end != -1 else len(text)]
        fq = _FREQ_RE.search(line)
        meds.append({"name": m.group(1).strip(), "dosage": (m.group(2) or "").strip(),
                     "frequency": fq.group(1) if fq else "", "route": "", "purpose": "", "prescribed_by": ""})
    allergies = []
    for a in _ALLERGY_RE.finditer(text):
        for item in re.split(r"[,/]", a.group(1)):
            item = item.strip()
            if item and item.lower() not in ("none", "nil", "no", "known", "nkda", "not known") and len(item) < 40:
                allergies.append({"allergen": item, "reaction": "", "severity": "moderate"})
    doc_date = _first_date(text)
    events = [{
        "event_type": {"prescription": "prescription", "lab_report": "lab_result",
                       "discharge_summary": "hospitalization"}.get(doc_type, "other"),
        "title": f"{doc_type.replace('_', ' ').title()} (uploaded document)",
        "description": text.strip()[:600],
        "event_date": doc_date, "severity": None,
    }]
    return {
        "document_type": doc_type, "document_date": doc_date, "provider": None, "facility": None,
        "summary": "Rule-based extraction (no Gemini API key configured). Review all fields carefully before confirming.",
        "events": events, "medications": meds, "allergies": allergies,
        "warnings": ["Extraction produced without AI model — verify every value against the original document."],
    }


def extract_medical_data(text: str, api_key: str, model: str) -> tuple[dict, str]:
    """Return (candidate_data, engine_label)."""
    if not text or len(text.strip()) < 10:
        return {"document_type": "other", "document_date": None, "provider": None, "facility": None,
                "summary": "No readable text found in document.", "events": [], "medications": [],
                "allergies": [], "warnings": ["OCR returned almost no text; document may be blurry or blank."]}, "none"
    if not api_key:
        return fallback_extract(text), "rule-based fallback"
    try:
        resp = _client(api_key, model).generate_content(
            EXTRACTION_PROMPT.replace("{text}", text[:20000]),
            generation_config={"temperature": 0.1, "response_mime_type": "application/json"},
        )
        data = json.loads(_strip_json(resp.text))
        for k in ("events", "medications", "allergies", "warnings"):
            data.setdefault(k, [])
        return data, f"gemini:{model}"
    except Exception as exc:  # noqa: BLE001
        log.exception("Gemini extraction failed, using fallback")
        data = fallback_extract(text)
        data["warnings"].append(f"Gemini extraction failed ({type(exc).__name__}); fallback used.")
        return data, "rule-based fallback (gemini error)"


def assistant_reply(question: str, context: str, history: list, api_key: str, model: str) -> str:
    if not api_key:
        return ("The AI assistant needs a Gemini API key (GEMINI_API_KEY) to answer questions. "
                "Meanwhile, here is the health memory I can see for you:\n\n" + (context or "No records yet.") +
                "\n\nFor any treatment decision, please consult a licensed doctor.")
    try:
        convo = "\n".join(f"{m['role'].upper()}: {m['content']}" for m in history[-10:])
        prompt = (f"{ASSISTANT_SYSTEM}\n\nPATIENT HEALTH MEMORY (verified records):\n{context}\n\n"
                  f"CONVERSATION SO FAR:\n{convo}\n\nUSER: {question}\nASSISTANT:")
        resp = _client(api_key, model).generate_content(prompt, generation_config={"temperature": 0.3})
        return resp.text.strip()
    except Exception as exc:  # noqa: BLE001
        log.exception("Gemini assistant failed")
        return f"The assistant is temporarily unavailable ({type(exc).__name__}). Please try again later."
