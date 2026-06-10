# Solutions Breakdown: AI-Powered Counterfeit Prevention Architecture

This document outlines the core counterfeit prevention layers designed for rapid implementation and high-impact detection during the hackathon. It bridges the gap between our existing fake-review detection stack (DistilBERT + XGBoost + Graph Networks) and real-time product lifecycle monitoring.

---

## 1. Layer 1: The Transactional Firewall (Anomaly Detection)
**Target Threat:** Listing Hijacking & ASIN Piggybacking.
**Concept:** Fraudsters need to move counterfeit volume fast before getting caught. We freeze them at the transaction level before they can cash out.
* **Tech Stack:** `scikit-learn` (`IsolationForest` or `LocalOutlierFactor`), Pandas.
* **Architecture Flow:**
    1. Ingest real-time purchase stream.
    2. Calculate real-time rolling metrics (Velocity, Price Delta).
    3. Feed into `IsolationForest`.
    4. **Action:** If `Seller_Age < 30 days` AND `Price_Discount > 25%` AND `Velocity Anomaly Score > Threshold` -> Freeze payouts and trigger manual review.

## 2. Layer 2: Real-Time Lifecycle NLP Monitor (Bait-and-Switch Shield)
**Target Threat:** Bait-and-Switch tactics (Real images online, fake products shipped).
**Concept:** Don't wait for the 30-day return rate to update. Catch the *very first* signals of customer dissatisfaction using our existing NLP pipeline.
* **Tech Stack:** HuggingFace `transformers` (DistilBERT fine-tuned / Zero-Shot Classification).
* **Architecture Flow:**
    1. Route the first 5-10 post-purchase messages, return reasons, or initial reviews through DistilBERT.
    2. Classify for high-risk counterfeit semantics (e.g., "fake", "plastic", "wrong item", "scam", "knockoff", "cheap").
    3. **Action:** If High-Risk Semantic Score > 0.85 -> Instantly pause the listing pending verification.

## 3. Layer 3: Proxied MLLM Image-Text Verification
**Target Threat:** Brand Obfuscation (e.g., listing a fake Rolex as a "Men's Luxury Silver Watch" to bypass text filters, but using a picture with the Rolex logo).
**Concept:** Emulate Amazon's Multimodal LLMs using modern Vision APIs to cross-reference visual data with listing metadata.
* **Tech Stack:** Gemini Vision API (or OpenAI Vision API), `fuzzywuzzy` (for text matching).
* **Architecture Flow:**
    1. On listing creation, pass the Main Image and Listing Title to the Vision API.
    2. *Prompt:* "Extract all visible brand names/logos from this image."
    3. Cross-reference the extracted logo text with the Listing Title and declared 'Brand' attribute.
    4. **Action:** If Extracted Logo == "Nike" BUT Title/Brand == "Generic Athletic Shoe" -> Reject listing creation.

## 4. Layer 4: External Trend Shield (Proactive Threat Intel)
**Target Threat:** Opportunistic Counterfeit Attacks on Viral Products.
**Concept:** Anticipate where the fraudsters will strike next based on external social signals.
* **Tech Stack:** Python `pytrends` (Google Trends API wrapper) or simulated TikTok/Twitter trend scraper, Redis (for fast caching).
* **Architecture Flow:**
    1. Cron job runs every 6 hours to fetch trending e-commerce keywords.
    2. Updates a "High-Risk Keyword Cache".
    3. **Action:** Any *new* seller attempting to list an item hitting these keywords faces a heightened verification friction layer (e.g., mandatory invoice upload).

---

## Threat Taxonomy & Detection Mapping

| Fraudster Skill | Their Techniques | How We Catch Them (Tech Stack & Logic) |
| :--- | :--- | :--- |
| **Noob** | **Blatant Copy-Paste:** Creates a new listing with the exact title, brand, and images of an established brand (e.g., "Nike Air Max"). | **Basic Heuristics & Verification:** Simple exact-string matching on protected brand registries. Caught during listing creation because their seller account lacks brand authorization tokens. |
| **Intermediate** | **Brand Obfuscation:** Uses generic text ("Running Shoe Athletic") to evade text filters, but uploads images showing a counterfeit Nike swoosh to trick buyers. | **Proxied MLLM Verification (Layer 3):** Gemini Vision API extracts the "Nike" logo from the image. Fuzzy matching detects a mismatch with the "Generic" text listing. Listing blocked pre-publication. |
| **Advanced** | **Bait-and-Switch:** Uses legitimate brand images and descriptions. Ships a cheap knock-off. Relies on the 14-day return lag to cash out the marketplace payout. | **Lifecycle NLP Monitor (Layer 2) + Transactional Firewall (Layer 1):** `IsolationForest` flags the initial unusual sales velocity. DistilBERT catches the word "knockoff" in the *first* customer return message on Day 4. Payout frozen before Day 14. |
| **Expert** | **Syndicate Variation Hijacking:** Piggybacks on a legitimate ASIN as a "color variant." Uses a botnet to pump fake 5-star reviews to own the Buy Box. | **Graph DB + NLP (Existing Stack):** Neo4j identifies the botnet network (shared IPs/review broker graphs). DistilBERT flags the reviews as semantically artificial. XGBoost drops their seller trust score to 0. |
