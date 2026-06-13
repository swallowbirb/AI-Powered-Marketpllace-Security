import logging

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    GradingRequest, GradingResponse, DefectDetail, FormRequest, FormResponse,
)
from app.services import fraud_preflight
from app.services.analysis_orchestrator import run_analysis
from app.services.grade_synthesizer import synthesize_grade, GradeSynthesisError
from app.services.form_generator import generate_form, get_cached_schema, generic_default_schema
from app.services.prompt_loader import PromptError, load_base_prompt

router = APIRouter()
logger = logging.getLogger("ml-service.grading")


@router.post("/form", response_model=FormResponse)
async def generate_evidence_form(request: FormRequest):
    """Pass 1 — generate (or serve cached) evidence Form_Schema."""
    try:
        load_base_prompt()  # Req 13.5 — abort if base prompt unavailable
    except PromptError as exc:
        raise HTTPException(status_code=503, detail=f"Base prompt unavailable: {exc}")

    result = await generate_form(
        product_id=request.product_id,
        reason=request.reason,
        category=request.category,
        initial_photos=request.initial_photos,
        listing_data=request.listing_data,
    )
    return FormResponse(
        schema=result["schema"],
        status=result["status"],
        cached=result["cached"],
        key=result["key"],
    )


@router.post("/", response_model=GradingResponse)
async def grade_item(request: GradingRequest):
    """
    Full two-pass grading pipeline (Tasks 2.3, 2.7, 2.8):
      fraud preflight -> [hard? short-circuit] -> parallel analysis -> Pass 2 synth.
    """
    # Base prompt must be loadable before any Bedrock work (Req 13.5).
    try:
        load_base_prompt()
    except PromptError as exc:
        raise HTTPException(status_code=503, detail=f"Base prompt unavailable: {exc}")

    photos = request.photos or []

    # --- Pre-flight fraud checks (Req 2) ---
    fraud = await fraud_preflight.run_preflight(photos, request.catalog_hashes)

    if fraud["classification"] == fraud_preflight.CLASSIFICATION_HARD:
        # Short-circuit: skip both Bedrock passes, persist no grade (Req 2.3).
        return GradingResponse(
            item_id=request.item_id,
            grade="D",
            quality_score=0,
            confidence="high",
            defects=[],
            missing_evidence=[],
            return_claim_verified=False,
            estimated_resale_pct=0.0,
            routing_hint="liquidate",
            rationale=f"Hard fraud signal detected ({fraud.get('triggering_signal')}). "
                      f"Submission rejected before grading.",
            model_versions={},
            analysis_summary={"fraud": fraud},
            fraud=fraud,
            status="fraud_rejected",
        )

    # --- Parallel specialized analysis (Req 6) ---
    summary = await run_analysis(
        photos=photos,
        listing_images=request.listing_image_urls,
        fraud_outcome=fraud,
        category=request.category,
        reason=request.return_claim_description,
    )

    # --- Pass 2 synthesis (Req 7) ---
    try:
        grade = await synthesize_grade(summary, category=request.category)
    except GradeSynthesisError as exc:
        logger.error("Grade synthesis failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Grade synthesis failed: {exc}")

    pass2_prompt = grade.pop("_prompt", "")

    # Include the Pass-1 Form_Schema for the Evidence_Bundle (Req 8.2). Reuse a cached
    # schema when available; otherwise fall back to the generic default for provenance.
    form_schema = {}
    if request.original_product_id and request.return_claim_description:
        form_schema = get_cached_schema(
            request.original_product_id, request.return_claim_description
        ) or {}
    if not form_schema:
        form_schema = generic_default_schema(request.category)

    return GradingResponse(
        item_id=request.item_id,
        grade=grade["grade"],
        quality_score=grade["qualityScore"],
        confidence=grade["confidence"],
        defects=[DefectDetail(**d) for d in grade["defects"]],
        missing_evidence=grade["missingEvidence"],
        return_claim_verified=grade["returnClaimVerified"],
        estimated_resale_pct=grade["estimatedResalePct"],
        routing_hint=grade["routingHint"],
        rationale=grade["rationale"],
        model_versions=grade["modelVersions"],
        analysis_summary=summary,
        form_schema=form_schema,
        prompts={"pass2": pass2_prompt},
        fraud=fraud,
        status="ok",
    )
