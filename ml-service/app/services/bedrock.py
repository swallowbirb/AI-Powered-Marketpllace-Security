"""
Bedrock client wrapper — Task 2.1

Supports two model families behind one interface:
  * Amazon Nova (e.g. amazon.nova-pro-v1:0) via the multimodal ``converse`` API.
  * Anthropic Claude (fallback) via ``invoke_model``.

Adds:
  * Automatic single retry against the configured fallback model (Req 11.1/11.2).
  * Per-attempt timeout via botocore read/connect timeouts (Req 11.1).
  * A JSON-extraction helper that strips prose and parses the first valid JSON object.
  * ``invoke_json`` returning parsed JSON or raising a typed error.
"""
import json
import time
import asyncio
import logging
from typing import Optional, List

from app.config import settings
from app.services.json_utils import extract_json as _extract_json, JSONExtractionError
from app.services.trace import clip_text as _clip_text

logger = logging.getLogger("ml-service.bedrock")


class BedrockError(Exception):
    """Bedrock invocation failed on both primary and fallback models."""


class BedrockJSONError(Exception):
    """Bedrock returned text that could not be parsed into JSON."""


def _is_nova(model_id: str) -> bool:
    return "nova" in (model_id or "").lower()


def _is_anthropic(model_id: str) -> bool:
    return "anthropic" in (model_id or "").lower() or "claude" in (model_id or "").lower()


def extract_json(text: str) -> dict:
    """Strip prose and parse the first valid JSON object. Raises BedrockJSONError."""
    try:
        return _extract_json(text)
    except JSONExtractionError as exc:
        raise BedrockJSONError(str(exc)) from exc


class BedrockService:
    def __init__(self):
        self._client = None
        self.primary_model = settings.bedrock_model_primary
        self.fallback_model = settings.bedrock_model_fallback

    @property
    def client(self):
        """Lazily construct the boto3 client so the module imports without AWS deps."""
        if self._client is None:
            import boto3
            from botocore.config import Config as BotoConfig
            boto_config = BotoConfig(
                region_name=settings.bedrock_region,
                connect_timeout=settings.bedrock_timeout_seconds,
                read_timeout=settings.bedrock_timeout_seconds,
                retries={"max_attempts": 0},  # we manage fallback ourselves
            )
            self._client = boto3.client(
                "bedrock-runtime",
                region_name=settings.bedrock_region,
                aws_access_key_id=settings.aws_access_key_id,
                aws_secret_access_key=settings.aws_secret_access_key,
                config=boto_config,
            )
        return self._client

    # ------------------------------------------------------------------ #
    # Low-level family-specific invocation
    # ------------------------------------------------------------------ #
    def _invoke_nova(self, prompt: str, images: Optional[List[bytes]], max_tokens: int,
                     temperature: float) -> str:
        """Use the Bedrock ``converse`` API (multimodal text + image)."""
        content = [{"text": prompt}]
        for img_bytes in images or []:
            content.append({
                "image": {
                    "format": "jpeg",
                    "source": {"bytes": img_bytes},
                }
            })
        response = self.client.converse(
            modelId=self._current_model,
            messages=[{"role": "user", "content": content}],
            inferenceConfig={"maxTokens": max_tokens, "temperature": temperature},
        )
        blocks = response["output"]["message"]["content"]
        return "".join(b.get("text", "") for b in blocks)

    def _invoke_anthropic(self, prompt: str, images: Optional[List[bytes]], max_tokens: int,
                          temperature: float) -> str:
        """Use ``invoke_model`` with the Anthropic messages body."""
        import base64

        content = [{"type": "text", "text": prompt}]
        for img_bytes in images or []:
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": base64.b64encode(img_bytes).decode("utf-8"),
                },
            })
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [{"role": "user", "content": content}],
        })
        response = self.client.invoke_model(
            modelId=self._current_model,
            contentType="application/json",
            accept="application/json",
            body=body,
        )
        result = json.loads(response["body"].read())
        return result["content"][0]["text"]

    def _invoke_sync(self, prompt: str, model_id: str, images: Optional[List[bytes]],
                     max_tokens: int, temperature: float) -> str:
        self._current_model = model_id
        if _is_nova(model_id):
            return self._invoke_nova(prompt, images, max_tokens, temperature)
        if _is_anthropic(model_id):
            return self._invoke_anthropic(prompt, images, max_tokens, temperature)
        # Default to Nova converse for unknown families.
        return self._invoke_nova(prompt, images, max_tokens, temperature)

    # ------------------------------------------------------------------ #
    # Public async API
    # ------------------------------------------------------------------ #
    async def invoke(self, prompt: str, model_id: str = None, images: Optional[List[bytes]] = None,
                     max_tokens: int = 2048, temperature: float = 0.0,
                     *, trace=None, phase: str = "pass2", label: str = "Bedrock") -> str:
        """
        Invoke Bedrock with text (+ optional images), returning raw model text.
        Tries the primary model, then exactly once against the fallback (Req 11.1/11.2).
        Raises BedrockError when both attempts fail.

        When ``trace`` is provided, every attempt is recorded: the model id, family,
        prompt size, image count, and on failure the EXACT boto3 error (e.g.
        AccessDeniedException, ValidationException, ResourceNotFoundException) so a
        dev can see precisely why a model call "isn't working".
        """
        models = [model_id] if model_id else [self.primary_model, self.fallback_model]
        img_count = len(images or [])
        last_err = None
        for idx, model in enumerate(models):
            family = "nova/converse" if _is_nova(model) else (
                "anthropic/invoke_model" if _is_anthropic(model) else "nova/converse(default)")
            role = "primary" if idx == 0 else "fallback"
            if trace is not None:
                trace.info(
                    phase, "BEDROCK_INVOKE",
                    f"🤖 Calling {label} → {model} ({role}, {family}) "
                    f"with {img_count} image(s), {len(prompt)} prompt chars, max_tokens={max_tokens}",
                    model_id=model, family=family, attempt=idx + 1, role=role,
                    image_count=img_count, prompt_chars=len(prompt),
                    max_tokens=max_tokens, temperature=temperature,
                )
            started = time.perf_counter()
            try:
                text = await asyncio.to_thread(
                    self._invoke_sync, prompt, model, images, max_tokens, temperature
                )
                elapsed = round((time.perf_counter() - started) * 1000, 1)
                if trace is not None:
                    trace.success(
                        phase, "BEDROCK_INVOKE",
                        f"✅ {label} responded from {model} in {elapsed:.0f}ms ({len(text)} chars)",
                        duration_ms=elapsed, model_id=model, role=role,
                        response_chars=len(text), response_preview=_clip_text(text, 200),
                    )
                return text
            except Exception as exc:  # noqa: BLE001 — fall through to fallback
                elapsed = round((time.perf_counter() - started) * 1000, 1)
                last_err = exc
                # Surface the AWS error CODE explicitly — this is the actionable bit.
                aws_code = None
                try:
                    aws_code = getattr(exc, "response", {}).get("Error", {}).get("Code")
                except Exception:  # noqa: BLE001
                    aws_code = None
                will_fallback = idx + 1 < len(models)
                if trace is not None:
                    trace.error(
                        phase, "BEDROCK_INVOKE",
                        f"❌ {label} FAILED on {model} ({role}): "
                        f"{aws_code or type(exc).__name__} — {_clip_text(exc, 220)}"
                        + (f". Retrying on fallback {models[idx + 1]}…" if will_fallback
                           else ". No models left — pipeline will degrade."),
                        exc=exc, duration_ms=elapsed, model_id=model, role=role,
                        aws_error_code=aws_code, will_fallback=will_fallback,
                    )
                logger.warning("Bedrock invoke failed on %s (attempt %d): %s", model, idx + 1, exc)
                continue
        raise BedrockError(f"All Bedrock attempts failed: {last_err}")

    async def invoke_json(self, prompt: str, images: Optional[List[bytes]] = None,
                          max_tokens: int = 2048, temperature: float = 0.0,
                          *, trace=None, phase: str = "pass2", label: str = "Bedrock") -> dict:
        """
        Invoke Bedrock and return parsed JSON.
        Raises BedrockError (invocation) or BedrockJSONError (parse) on failure.
        """
        text = await self.invoke(prompt, images=images, max_tokens=max_tokens,
                                 temperature=temperature, trace=trace, phase=phase, label=label)
        try:
            parsed = extract_json(text)
        except BedrockJSONError as exc:
            if trace is not None:
                trace.error(
                    phase, "BEDROCK_PARSE",
                    f"❌ {label} returned text that is not valid JSON: {_clip_text(exc, 160)}",
                    exc=exc, raw_preview=_clip_text(text, 400),
                )
            raise
        return parsed


bedrock_service = BedrockService()
