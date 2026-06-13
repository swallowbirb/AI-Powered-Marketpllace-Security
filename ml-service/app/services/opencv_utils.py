"""
OpenCV utility functions for photo quality checks.
Used in Phase 2 — vision validation pass.
"""
import io
import numpy as np
from PIL import Image


def compute_blur_score(image_bytes: bytes) -> float:
    """
    Returns Laplacian variance as a blur score.
    Lower = more blurry. Threshold ~100 for acceptable quality.
    TODO: tune threshold during Phase 2
    """
    try:
        import cv2
        img = Image.open(io.BytesIO(image_bytes)).convert("L")
        img_np = np.array(img)
        return float(cv2.Laplacian(img_np, cv2.CV_64F).var())
    except ImportError:
        raise RuntimeError("opencv-python-headless not installed")


def compute_brightness_score(image_bytes: bytes) -> float:
    """
    Returns mean pixel brightness (0-255).
    Below 40 = too dark, above 220 = overexposed.
    """
    img = Image.open(io.BytesIO(image_bytes)).convert("L")
    img_np = np.array(img, dtype=np.float32)
    return float(img_np.mean())


def check_min_resolution(image_bytes: bytes, min_width: int = 800, min_height: int = 600) -> bool:
    """Returns True if image meets minimum resolution requirements."""
    img = Image.open(io.BytesIO(image_bytes))
    w, h = img.size
    return w >= min_width and h >= min_height


def validate_photo_quality(image_bytes: bytes) -> dict:
    """
    Runs all quality checks and returns a summary dict.
    """
    from app.config import settings

    issues = []
    blur_score = compute_blur_score(image_bytes)
    brightness = compute_brightness_score(image_bytes)
    resolution_ok = check_min_resolution(image_bytes, settings.min_width, settings.min_height)

    if blur_score < settings.blur_min:
        issues.append("blurry")
    if brightness < settings.brightness_min:
        issues.append("too_dark")
    if brightness > settings.brightness_max:
        issues.append("overexposed")
    if not resolution_ok:
        issues.append("low_resolution")

    return {
        "is_valid": len(issues) == 0,
        "issues": issues,
        "blur_score": blur_score,
        "brightness_score": brightness,
    }


def compute_color_histogram_delta(image_bytes_a: bytes, image_bytes_b: bytes) -> float:
    """
    Compare two images by HSV color-histogram correlation.
    Returns a delta in [0, 1]: 0 = identical color profile, 1 = completely different.
    Used to flag color mismatch between a submitted item and its listing photo.
    """
    try:
        import cv2
    except ImportError:
        raise RuntimeError("opencv-python-headless not installed")

    def _hist(b: bytes):
        img = Image.open(io.BytesIO(b)).convert("RGB")
        arr = np.array(img)
        bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
        hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
        h = cv2.calcHist([hsv], [0, 1], None, [50, 60], [0, 180, 0, 256])
        cv2.normalize(h, h, 0, 1, cv2.NORM_MINMAX)
        return h

    ha = _hist(image_bytes_a)
    hb = _hist(image_bytes_b)
    correlation = float(cv2.compareHist(ha, hb, cv2.HISTCMP_CORREL))
    # correlation in [-1, 1]; convert to a 0..1 delta.
    delta = 1.0 - max(0.0, correlation)
    return delta
