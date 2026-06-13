from typing import Optional, List, Any
from pydantic import BaseModel


# --- Grading ---

class GradingRequest(BaseModel):
    item_id: str
    photos: List[str]  # S3 URLs
    category: Optional[str] = None
    return_claim_description: Optional[str] = None
    original_product_id: Optional[str] = None


class DefectDetail(BaseModel):
    type: str
    severity: str  # minor | moderate | major
    location: Optional[str] = None
    description: Optional[str] = None


class GradingResponse(BaseModel):
    item_id: str
    grade: str                      # A | B | C | D
    quality_score: float            # 0-100
    confidence: str                 # high | medium | low
    defects: List[DefectDetail] = []
    missing_evidence: List[str] = []
    return_claim_verified: bool = False
    estimated_resale_pct: float = 0.0
    routing_hint: str               # resell | refurbish | donate | liquidate
    rationale: str
    model_versions: dict = {}


# --- Vision ---

class PhotoValidationRequest(BaseModel):
    photo_url: str                  # S3 URL
    item_id: Optional[str] = None


class PhotoValidationResponse(BaseModel):
    photo_url: str
    is_valid: bool
    issues: List[str] = []          # e.g. ["blurry", "dark", "moire"]
    blur_score: Optional[float] = None
    brightness_score: Optional[float] = None
