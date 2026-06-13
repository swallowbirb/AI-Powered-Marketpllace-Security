"""
Property-based & unit tests for the dependency-free grading logic (Task 2.13).

These exercise the correctness properties from the spec without requiring AWS,
torch, or fastapi to be installed. Run with: python -m pytest ml-service/tests
(or the bundled fallback runner: python tests/test_grading_properties.py).

Maps to spec correctness properties:
  P1/P2 — Grade schema validity + domain (enums + bounds)
  P3    — Low-confidence / missing-evidence => flagged (modeled here as confidence rule)
  P4    — Hard fraud short-circuits
  P5    — Pass-1 cache determinism
  P6    — Form schema round-trip (JSON extraction)
  P8    — Partial-failure resilience (Rekognition unavailable -> missingEvidence)
"""
import os
import sys
import json
import random
import string

# Make `app` importable.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.grade_validation import (
    coerce_and_validate, GradeValidationError, GRADES, CONFIDENCE, ROUTING,
)
from app.services.json_utils import extract_json, JSONExtractionError
from app.services.ttl_cache import cache_key, normalize_reason, TTLCache
from app.services import fraud_preflight


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _rand_str(n=8):
    return "".join(random.choice(string.ascii_letters + " ") for _ in range(n))


def _random_raw_grade():
    return {
        "grade": random.choice(["A", "B", "C", "D", "a", "z", "", None]),
        "qualityScore": random.choice([random.randint(-50, 200), "80", None, 73.6]),
        "confidence": random.choice(["high", "medium", "low", "HIGH", "bogus", None]),
        "routingHint": random.choice(["resell", "donate", "??", None]),
        "estimatedResalePct": random.choice([random.uniform(-1, 2), "0.5", None]),
        "missingEvidence": random.choice([[], ["serial"], ["a", "b"]]),
        "defects": [{"type": "scuff", "severity": random.choice(["minor", "x"])}],
        "returnClaimVerified": random.choice([True, False, "yes"]),
        "rationale": random.choice(["", "looks worn"]),
    }


# --------------------------------------------------------------------------- #
# P1 / P2 — Grade domain invariants
# --------------------------------------------------------------------------- #
def test_grade_domain_invariants():
    for _ in range(500):
        raw = _random_raw_grade()
        try:
            g = coerce_and_validate(raw, {})
        except GradeValidationError:
            # Only acceptable when the grade enum was unrecoverable.
            assert str(raw.get("grade", "")).strip().upper() not in GRADES
            continue
        assert g["grade"] in GRADES
        assert g["confidence"] in CONFIDENCE
        assert g["routingHint"] in ROUTING
        assert 0 <= g["qualityScore"] <= 100
        assert 0.0 <= g["estimatedResalePct"] <= 1.0
        for d in g["defects"]:
            assert d["severity"] in {"minor", "moderate", "major"}
        assert isinstance(g["rationale"], str) and g["rationale"]


# --------------------------------------------------------------------------- #
# P3 — missing evidence / low confidence never reports high
# --------------------------------------------------------------------------- #
def test_missing_evidence_never_high_confidence():
    for _ in range(200):
        raw = _random_raw_grade()
        raw["grade"] = "B"
        raw["confidence"] = "high"
        raw["missingEvidence"] = ["serial_number"]
        g = coerce_and_validate(raw, {})
        assert g["confidence"] != "high"


def test_rekognition_unavailable_downgrades_and_adds_missing():
    raw = {"grade": "A", "confidence": "high", "routingHint": "resell",
           "qualityScore": 90, "estimatedResalePct": 0.9, "rationale": "clean"}
    g = coerce_and_validate(raw, {"warnings": ["rekognition_unavailable"]})
    assert "defect_detection" in g["missingEvidence"]
    assert g["confidence"] != "high"


# --------------------------------------------------------------------------- #
# P4 — Hard fraud short-circuit classification
# --------------------------------------------------------------------------- #
def test_hard_fraud_classification():
    # phash match always => HARD regardless of other signals.
    for exif in (True, False):
        for web in (True, False):
            cls, sig = fraud_preflight.classify(True, exif, web)
            assert cls == fraud_preflight.CLASSIFICATION_HARD
            assert sig == "phash_match_catalog"


def test_soft_and_clean_fraud_classification():
    # No phash, has exif, no web => CLEAN.
    cls, sig = fraud_preflight.classify(False, True, False)
    assert cls == fraud_preflight.CLASSIFICATION_CLEAN
    # No phash, missing exif => SOFT.
    cls, sig = fraud_preflight.classify(False, False, False)
    assert cls == fraud_preflight.CLASSIFICATION_SOFT
    # No phash, has exif, web match => SOFT.
    cls, sig = fraud_preflight.classify(False, True, True)
    assert cls == fraud_preflight.CLASSIFICATION_SOFT


# --------------------------------------------------------------------------- #
# P5 — Pass-1 cache determinism
# --------------------------------------------------------------------------- #
def test_cache_key_determinism():
    for _ in range(200):
        pid = _rand_str(10)
        reason = _rand_str(20)
        # Same product + reason with cosmetic whitespace/case changes => same key.
        variant = f"  {reason.upper()}   "
        assert cache_key(pid, reason) == cache_key(pid, variant)
        # Different product => different key (overwhelmingly likely).
        assert cache_key(pid + "x", reason) != cache_key(pid, reason)


def test_normalize_reason():
    assert normalize_reason("  Hello   World ") == "hello world"
    assert normalize_reason("ALL\tCAPS\nHERE") == "all caps here"


def test_ttl_cache_hit_and_miss():
    c = TTLCache(ttl_seconds=3600)
    c.set("k", {"a": 1})
    assert c.get("k") == {"a": 1}
    assert c.get("missing") is None
    # Expired entry behaves as miss.
    c2 = TTLCache(ttl_seconds=-1)
    c2.set("k", {"a": 1})
    assert c2.get("k") is None


# --------------------------------------------------------------------------- #
# P6 — JSON extraction / form-schema round-trip
# --------------------------------------------------------------------------- #
def test_json_extraction_strips_prose_and_fences():
    obj = {"title": "t", "fields": [{"id": "x", "type": "photo"}]}
    raw = json.dumps(obj)
    assert extract_json(raw) == obj
    assert extract_json(f"Here is your form:\n```json\n{raw}\n```\nThanks!") == obj
    assert extract_json(f"Sure! {raw} (done)") == obj


def test_json_extraction_roundtrip():
    for _ in range(100):
        obj = {"title": _rand_str(6), "fields": [{"id": _rand_str(4), "type": "text"}]}
        once = extract_json(json.dumps(obj))
        twice = extract_json(json.dumps(once))
        assert once == twice == obj


def test_json_extraction_errors():
    for bad in ["", "   ", "no json here", "{ unbalanced"]:
        try:
            extract_json(bad)
            assert False, f"expected error for {bad!r}"
        except JSONExtractionError:
            pass


# --------------------------------------------------------------------------- #
# Minimal fallback runner (when pytest is unavailable)
# --------------------------------------------------------------------------- #
if __name__ == "__main__":
    funcs = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in funcs:
        try:
            fn()
            print(f"PASS {fn.__name__}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"FAIL {fn.__name__}: {exc}")
    print(f"\n{len(funcs) - failed}/{len(funcs)} passed")
    sys.exit(1 if failed else 0)
