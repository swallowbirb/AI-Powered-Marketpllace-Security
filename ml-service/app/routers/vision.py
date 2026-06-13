from fastapi import APIRouter
from app.models.schemas import PhotoValidationRequest, PhotoValidationResponse

router = APIRouter()


@router.post("/validate-photo", response_model=PhotoValidationResponse)
async def validate_photo(request: PhotoValidationRequest):
    """
    Validates a single photo for quality issues:
    - Blur detection (Laplacian variance)
    - Lighting adequacy
    - Moiré pattern detection
    - Minimum resolution check
    TODO: implement in Phase 2
    """
    raise NotImplementedError("Photo validation not yet implemented — Phase 2")


@router.post("/analyze-image")
async def analyze_image(request: PhotoValidationRequest):
    """
    Rekognition label detection on an image.
    Returns labels, confidence scores, and bounding boxes.
    TODO: implement in Phase 2
    """
    raise NotImplementedError("Image analysis not yet implemented — Phase 2")
