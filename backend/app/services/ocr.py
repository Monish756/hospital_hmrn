"""OCR pipeline: PDF text layer -> pdf2image + Tesseract for scanned pages; OpenCV preprocessing for images."""
import io
import logging
import os
import shutil

log = logging.getLogger("hmrn.ocr")


def _tesseract_available(cmd_override: str = "") -> bool:
    try:
        import pytesseract
        if cmd_override:
            pytesseract.pytesseract.tesseract_cmd = cmd_override
        pytesseract.get_tesseract_version()
        return True
    except Exception as exc:  # noqa: BLE001
        log.warning("Tesseract not available: %s", exc)
        return False


def preprocess_image(pil_image):
    """Deskew-lite preprocessing: grayscale, denoise, adaptive threshold. Returns PIL image."""
    try:
        import cv2
        import numpy as np
        from PIL import Image

        img = np.array(pil_image.convert("RGB"))
        gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
        # upscale small images for better OCR
        h, w = gray.shape
        if max(h, w) < 1500:
            scale = 1500 / max(h, w)
            gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        gray = cv2.bilateralFilter(gray, 9, 75, 75)
        thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                       cv2.THRESH_BINARY, 31, 15)
        return Image.fromarray(thresh)
    except Exception as exc:  # noqa: BLE001
        log.info("OpenCV preprocessing skipped: %s", exc)
        return pil_image.convert("L")


def ocr_image(pil_image, tesseract_cmd: str = "") -> str:
    if not _tesseract_available(tesseract_cmd):
        raise RuntimeError("Tesseract OCR engine is not installed. Install tesseract-ocr and set TESSERACT_CMD if needed.")
    import pytesseract
    processed = preprocess_image(pil_image)
    text = pytesseract.image_to_string(processed, config="--oem 3 --psm 6")
    if len(text.strip()) < 20:  # fall back to raw image if preprocessing hurt
        text = pytesseract.image_to_string(pil_image, config="--oem 3 --psm 6")
    return text


def extract_pdf_text(path: str) -> str:
    """Extract native text layer using pdfplumber."""
    try:
        import pdfplumber
        parts = []
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                parts.append(page.extract_text() or "")
        return "\n\n".join(parts)
    except Exception as exc:  # noqa: BLE001
        log.warning("pdfplumber failed: %s", exc)
        return ""


def ocr_pdf(path: str, tesseract_cmd: str = "") -> str:
    """Rasterise pages with pdf2image (needs poppler) and OCR them."""
    from pdf2image import convert_from_path
    pages = convert_from_path(path, dpi=300)
    return "\n\n".join(ocr_image(p, tesseract_cmd) for p in pages)


def run_ocr(path: str, mime_type: str, tesseract_cmd: str = ""):
    """Return (text, engine_label)."""
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf" or (mime_type or "").endswith("pdf"):
        text = extract_pdf_text(path)
        if len(text.strip()) > 80:
            return text, "pdfplumber (text layer)"
        if shutil.which("pdftoppm") is None:
            raise RuntimeError("Scanned PDF detected but poppler (pdftoppm) is not installed.")
        return ocr_pdf(path, tesseract_cmd), "pdf2image + tesseract"
    from PIL import Image
    with Image.open(path) as im:
        return ocr_image(im, tesseract_cmd), "opencv + tesseract"
