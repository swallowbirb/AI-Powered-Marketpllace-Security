import logging

from fastapi import APIRouter

from app.models.schemas import PhotoValidationRequest, PhotoValidationResponse
from app.services import opencv_utils
from app.services.clip_service import clip_service
from app.services.image_utils import try_fetch_image_bytes
from app.services.rekognition import rekognition_service

router = APIRouter()
logger = logging.getLogger("ml-service.vision")


@router.post("/validate-photo", response_model=PhotoValidationResponse)
async def validate_photo(request: PhotoValidationRequest):
    """
    Validate a single photo (Task 2.6, Requirement 5):
      - OpenCV blur / brightness / resolution checks
      - Optional CLIP zero-shot subject match when expected_subject is provided
    Returns is_valid=false + specific issues on any failed check.
    """
    image_bytes = await try_fetch_image_bytes(request.photo_url)
    if image_bytes is None:
        return PhotoValidationResponse(
            photo_url=request.photo_url,
            is_valid=False,
            issues=["unprocessable_image"],
        )

    try:
        quality = opencv_utils.validate_photo_quality(image_bytes)
    except Exception as exc:  # noqa: BLE001
        logger.warning("OpenCV validation failed: %s", exc)
        return PhotoValidationResponse(
            photo_url=request.photo_url,
            is_valid=False,
            issues=["unprocessable_image"],
        )

    issues = list(quality["issues"])

    # Optional CLIP subject match.
    if request.expected_subject:
        match = await clip_service.subject_match(request.photo_url, request.expected_subject)
        if match.get("available") and not match.get("matches"):
            issues.append("wrong_subject")

    return PhotoValidationResponse(
        photo_url=request.photo_url,
        is_valid=len(issues) == 0,
        issues=issues,
        blur_score=quality["blur_score"],
        brightness_score=quality["brightness_score"],
    )


@router.post("/analyze-image")
async def analyze_image(request: PhotoValidationRequest):
    """Rekognition label detection on a single image (returns labels + confidence)."""
    image_bytes = await try_fetch_image_bytes(request.photo_url)
    if image_bytes is None:
        return {"photo_url": request.photo_url, "labels": [], "error": "unprocessable_image"}
    try:
        labels = await rekognition_service.detect_labels_bytes(image_bytes)
        return {
            "photo_url": request.photo_url,
            "labels": [
                {
                    "name": l.get("Name"),
                    "confidence": l.get("Confidence"),
                    "instances": l.get("Instances", []),
                }
                for l in labels
            ],
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning("Rekognition analyze-image failed: %s", exc)
        return {"photo_url": request.photo_url, "labels": [], "error": "rekognition_unavailable"}
