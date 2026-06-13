"""Tiny in-memory TTL cache used by the Pass-1 form-schema cache (Task 2.5)."""
import time
import hashlib
import re
from typing import Any, Optional


def normalize_reason(reason: str) -> str:
    """Lowercase, trim, collapse internal whitespace runs to a single space (Req 3.2)."""
    if not reason:
        return ""
    return re.sub(r"\s+", " ", reason.strip().lower())


def cache_key(product_id: str, reason: str) -> str:
    """hash(productId + normalized_reason) — deterministic Pass-1 cache key (Req 3.2/3.4)."""
    norm = normalize_reason(reason)
    return hashlib.sha256(f"{product_id}|{norm}".encode("utf-8")).hexdigest()


class TTLCache:
    def __init__(self, ttl_seconds: int):
        self.ttl = ttl_seconds
        self._store: dict[str, tuple[float, Any]] = {}

    def get(self, key: str) -> Optional[Any]:
        entry = self._store.get(key)
        if entry is None:
            return None
        stored_at, value = entry
        if (time.time() - stored_at) > self.ttl:
            # expired — treat as miss and evict
            self._store.pop(key, None)
            return None
        return value

    def set(self, key: str, value: Any) -> None:
        self._store[key] = (time.time(), value)

    def clear(self) -> None:
        self._store.clear()
