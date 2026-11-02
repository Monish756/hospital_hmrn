import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


class Config:
    SECRET_KEY = os.environ.get("HMRN_SECRET_KEY", "change-me-in-production")
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "HMRN_DATABASE_URL", f"sqlite:///{BASE_DIR / 'instance' / 'hmrn.db'}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    UPLOAD_FOLDER = os.environ.get("HMRN_UPLOAD_FOLDER", str(BASE_DIR / "instance" / "uploads"))
    MAX_CONTENT_LENGTH = 25 * 1024 * 1024  # 25 MB
    ALLOWED_EXTENSIONS = {"pdf", "png", "jpg", "jpeg", "tiff", "bmp", "webp"}

    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
    GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-1.5-flash")
    TESSERACT_CMD = os.environ.get("TESSERACT_CMD", "")

    # Secure session cookies
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = os.environ.get("HMRN_COOKIE_SECURE", "0") == "1"
    PERMANENT_SESSION_LIFETIME = 60 * 60 * 8  # 8 hours

    FRONTEND_ORIGIN = os.environ.get("HMRN_FRONTEND_ORIGIN", "http://localhost:5173")
    EMERGENCY_ACCESS_MINUTES = int(os.environ.get("HMRN_EMERGENCY_ACCESS_MINUTES", "60"))


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    UPLOAD_FOLDER = str(BASE_DIR / "instance" / "test_uploads")
    WTF_CSRF_ENABLED = False
    SYNC_JOBS = True
