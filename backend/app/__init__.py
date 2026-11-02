import logging
import os

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS

from .config import Config
from .models import db


def create_app(config_object=Config):
    app = Flask(__name__, static_folder=None)
    app.config.from_object(config_object)
    logging.basicConfig(level=logging.INFO)

    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
    if app.config["SQLALCHEMY_DATABASE_URI"].startswith("sqlite:///"):
        os.makedirs(os.path.dirname(app.config["SQLALCHEMY_DATABASE_URI"].replace("sqlite:///", "")), exist_ok=True)

    db.init_app(app)
    CORS(app, supports_credentials=True, origins=[app.config["FRONTEND_ORIGIN"]])

    from .api import auth, patients, documents, doctors, assistant
    for bp in (auth.bp, patients.bp, documents.bp, doctors.bp, assistant.bp):
        app.register_blueprint(bp)

    from .services import worker
    with app.app_context():
        db.create_all()
        worker.init_worker(app)

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "app": "HMRN", "gemini_configured": bool(app.config.get("GEMINI_API_KEY"))})

    @app.after_request
    def security_headers(resp):
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Referrer-Policy"] = "same-origin"
        return resp

    @app.errorhandler(404)
    def not_found(_):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(413)
    def too_large(_):
        return jsonify({"error": "File too large (max 25 MB)"}), 413

    # Serve built frontend (frontend/dist) in production
    dist = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend", "dist")
    if os.path.isdir(dist):
        @app.route("/", defaults={"path": ""})
        @app.route("/<path:path>")
        def spa(path):
            if path and os.path.exists(os.path.join(dist, path)):
                return send_from_directory(dist, path)
            return send_from_directory(dist, "index.html")

    return app
