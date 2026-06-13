"""
Bedrock Pass 1 — Form Generator + cache (Task 2.5, Requirements 3 & 11)

Composes the Pass-1 prompt (base + category + template), calls Bedrock invoke_json,
validates the Form_Schema shape, and caches results keyed by
hash(productId + normalized_reason). On Bedrock failure: serve cache if present,
else a generic default schema.
"""
import json
import logging
from typing import Optional, List

from app.config import settings
from app.services import prompt_loader
from app.services.bedrock import bedrock_service, BedrockError, BedrockJSONError
from app.services.ttl_cache import TTLCache, cache_key
from app.services.image_utils import try_fetch_image_bytes

logger = logging.getLogger("ml-service.form_generator")

# Module-scoped cache so it survives across requests within the process.
_pass1_cache = TTLCache(settings.grade_cache_ttl_seconds)

# Status strings surfaced to the backend / progressive-form layer.
STATUS_AI = "ai"
STATUS_CACHE = "cache"
STATUS_FALLBACK_CACHE = "cache_degraded"
STATUS_FALLBACK_GENERIC = "generic_default"


def _generic_default_schema(category: Optional[str]) -> dict:
    """Generic fallback Form_Schema used when Bedrock is unavailable (Req 11.4)."""
    return {
        "title": "Item Condition Evidence",
        "fields": [
            {"id": "front_photo", "label": "Front view", "type": "photo", "required": True,
             "guidance": "Clear, well-lit photo of the front of the item."},
            {"id": "back_photo", "label": "Back view", "type": "photo", "required": True,
             "guidance": "Clear photo of the back of the item."},
            {"id": "defect_photo", "label": "Close-up of any damage", "type": "photo",
             "required": False, "guidance": "Close-up of any defect, wear, or damage."},
            {"id": "label_photo", "label": "Brand / serial label", "type": "photo",
             "required": False, "guidance": "Photo of the brand label or serial number."},
            {"id": "condition_notes", "label": "Condition notes", "type": "text",
             "required": False, "guidance": "Describe the condition or reason in your own words."},
        ],
        "photo_guidance": [
            "Use good lighting and a plain background.",
            "Hold the camera steady to avoid blur.",
        ],
        "category": category or "generic",
        "generated": False,
    }


def _is_valid_form_schema(obj) -> bool:
    if not isinstance(obj, dict):
        return False
    fields = obj.get("fields")
    if not isinstance(fields, list) or len(fields) == 0:
        return False
    for f in fields:
        if not isinstance(f, dict):
            return False
        if "id" not in f or "type" not in f:
            return False
    return True


def get_cached_schema(product_id: str, reason: str) -> Optional[dict]:
    """Return a cached Form_Schema if present and unexpired, else None."""
    return _pass1_cache.get(cache_key(product_id, reason))


async def generate_form(
    product_id: str,
    reason: str,
    category: Optional[str] = None,
    initial_photos: Optional[List[str]] = None,
    listing_data: Optional[dict] = None,
) -> dict:
    """
    Generate (or serve from cache) a Form_Schema.

    Returns:
      { "schema": <Form_Schema>, "status": <STATUS_*>, "cached": bool, "key": <str> }
    """
    key = cache_key(product_id, reason)

    # Cache hit -> skip Bedrock entirely (Req 3.3, 12.3).
    cached = _pass1_cache.get(key)
    if cached is not None:
        return {"schema": cached, "status": STATUS_CACHE, "cached": True, "key": key}

    # Compose the Pass-1 prompt.
    template = prompt_loader.load_template("pass1_form_generation.txt")
    body = template.format(
        reason=reason,
        category=category or "unknown",
        listing_data=json.dumps(listing_data or {}, ensure_ascii=False),
    )
    prompt = prompt_loader.compose(category, body)

    # Optionally attach a couple of initial photos (multimodal) — best-effort.
    images: List[bytes] = []
    for url in (initial_photos or [])[:3]:
        b = await try_fetch_image_bytes(url)
        if b is not None:
            images.append(b)

    try:
        schema = await bedrock_service.invoke_json(prompt, images=images or None, max_tokens=1500)
        if not _is_valid_form_schema(schema):
            raise BedrockJSONError("Form schema failed shape validation")
        schema.setdefault("category", category or "generic")
        schema["generated"] = True
        _pass1_cache.set(key, schema)
        return {"schema": schema, "status": STATUS_AI, "cached": False, "key": key}

    except (BedrockError, BedrockJSONError) as exc:
        logger.warning("Pass-1 Bedrock failed (%s); applying fallback", exc)
        # Degraded: serve cache if any (shouldn't be, we already checked), else generic.
        fallback_cached = _pass1_cache.get(key)
        if fallback_cached is not None:
            return {"schema": fallback_cached, "status": STATUS_FALLBACK_CACHE,
                    "cached": True, "key": key}
        return {"schema": _generic_default_schema(category), "status": STATUS_FALLBACK_GENERIC,
                "cached": False, "key": key}


def generic_default_schema(category: Optional[str] = None) -> dict:
    """Public accessor for the generic default schema (used by progressive-form fallback)."""
    return _generic_default_schema(category)
