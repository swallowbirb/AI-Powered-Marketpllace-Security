"""
Image fetching helpers shared across the grading pipeline.

Photos live in S3 and are passed around as URL strings. These helpers fetch the
raw bytes (async, off the event loop) and parse S3 bucket/key out of an HTTPS URL
so we can call the Rekognition/Textract S3Object APIs without re-uploading.
"""
import asyncio
import logging
from typing import Optional, Tuple
from urllib.parse import urlparse, unquote

import httpx

logger = logging.getLogger("ml-service.image_utils")


class ImageFetchError(Exception):
    """Raised when an image URL cannot be retrieved or decoded."""


async def fetch_image_bytes(url: str, timeout: float = 10.0) -> bytes:
    """Fetch raw image bytes from an HTTP(S) URL. Raises ImageFetchError on failure."""
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.content
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to fetch image %s: %s", url, exc)
        raise ImageFetchError(f"Could not fetch image from {url}: {exc}") from exc


async def try_fetch_image_bytes(url: str, timeout: float = 10.0) -> Optional[bytes]:
    """Like fetch_image_bytes but returns None on failure instead of raising."""
    try:
        return await fetch_image_bytes(url, timeout=timeout)
    except ImageFetchError:
        return None


def parse_s3_url(url: str) -> Optional[Tuple[str, str]]:
    """
    Parse a standard S3 HTTPS URL into (bucket, key).
    Supports virtual-hosted (https://<bucket>.s3.<region>.amazonaws.com/<key>)
    and path-style (https://s3.<region>.amazonaws.com/<bucket>/<key>) forms.
    Returns None if the URL is not an S3 URL.
    """
    try:
        parsed = urlparse(url)
        host = parsed.netloc.lower()
        path = unquote(parsed.path.lstrip("/"))
        if ".s3." in host or host.endswith("s3.amazonaws.com") or host.startswith("s3."):
            if host.startswith("s3.") or host == "s3.amazonaws.com":
                # path-style: first segment is the bucket
                parts = path.split("/", 1)
                if len(parts) == 2:
                    return parts[0], parts[1]
                return None
            # virtual-hosted: bucket is the leading host label
            bucket = host.split(".s3.")[0] if ".s3." in host else host.split(".s3-")[0]
            return bucket, path
        return None
    except Exception:  # noqa: BLE001
        return None
