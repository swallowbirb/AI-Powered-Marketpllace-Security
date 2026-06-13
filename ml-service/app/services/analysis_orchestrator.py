"""
Parallel specialized analysis + summary assembly — Task 2.7 (Requirement 6)

Fans out four analyses with asyncio.gather, each wrapped so a single failure
becomes a warning instead of crashing the run:
  * OpenCV color/histogram delta vs the first listing image
  * CLIP visual similarity vs listing images
  * Rekognition label detection (defects w/ confidence + location)
  * Textract OCR (serials / labels / care tags)

Assembles one structured Analysis_Summary that mirrors the v1.43 intermediate shape
and merges in the fraud-preflight outcome.
"""
import asyncio
import logging
from typing import List, Optional, Dict, Any

from app.config import settings
from app.services import opencv_utils
from app.services.clip_service import clip_service
from app.services.image_utils import try_fetch_image_bytes
from app.services.rekognition import rekognition_service, REKOGNITION_VERSION
from app.services.textract import textract_service

logger = logging.getLogger("ml-service.analysis")


async def _with_timeout(coro, timeout: float):
    return await asyncio.wait_for(coro, timeout=timeout)


async def _color_delta(photos: List[str], listing_images: List[str]) -> Dict[str, Any]:
    if not photos or not listing_images:
        return {"available": False, "reason": "no_reference"}
    sub = await try_fetch_image_bytes(photos[0])
    ref = await try_fetch_image_bytes(listing_images[0])
    if sub is None or ref is None:
        return {"available": False, "reason": "fetch_failed"}
    delta = await asyncio.to_thread(opencv_utils.compute_color_histogram_delta, sub, ref)
    return {"available": True, "color_histogram_delta": delta}


async def _clip_similarity(photos: List[str], listing_images: List[str]) -> Dict[str, Any]:
    if not photos:
        return {"available": False, "reason": "no_photos"}
    result = await clip_service.visual_similarity(photos[0], listing_images)
    return result


async def _rekognition_labels(photos: List[str]) -> Dict[str, Any]:
    defects: List[Dict[str, Any]] = []
    all_labels: List[Dict[str, Any]] = []
    for url in photos:
        img = await try_fetch_image_bytes(url)
        if img is None:
            continue
        labels = await rekognition_service.detect_labels_bytes(img)
        for l in labels:
            conf = l.get("Confidence", 0.0)
            entry = {"label": l.get("Name"), "confidence": conf}
            instances = l.get("Instances", [])
            if instances:
                entry["location"] = instances[0].get("BoundingBox")
            all_labels.append(entry)
            # Defect labels recorded when confidence >= 50 (Req 6.2).
            if conf >= 50.0:
                defects.append(entry)
    return {"available": True, "labels": all_labels, "defect_candidates": defects}


async def _textract_ocr(photos: List[str]) -> Dict[str, Any]:
    texts: List[str] = []
    for url in photos:
        img = await try_fetch_image_bytes(url)
        if img is None:
            continue
        lines = await textract_service.extract_text_bytes(img)
        texts.extend(lines)
    return {"available": True, "extracted_text": texts}


async def run_analysis(
    photos: List[str],
    listing_images: Optional[List[str]] = None,
    fraud_outcome: Optional[Dict[str, Any]] = None,
    category: Optional[str] = None,
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Run all specialized analyses concurrently and assemble the Analysis_Summary.
    Each task is independently guarded; a failure is recorded as a warning (Req 6.5/6.6).
    """
    listing_images = listing_images or []
    timeout = settings.analysis_timeout_seconds

    tasks = {
        "opencv_color": _with_timeout(_color_delta(photos, listing_images), timeout),
        "clip_similarity": _with_timeout(_clip_similarity(photos, listing_images), timeout),
        "rekognition": _with_timeout(_rekognition_labels(photos), timeout),
        "textract": _with_timeout(_textract_ocr(photos), timeout),
    }

    results = await asyncio.gather(*tasks.values(), return_exceptions=True)

    summary: Dict[str, Any] = {
        "category": category,
        "reason": reason,
        "photo_count": len(photos),
        "warnings": [],
        "analyses": {},
    }

    for name, result in zip(tasks.keys(), results):
        if isinstance(result, Exception):
            logger.warning("Analysis '%s' failed: %s", name, result)
            summary["warnings"].append(f"{name}_failed")
            summary["analyses"][name] = {"available": False, "error": str(result)}
        else:
            summary["analyses"][name] = result
            if isinstance(result, dict) and result.get("available") is False:
                summary["warnings"].append(f"{name}_unavailable")

    # Rekognition-specific degradation warning (Req 11.5/11.6).
    rek = summary["analyses"].get("rekognition", {})
    if not rek.get("available", False):
        if "rekognition_unavailable" not in summary["warnings"]:
            summary["warnings"].append("rekognition_unavailable")

    # Merge fraud preflight outcome.
    if fraud_outcome is not None:
        summary["fraud"] = fraud_outcome

    summary["rekognition_version"] = REKOGNITION_VERSION
    return summary
