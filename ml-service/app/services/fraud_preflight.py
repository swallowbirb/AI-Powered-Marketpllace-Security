"""
Pre-flight fraud checks — Task 2.3 (Requirement 2)

Three cheap signals run before any LLM call:
  1. imagehash  — perceptual hash of each submitted photo vs catalog photo hashes.
                  Hamming distance <= threshold (default 10) => HARD signal.
  2. Pillow/EXIF — presence of camera metadata (make / model / timestamp).
                   Absent => weak/SOFT signal.
  3. Rekognition — web/label signal via moderation/label detection => SOFT signal.

Outcome classification:
  * HARD  -> short-circuit the pipeline, skip both Gemini passes.
  * SOFT  -> annotate the summary, continue.
  * CLEAN -> no signal.

Each individual check is defensive: a failed check is treated as "not detected",
logged, and the pipeline continues (Req 2.6).
"""
import io
import logging
from typing import List, Optional

from app.config import settings

logger = logging.getLogger("ml-service.fraud")

CLASSIFICATION_HARD = "HARD"
CLASSIFICATION_SOFT = "SOFT"
CLASSIFICATION_CLEAN = "CLEAN"

# EXIF tag ids for camera make / model / datetime.
_EXIF_MAKE = 271
_EXIF_MODEL = 272
_EXIF_DATETIME = 306


def _phash_of_bytes(image_bytes: bytes):
    try:
        import imagehash
        from PIL import Image
        img = Image.open(io.BytesIO(image_bytes))
        return imagehash.phash(img)
    except Exception as exc:  # noqa: BLE001
        logger.warning("phash computation failed: %s", exc)
        return None


async def _compute_catalog_hashes(listing_image_urls: Optional[List[str]], trace=None) -> List[str]:
    """
    Perceptual-hash (hex strings) the listing/catalog reference photos.

    These are what ``phash_match`` compares submitted evidence photos against. The
    hashing happens here, ML-side, with the *same* ``imagehash`` library used for the
    comparison, so the hex strings are bit-compatible — a backend/Node pre-compute
    would produce hashes that could never match. The backend therefore never
    populates ``catalog_hashes``; we derive them from the ``listing_image_urls``
    already in the request.

    Degrades gracefully (Req 3.5): a reference that can't be fetched or hashed is
    skipped with a log line, never raising.
    """
    urls = listing_image_urls or []
    if not urls:
        return []

    from app.services.image_utils import try_fetch_image_bytes

    hashes: List[str] = []
    for idx, url in enumerate(urls):
        img_bytes = await try_fetch_image_bytes(
            url, trace=trace, phase="fraud", label=f"catalog ref #{idx + 1}")
        if img_bytes is None:
            continue
        h = _phash_of_bytes(img_bytes)
        if h is not None:
            hashes.append(str(h))
    return hashes


def phash_match(image_bytes: bytes, catalog_hashes: List[str]) -> bool:
    """
    True when the image's perceptual hash is within the Hamming threshold of any
    provided catalog hash. catalog_hashes are hex strings produced by imagehash.
    """
    if not catalog_hashes:
        return False
    sub = _phash_of_bytes(image_bytes)
    if sub is None:
        return False
    try:
        import imagehash
        for h in catalog_hashes:
            try:
                ref = imagehash.hex_to_hash(h)
            except Exception:  # noqa: BLE001
                continue
            if (sub - ref) <= settings.phash_hamming_threshold:
                return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("phash comparison failed: %s", exc)
    return False


def exif_has_camera_data(image_bytes: bytes) -> bool:
    """True when EXIF camera make/model/timestamp metadata is present."""
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(image_bytes))
        exif = img.getexif()
        if not exif:
            return False
        return any(exif.get(tag) for tag in (_EXIF_MAKE, _EXIF_MODEL, _EXIF_DATETIME))
    except Exception as exc:  # noqa: BLE001
        logger.warning("EXIF read failed: %s", exc)
        return False


async def _rekognition_web_match(image_bytes: bytes) -> bool:
    """
    Weak web/stock-image signal. We use moderation + label detection; a label set
    dominated by generic 'product photo' style cues is a soft hint. For the demo
    we treat any moderation hit as a soft web-match signal.
    """
    try:
        from app.services.rekognition import rekognition_service
        mod = await rekognition_service.detect_moderation_labels_bytes(image_bytes)
        return len(mod) > 0
    except Exception as exc:  # noqa: BLE001
        logger.warning("Rekognition web-match check failed: %s", exc)
        return False


def classify(any_phash_match: bool, any_exif_camera: bool, any_web_match: bool):
    """
    Pure classification of fraud signals (testable without AWS / image fetches).
    Returns (classification, triggering_signal).
    """
    if any_phash_match:
        return CLASSIFICATION_HARD, "phash_match_catalog"
    if (not any_exif_camera) or any_web_match:
        triggering = "missing_exif" if not any_exif_camera else "rekognition_web_match"
        return CLASSIFICATION_SOFT, triggering
    return CLASSIFICATION_CLEAN, None


async def run_preflight(image_urls: List[str], catalog_hashes: Optional[List[str]] = None,
                        listing_image_urls: Optional[List[str]] = None,
                        trace=None) -> dict:
    """
    Run all three pre-flight checks across the submitted photos.

    Returns:
      {
        phash_match: bool,
        exif_has_camera_data: bool,
        rekognition_web_match: bool,
        classification: HARD | SOFT | CLEAN,
        triggering_signal: str | None,
        notes: [str],
      }
    """
    catalog_hashes = list(catalog_hashes or [])
    listing_image_urls = listing_image_urls or []
    notes: List[str] = []

    from app.services.image_utils import try_fetch_image_bytes

    # Derive catalog perceptual hashes from the listing reference photos. The
    # backend can't pre-compute these (they must be bit-compatible with imagehash,
    # which only exists here), so it always sends catalog_hashes=[]; we hash the
    # references ourselves. Any pre-supplied catalog_hashes are still honored.
    if trace is not None:
        trace.info("fraud", "FRAUD_PREFLIGHT",
                   f"🛡️ Fraud preflight: checking {len(image_urls or [])} photo(s) "
                   f"against {len(catalog_hashes) + len(listing_image_urls)} catalog hash(es) "
                   "(perceptual-hash, EXIF camera data, Rekognition moderation)")

    if listing_image_urls:
        computed = await _compute_catalog_hashes(listing_image_urls, trace=trace)
        catalog_hashes = catalog_hashes + computed
        if len(computed) < len(listing_image_urls):
            notes.append(
                f"hashed {len(computed)}/{len(listing_image_urls)} catalog reference photo(s)")

    any_phash_match = False
    any_exif_camera = False
    any_web_match = False
    fetched = 0

    for idx, url in enumerate(image_urls or []):
        img_bytes = await try_fetch_image_bytes(
            url, trace=trace, phase="fraud", label=f"fraud photo #{idx + 1}")
        if img_bytes is None:
            notes.append(f"could not fetch {url} for fraud preflight")
            continue
        fetched += 1

        # 1. perceptual hash vs catalog
        if phash_match(img_bytes, catalog_hashes):
            any_phash_match = True

        # 2. EXIF camera metadata
        if exif_has_camera_data(img_bytes):
            any_exif_camera = True

        # 3. Rekognition web/label signal
        if await _rekognition_web_match(img_bytes):
            any_web_match = True

    # Classify. Hard signal short-circuits.
    classification, triggering = classify(any_phash_match, any_exif_camera, any_web_match)

    if trace is not None:
        level = "error" if classification == CLASSIFICATION_HARD else (
            "warn" if classification == CLASSIFICATION_SOFT else "success")
        if classification == CLASSIFICATION_CLEAN:
            msg = f"✅ Fraud preflight CLEAN — no signals across {fetched} photo(s)"
        else:
            msg = (f"⚠️ Fraud preflight {classification} — triggering signal: {triggering}"
                   + (" (HARD signal short-circuits grading)"
                      if classification == CLASSIFICATION_HARD else ""))
        trace.add("fraud", "FRAUD_RESULT", msg, level=level,
                  classification=classification, triggering_signal=triggering,
                  phash_match=any_phash_match, exif_has_camera_data=any_exif_camera,
                  rekognition_web_match=any_web_match, photos_fetched=fetched,
                  notes=notes or None)

    return {
        "phash_match": any_phash_match,
        "exif_has_camera_data": any_exif_camera,
        "rekognition_web_match": any_web_match,
        "classification": classification,
        "triggering_signal": triggering,
        "notes": notes,
    }
