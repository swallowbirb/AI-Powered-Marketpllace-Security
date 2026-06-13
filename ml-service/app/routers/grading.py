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
from app.services.trace import PipelineTrace

router = APIRouter()
logger = logging.getLogger("ml-service.grading")


@router.post("/form", response_model=FormResponse)
async def generate_evidence_form(request: FormRequest):
    """Pass 1 — generate (or serve cached) evidence Form_Schema."""
    trace = PipelineTrace(request.product_id)
    trace.info("pass1", "FORM_RECEIVED",
               f"📨 Pass 1 /form received for product={request.product_id} "
               f"(category={request.category or 'unknown'}, {len(request.initial_photos)} initial photo(s))")
    try:
        load_base_prompt()  # Req 13.5 — abort if base prompt unavailable
    except PromptError as exc:
        trace.error("pass1", "PROMPT_UNAVAILABLE", f"❌ Base prompt unavailable: {exc}", exc=exc)
        raise HTTPException(status_code=503,
                            detail={"error": f"Base prompt unavailable: {exc}", "trace": trace.to_list()})

    result = await generate_form(
        product_id=request.product_id,
        reason=request.reason,
        category=request.category,
        initial_photos=request.initial_photos,
        listing_data=request.listing_data,
        trace=trace,
    )
    return FormResponse(
        schema=result["schema"],
        status=result["status"],
        cached=result["cached"],
        key=result["key"],
        trace=trace.to_list(),
    )


@router.post("/", response_model=GradingResponse)
async def grade_item(request: GradingRequest):
    """
    Full two-pass grading pipeline (Tasks 2.3, 2.7, 2.8):
      fraud preflight -> [hard? short-circuit] -> parallel analysis -> Pass 2 synth.

    A single PipelineTrace is threaded through every stage and attached to EVERY
    response path — success, fraud-reject, and failure (carried inside the HTTP
    error detail) — so the backend Developer Logs sidebar can replay exactly what
    happened internally, including which model call failed and why.
    """
    trace = PipelineTrace(request.item_id)
    photos = request.photos or []
    trace.info("request", "GRADE_RECEIVED",
               f"📡 ML /grade received: {len(photos)} evidence photo(s), "
               f"{len(request.listing_image_urls)} listing reference(s), "
               f"category={request.category or 'none'}, claim=\"{(request.return_claim_description or '')[:60]}\"",
               item_id=request.item_id, photo_count=len(photos),
               reference_count=len(request.listing_image_urls), category=request.category)

    # Base prompt must be loadable before any Bedrock work (Req 13.5).
    try:
        load_base_prompt()
    except PromptError as exc:
        trace.error("request", "PROMPT_UNAVAILABLE", f"❌ Base prompt unavailable: {exc}", exc=exc)
        raise HTTPException(status_code=503,
                            detail={"error": f"Base prompt unavailable: {exc}", "trace": trace.to_list()})

    # --- Pre-flight fraud checks (Req 2) ---
    fraud = await fraud_preflight.run_preflight(photos, request.catalog_hashes, trace=trace)

    if fraud["classification"] == fraud_preflight.CLASSIFICATION_HARD:
        # Short-circuit: skip both Bedrock passes, persist no grade (Req 2.3).
        trace.warn("response", "GRADE_SHORTCIRCUIT",
                   f"🚫 Hard fraud signal ({fraud.get('triggering_signal')}) — rejecting before grading",
                   triggering_signal=fraud.get("triggering_signal"))
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
            trace=trace.to_list(),
        )

    # --- Parallel specialized analysis (Req 6) ---
    summary = await run_analysis(
        photos=photos,
        listing_images=request.listing_image_urls,
        fraud_outcome=fraud,
        category=request.category,
        reason=request.return_claim_description,
        trace=trace,
    )

    # --- Pass 2 synthesis (Req 7) ---
    try:
        grade = await synthesize_grade(summary, category=request.category, trace=trace)
    except GradeSynthesisError as exc:
        logger.error("Grade synthesis failed: %s", exc)
        # Carry the full trace to the backend inside the error detail so the real
        # cause (e.g. AccessDeniedException on the model) is visible in the sidebar.
        raise HTTPException(
            status_code=502,
            detail={
                "error": f"Grade synthesis failed: {exc}",
                "status": "failed",
                "trace": trace.to_list(),
                "analysis_summary": summary,
            },
        )

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

    trace.success("response", "GRADE_DONE",
                  f"🏁 Grading pipeline complete in {trace.total_ms:.0f}ms "
                  f"({trace.error_count} error(s) along the way) — Grade {grade['grade']}",
                  total_ms=trace.total_ms, error_count=trace.error_count)

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
        trace=trace.to_list(),
    )
