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
    issues = []
    blur_score = compute_blur_score(image_bytes)
    brightness = compute_brightness_score(image_bytes)
    resolution_ok = check_min_resolution(image_bytes)

    if blur_score < 100:
        issues.append("blurry")
    if brightness < 40:
        issues.append("too_dark")
    if brightness > 220:
        issues.append("overexposed")
    if not resolution_ok:
        issues.append("low_resolution")

    return {
        "is_valid": len(issues) == 0,
        "issues": issues,
        "blur_score": blur_score,
        "brightness_score": brightness,
    }
