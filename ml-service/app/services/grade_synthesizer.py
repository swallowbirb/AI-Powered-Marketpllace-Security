"""
Bedrock Pass 2 — Grade Synthesizer (Task 2.8, Requirement 7)

Sends the Analysis_Summary TEXT ONLY (no raw images) plus base + category prompts to
Bedrock, parses to a canonical Grade JSON, and enforces enums + numeric bounds. Sets
missingEvidence from insufficient-evidence signals and downgrades confidence.
"""
import json
import logging
from typing import Dict, Any, Optional

from app.config import settings
from app.services import prompt_loader
from app.services.bedrock import bedrock_service, BedrockError, BedrockJSONError
from app.services.rekognition import REKOGNITION_VERSION
from app.services.grade_validation import coerce_and_validate, GradeValidationError

logger = logging.getLogger("ml-service.grade_synth")


class GradeSynthesisError(Exception):
    """Pass-2 produced no valid Grade JSON after primary + fallback attempts."""


async def synthesize_grade(
    analysis_summary: Dict[str, Any],
    category: Optional[str] = None,
    pass1_model: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Run Pass 2. Returns a dict with the validated Grade JSON fields plus modelVersions
    and the composed prompt. Raises GradeSynthesisError on irrecoverable failure.
    """
    template = prompt_loader.load_template("pass2_grade_synthesis.txt")
    body = template.format(analysis_summary=json.dumps(analysis_summary, ensure_ascii=False, indent=2))
    prompt = prompt_loader.compose(category, body)

    try:
        raw = await bedrock_service.invoke_json(prompt, images=None, max_tokens=2000)
    except (BedrockError, BedrockJSONError) as exc:
        raise GradeSynthesisError(f"Bedrock Pass-2 failed: {exc}") from exc

    try:
        grade = coerce_and_validate(raw, analysis_summary)
    except GradeValidationError as exc:
        raise GradeSynthesisError(str(exc)) from exc
    used_pass2_model = getattr(bedrock_service, "_current_model", settings.bedrock_model_primary)
    grade["modelVersions"] = {
        "pass1Model": pass1_model or settings.bedrock_model_primary,
        "pass2Model": used_pass2_model,
        "rekognitionVersion": REKOGNITION_VERSION,
    }
    grade["_prompt"] = prompt
    return grade
