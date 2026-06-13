from typing import Optional, List, Any, Dict
from pydantic import BaseModel, Field, ConfigDict


# --- Grading ---

class GradingRequest(BaseModel):
    item_id: str
    photos: List[str]  # S3 URLs
    category: Optional[str] = None
    return_claim_description: Optional[str] = None
    original_product_id: Optional[str] = None
    # Optional context used for fraud preflight + similarity analysis.
    listing_image_urls: List[str] = []
    catalog_hashes: List[str] = []
    expected_subject: Optional[str] = None


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
    # Provenance / orchestration metadata
    analysis_summary: Dict[str, Any] = {}
    form_schema: Dict[str, Any] = {}
    prompts: Dict[str, str] = {}
    fraud: Dict[str, Any] = {}
    status: str = "ok"              # ok | fraud_rejected | failed


# --- Vision ---

class PhotoValidationRequest(BaseModel):
    photo_url: str                  # S3 URL
    item_id: Optional[str] = None
    expected_subject: Optional[str] = None


class PhotoValidationResponse(BaseModel):
    photo_url: str
    is_valid: bool
    issues: List[str] = []          # e.g. ["blurry", "dark", "moire"]
    blur_score: Optional[float] = None
    brightness_score: Optional[float] = None


# --- Form generation (Pass 1) ---

class FormRequest(BaseModel):
    product_id: str
    reason: str
    category: Optional[str] = None
    initial_photos: List[str] = []
    listing_data: Dict[str, Any] = {}


class FormResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    form_schema: Dict[str, Any] = Field(default_factory=dict, alias="schema")
    status: str
    cached: bool
    key: str
