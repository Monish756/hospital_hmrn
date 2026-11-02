"""Lightweight background job queue (thread worker) for document processing.

In tests (SYNC_JOBS=True) jobs run inline. For production scale swap the queue for RQ/Celery —
the `process_document` function is the only entry point.
"""
import json
import logging
import os
import queue
import threading
from datetime import datetime, date

from ..models import db, Document
from . import ocr, ai

log = logging.getLogger("hmrn.worker")
_queue: "queue.Queue[int]" = queue.Queue()
_thread = None
_app = None


def _parse_date(s):
    if not s:
        return None
    try:
        return date.fromisoformat(str(s)[:10])
    except ValueError:
        return None


def process_document(app, doc_id: int):
    with app.app_context():
        doc = Document.query.get(doc_id)
        if not doc:
            return
        doc.status = "processing"
        db.session.commit()
        try:
            path = os.path.join(app.config["UPLOAD_FOLDER"], doc.stored_filename)
            text, engine = ocr.run_ocr(path, doc.mime_type, app.config.get("TESSERACT_CMD", ""))
            doc.ocr_text = text
            doc.ocr_engine = engine
            data, ai_engine = ai.extract_medical_data(text, app.config.get("GEMINI_API_KEY", ""),
                                                      app.config.get("GEMINI_MODEL", "gemini-1.5-flash"))
            doc.extraction_json = json.dumps(data)
            doc.extraction_engine = ai_engine
            if data.get("document_type") and doc.doc_type == "other":
                doc.doc_type = data["document_type"]
            if not doc.document_date:
                doc.document_date = _parse_date(data.get("document_date"))
            doc.status = "needs_review"
            doc.error = None
        except Exception as exc:  # noqa: BLE001
            log.exception("Document %s failed", doc_id)
            doc.status = "failed"
            doc.error = str(exc)
        doc.processed_at = datetime.utcnow()
        db.session.commit()


def _loop():
    while True:
        doc_id = _queue.get()
        try:
            process_document(_app, doc_id)
        finally:
            _queue.task_done()


def init_worker(app):
    global _thread, _app
    _app = app
    if app.config.get("SYNC_JOBS"):
        return
    if _thread is None:
        _thread = threading.Thread(target=_loop, name="hmrn-doc-worker", daemon=True)
        _thread.start()


def enqueue(app, doc_id: int):
    if app.config.get("SYNC_JOBS"):
        process_document(app, doc_id)
    else:
        _queue.put(doc_id)
