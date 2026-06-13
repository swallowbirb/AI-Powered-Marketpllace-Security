# Implementation Plan — Second-Life Commerce Ecosystem

> High-level, phase-by-phase implementation plan. Plain English. No code.
> Synthesised from: Problem Statement, ANSH Solution Overview, Claude SOLUTION,
> v1.43 Grading System Doc, and the FULL RESEARCH report.
> Optimised for a hackathon: every phase is feasible in hours-to-a-day with the
> picked stack, every phase produces something demoable, and the order is
> dependency-correct so nothing gets blocked.

---

## 0. Hackathon Feature Cut

We had a long wishlist across the docs. Here's the honest triage — what we
actually build for the demo, what we mock, what we drop.

| Feature | Status | Why |
|---|---|---|
| Existing marketplace (browse / cart / orders) | **Build on** | Already half-built in the repo — extend, don't rewrite |
| Dual intake: Returns flow + Sell-Used flow | **Build** | The whole pitch hinges on this |
| AI Grading hybrid pipeline (v1.43) | **Build** | Already specced — the technical centerpiece |
| User Trust Score / Return-history layer | **Build** | High-impact fraud defence + great demo beat |
| Smart Routing & Disposition Engine (live rationale) | **Build** | Single biggest "wow" moment |
| Reverse-logistics cost calculator | **Build** | Cheap utility, drives the Priya narrative |
| Demand Registry + `$geoNear` matching | **Build** | Powers Rahul's "50 parents nearby" moment |
| Resale Marketplace (unified storefront) | **Build** | Both intake paths end here |
| AI Listing generation from grade + photos | **Build** | High wow, low effort, one Bedrock call |
| Product Health Card (Ed25519-signed QR + hash chain) | **Build** | Trust artefact + DPP-ready story |
| Sustainability counter (CO2 / water saved) | **Build** | Trivial to compute, big narrative lever |
| Green Credits ledger | **Build** | Light gamification on top of sustainability |
| NGO/donation routing + tax receipt PDF | **Build** | Closes the Priya loop |
| Return-probability model (XGBoost) | **Build** (offline-trained, served via FastAPI) | Pre-train, ship the saved model |
| Size/fit recommendation (Misra dataset KNN) | **Build** | Cheap, demoable on the PDP |
| Seller bulk dashboard | **Build** (light) | Closes the small-seller persona |
| WhatsApp listing bot | **Stretch** | Twilio sandbox if time, demo via screen recording otherwise |
| CLIP-based "find similar item" search | **Stretch** | Skip if Atlas Vector Search M0 single-index limit bites |
| Refurbishment-partner integration | **Mock** | Stub the path in the routing engine |
| Locker pickup logistics | **Mock** | UI flow + simulated handoff event |
| Real blockchain DPP | **Skip** | Cryptographic signature + hash chain achieves the demo goal |
| Escrow / KYC / payments rails | **Skip** | Out of scope; assume platform-mediated |
| Custom YOLOv8 defect detector | **Skip** | Rekognition Label Detection covers it without training |

---

## 1. Architecture at a Glance

```
[ React frontend ]
        │  REST / JSON
        ▼
[ Node + Express API ]  (existing repo, extended)
   │       │
   │       └──► [ FastAPI Python microservice ]
   │              • OpenCV, CLIP, imagehash, Pillow/EXIF
   │              • Boto3 → AWS Rekognition, Textract, Bedrock
   │              • XGBoost return-probability model
   │              • Size/fit KNN over Misra dataset
   │
   ├──► [ Amazon Bedrock ]   Nova Pro (primary), Claude 3.5 Sonnet (fallback)
   ├──► [ Amazon S3 ]        all uploaded photos
   ├──► [ AWS KMS ]          Ed25519 signing keys for Health Cards
   └──► [ MongoDB Atlas M0 ] one DB, doing triple duty:
            • Documents (users, products, orders, returns, listings, grades, wants, ngos, events)
            • 2dsphere geo index → $geoNear "nearby demand"
            • Atlas Vector Search index → semantic listing discovery (stretch)
```

**Why this stack.**
The repo already runs MERN with mongoose-style modules. AWS-native everything
else gives us hackathon-friendly free tiers and matches the Amazon HackOn
judging frame. Bedrock + Nova Pro is the deliberate hero choice — judges will
notice an Amazon model running an Amazon-themed demo.

---

## 2. Phase Map (Read this first)

```
P0 ─► P1 ─► P2 ─► P3 ─┐
                       ├─► P4 ─► P5 ─► P6 ─► P7 ─► P8 ─► P9
       Existing repo ──┘
```

P0 unblocks everything. P1 is parallel UI work to P2 (grading) and P3 (trust)
which can run in parallel after P0. P4 (routing) consumes outputs from P2 + P3.
P5–P8 are largely independent and can be parallelised. P9 is polish & rehearsal.

---

## Phase 0 — Foundation & Infrastructure

**Goal:** Remove every "I can't start because…" blocker. End of P0 means anyone
can clone the repo, get a `.env`, and run end-to-end placeholder calls.

**What we do, in plain English:**

1. **AWS account prep.** Create one AWS account for the team, set up an IAM user
   with programmatic credentials, and request Bedrock model access for **Amazon
   Nova Pro** and **Claude 3.5 Sonnet** (approval is usually instant but do it
   on Day 1 — it is the single biggest blocker if forgotten). Apply hackathon
   credits to the billing account.

2. **Provision the AWS primitives.**
   - One **S3 bucket** for all uploaded photos (with pre-signed-URL upload from
     the browser, so Express never proxies image bytes).
   - **AWS KMS**: generate one Ed25519 key pair we'll use to sign every Product
     Health Card. Store the public key in the repo / config so anyone can verify
     a Card without an AWS call.
   - **AWS Secrets Manager** entries for Bedrock keys, Mongo URI, signing key
     references.

3. **MongoDB Atlas M0.** Spin up the free cluster, whitelist team IPs, create
   indexes the later phases will need (`2dsphere` on the demand registry,
   text/Atlas-Search index on listings).

4. **Repo skeleton.** Add three new top-level workspaces alongside the existing
   `backend/`:
   - `ml-service/` — the new FastAPI microservice (vision tools + Bedrock
     orchestration + return-probability model).
   - Inside the existing `backend/src/modules/`, scaffold empty module folders
     for: `returns`, `secondhand`, `grading`, `routing`, `demand`, `health-card`,
     `sustainability`, `trust`. Mirrors the existing module-per-domain pattern.
   - `frontend/` work continues against this expanded API surface.

5. **Canonical data contracts.** Lock in the JSON shapes everything else depends
   on, before anyone writes business logic:
   - **Item lifecycle event** (the unit logged at every state change — used by
     the Health Card's hash chain).
   - **Grade JSON** (verbatim from v1.43 spec — already locked).
   - **Routing decision JSON** (chosen path + ranked alternatives + rationale).
   - **Trust profile JSON** (tier + reasons).
   - **Listing JSON** (extends the existing product schema with `intake_path`,
     `grade_id`, `health_card_id`, `condition_lane`).

6. **Seed data.** Create deterministic seed scripts that always produce the same
   demo state: a few sellers, ~20 products, a bunch of "wants" geo-distributed
   around two demo cities, an NGO directory, a handful of historical orders for
   our four demo personas (Priya, Rahul, Anjali, the small seller).

**Done means:** AWS resources exist, schemas are committed, seed loads cleanly,
one ping endpoint per service responds.

---

## Phase 1 — Dual-Intake Entry Points

**Goal:** Build the two front doors that feed the same downstream pipeline. No
AI yet — just the screens, the state machine, and the records that say "a
return started" / "a sell-used listing started."

**What we do:**

1. **Returns flow entry.** From a customer's order page on the existing
   marketplace, add an "Initiate Return" button. Tapping it creates a `return`
   record (links the order, the line item, the user, captures the user's stated
   reason from a small free-text + dropdown).

2. **Sell-Used flow entry.** A new "Sell on Second-Hand" surface in the
   navigation. Two sub-flows:
   - "I bought it here originally" → pick from past orders (the **Relove
     pattern** — pre-fills SKU, listing photos, original purchase date, fabric
     /spec data straight from the catalog).
   - "I bought it elsewhere" → search the catalog and attach to a SKU, or
     describe the item if no catalog match.
   Either way we create an item record that drops into the *same* downstream
   pipeline as a return.

3. **Common evidence-collection shell.** Both flows hand off to one shared React
   page that will eventually host the dynamic Pass-1 form. For now it shows a
   generic placeholder form (reason + free-form photos). The dynamic form drops
   in during Phase 2.

4. **Single return / item state machine.** One enum drives every UI screen
   downstream:
   `INITIATED → EVIDENCE_PENDING → GRADING → ROUTED → IN_TRANSIT → LISTED → SOLD/DONATED/LIQUIDATED`.
   Every transition writes a lifecycle event (this becomes the Health Card hash
   chain in Phase 5).

**Why this matters:** Returns and Sell-Used must converge on the same
downstream pipeline. If we build them as two parallel systems we'll regret it.
Convergence happens here.

**Done means:** A user can start a return from an order *and* start a sell-used
listing from "I bought it elsewhere," and both end up in the same item-record
collection with the same state machine.

---

## Phase 2 — AI Grading Pipeline

**Goal:** Implement the v1.43 hybrid grading pipeline end-to-end. This is the
technical centrepiece. The v1.43 doc is the authoritative spec — this phase
just executes it.

**What we do (mirroring v1.43 step numbers):**

1. **Pre-flight fraud checks** in the FastAPI service. Three cheap signals run
   before any LLM call:
   - **imagehash** — perceptual hash compared against pre-computed hashes of
     every catalog/listing photo. Stock-photo lift detection.
   - **Pillow / ExifRead** — does the image carry camera metadata? Stock images
     don't.
   - **AWS Rekognition** web-detection — does this image already exist on the
     open web?

   A soft fraud signal goes into the trust layer (Phase 3); a hard fraud signal
   short-circuits the whole flow.

2. **Bedrock Pass 1 — Form Generator.** Send the user's reason, a couple of
   initial photos, the product listing data, the base prompt, and the category
   prompt to **Nova Pro on Bedrock**. Output is a JSON form schema describing
   the exact photos and fields we need. Cache the schema by
   `hash(product_id + normalised_reason)` — duplicate requests skip Bedrock.

3. **Progressive form rendering on the frontend.** Show generic fields the
   instant the page loads, swap in AI-tailored fields when Pass 1 returns
   (3–5s). User never sees a spinner.

4. **Per-photo real-time validation** as each upload hits S3:
   - **OpenCV** for blur and lighting checks.
   - **CLIP** zero-shot subject match ("does this photo show a tie collar?")
     against the field's expected subject.

   If a photo fails, the user gets inline feedback before submitting.

5. **Submit → parallel specialised analysis.** Once the form is submitted,
   FastAPI fans out four jobs concurrently (`asyncio.gather`):
   - **OpenCV** — dominant colour + histogram delta vs the listing photo.
   - **CLIP** — overall visual similarity to the listing.
   - **AWS Rekognition Label Detection** — defect / damage labels with
     confidence and locations.
   - **AWS Textract** — read serial numbers, brand labels, care tags.

   All four outputs assemble into one structured JSON summary.

6. **Bedrock Pass 2 — Grade Synthesizer.** Send the structured summary (text
   only, no raw images — keeps Pass 2 cheap) to Nova Pro / Claude with the base
   + category prompts. Output: the canonical Grade JSON (grade A/B/C/D,
   quality_score, defects, missing_evidence, return_claim_verified,
   estimated_resale_pct, routing_hint, rationale).

7. **Persist the full evidence bundle** in MongoDB: prompts used, S3 image
   URLs, intermediate analysis summary, Pass-1 schema, final grade, model
   versions, timestamps. This bundle drives dispute resolution, future model
   tuning, and the Health Card.

8. **Human-review escalation.** If `confidence: low` or `missing_evidence` is
   non-empty, the grade is flagged and shows up on the seller/admin dashboard
   instead of auto-routing.

**Done means:** A user uploading photos gets back an objective Grade JSON in
about 10–20 seconds, persisted with full provenance.

---

## Phase 3 — Trust Score & Fraud Defence Layer

**Goal:** Add the user-history dimension the research report calls out and the
brief explicitly asks for. This is the single biggest improvement over what
ANSH and Claude originally had — we don't grade items in isolation, we grade
items *in the context of who's submitting them*.

This is where the fraud-defence story lives, and it directly answers the
"$103B return-fraud" stat from the research report and Flipkart's defensive
OBD posture without ruining the customer experience.

**What we add — Trust Profile per user.** Computed lazily on every return /
sell-used initiation. Inputs (all already in the existing schema or trivially
derivable):

- **Account age** and verification status (email/phone/KYC).
- **Lifetime purchases** count and value. The exact case the brief calls out:
  40 successful purchases, first return → almost certainly genuine.
- **Lifetime return rate** and recent-90-day return rate (catches sudden
  pattern shifts).
- **Return reason quality** — specific reasons (with photos, with descriptive
  text) score higher than vague ones ("didn't match expectations").
- **Time-to-return distribution** — items consistently returned at the 28th day
  of a 30-day window are flagged ("wardrobing" pattern).
- **Bracketing fingerprint** — repeated multi-size / multi-colour purchases of
  the same SKU with all but one returned. Visible in the order data; we just
  have to query for it.
- **Disputed-grade history** — has the user previously contested grading
  outcomes? Did they win or lose?
- **Successful resale completions** (for sellers / sell-used listers).
- **Device + payment fingerprint reuse across accounts** — same device,
  multiple accounts, all returning the same SKU — coordinated abuse pattern.

**Output: a tiered trust profile.** Five tiers, each gates the flow downstream:

| Tier | What changes for the user |
|---|---|
| **Verified** | Pre-grade refund authorised; abbreviated evidence form; live in-app camera capture only (no gallery); item picked up later for grading on an audit basis. |
| **Trusted** | Standard flow, fast-tracked through routing. |
| **Standard** | Default flow exactly as Phase 2 describes. |
| **Watch** | Extra evidence fields injected into the Pass-1 form; weight verification at locker drop-off; refund withheld until grading clears. |
| **Restricted** | Manual review only; in-person inspection at a partner hub; no auto-refund; account-level alert. |

**Cross-cutting fraud signals** (computed at submission time, feeding the trust
score *and* the routing engine):

- **Reverse-image hits** from Phase 2's pre-flight (stock photo).
- **EXIF anomalies** (no camera metadata, mismatched timestamp/location vs
  user's claimed delivery address).
- **Photo-of-screen detection** via simple moiré-pattern check in OpenCV
  (catches users photographing a product image on another device).
- **Time-to-return anomaly** (returned 4 hours after delivery on a category
  that needs use to evaluate).
- **Locker weight check (mocked for hackathon)** — parcel weight at drop-off
  vs known SKU weight catches empty-box / item-swap fraud the way Flipkart's
  OBD does, but at the locker not the doorstep.

**Why this is a competitive moat.** Every incumbent solution discussed in the
research report is reactive (manual inspection, OBD, liquidator handoff). A
proactive trust score lets us be **frictionless for genuine users and strict
only with risky ones**, which is exactly the gap the report identifies between
"defensive logistics" and "customer experience."

**Done means:** Every return / sell-used submission has a trust profile
attached at the moment of submission, and the downstream UI / routing visibly
behaves differently across tiers.

---

## Phase 4 — Smart Routing & Disposition Engine

**Goal:** Take the Grade JSON (Phase 2) + the Trust Profile (Phase 3) + the
intake path (Phase 1) and decide where the item physically goes. Render the
decision live as horizontal rationale bars — the strongest single demo moment.

**What we build:**

1. **Reverse-logistics cost calculator.** A small pure function: distance
   between user and nearest warehouse × per-kg/per-km carrier rate ×
   weight-bracket multiplier. We use mocked carrier rates seeded into the DB.
   This is what surfaces the "shoes cheaper than the box" insight.

2. **Candidate disposition paths,** each with its own revenue / cost
   computation (Claude SOLUTION's table is the spec):
   - Resell-as-is on the Resale Marketplace.
   - Refurbish then resell (mocked partner — adds repair cost, lifts
     `resale_pct`).
   - Local peer-to-peer redistribution (uses Phase 6's demand registry).
   - Donate to a nearby NGO (Phase 8 — ₹0 plus tax-receipt value plus green
     credits).
   - Liquidate in bulk (5–10% recovery).
   - Return to original seller (returns path only, gated by seller policy).

3. **Weighted scoring engine.** For each path: net recovery = expected revenue
   − expected cost, multiplied by condition factor (from the grade) and demand
   factor (from Phase 6's geo query). Pick the max. Output a *ranked* list of
   alternatives with one-line rationales each.

4. **Hard gates layered on top of the score:**
   - **Hygiene-sensitive categories** (innerwear, food, opened cosmetics)
     short-circuit to liquidate / donate regardless of score.
   - **Trust tier "Watch" or "Restricted"** disables the auto-refund branch.
   - **Seller-policy schema** (per-seller config: accept_threshold,
     allow_donation, refurbish_partner_id) gates which paths are even
     candidates.
   - **Intake path** gates branches: only the returns path can choose
     "return-to-seller"; only the sell-used path can choose "hold for wider
     demand radius."

5. **Live rationale UI.** When a return is graded, the customer (or seller)
   sees all six paths as horizontal bars labelled with computed ₹ recovery.
   The winning path is highlighted with a one-line plain-English explanation.
   Optional: one extra Bedrock call to narrate "why" in conversational English.

**Done means:** Pasting any graded item into the routing endpoint returns a
ranked list of dispositions with computable recovery values and a clear winner
the UI can render.

---

## Phase 5 — Resale Marketplace, AI Listing Generation & Product Health Card

**Goal:** Everything the buyer sees on the resale side, and the trust artefact
that makes them buy with confidence.

**What we build:**

1. **Unified Resale Marketplace surface** in the frontend. One storefront
   hosts items from both intake paths — buyers can't tell which path a listing
   came from, and don't need to. The existing products module gives us most of
   the schema for free; we add `intake_path`, `grade_id`, `health_card_id`,
   `condition_lane` (Like-New / Good / Fair).

2. **AI Listing Generation.** When the routing engine picks a "resell" path,
   one Bedrock call (Nova Pro, structured output) takes the Grade JSON +
   evidence photos + original catalog data and returns:
   - Marketplace title.
   - Buyer-facing description (highlights condition rationale honestly).
   - Suggested price = `new_price × condition_factor × category_depreciation × demand_multiplier`.
   - Best 3 photos auto-selected from the evidence bundle.

   Seller / lister can override price; everything else can be edited but
   defaults to the AI version.

3. **"Fair Condition" lane.** Lower-graded items (Grade C) get grouped in a
   discounted lane on the same storefront, instead of being hidden or
   liquidated. Honest framing — the research report flags inconsistent grading
   as a primary trust killer; we're transparent about lower grades and price
   accordingly.

4. **Product Health Card.** The trust artefact. For every item that gets
   listed:
   - We compute a **canonical hash** of the Grade JSON (RFC 8785 JSON
     canonicalisation — same JSON always hashes to the same value).
   - We sign that hash with the platform's **Ed25519 private key** (in KMS).
   - We append the event to the item's **hash chain** — every new lifecycle
     event (graded → repaired → relisted → resold → re-graded) stores the
     hash of the previous event. Tamper-evident without blockchain.
   - We render a **QR code** (`qrcode` npm package) that points to a public
     verification URL. Anyone scanning sees the full grade rationale, photos,
     condition lane, hash chain, and a "verified ✓" badge if signature checks
     out.
   - We **frame it as DPP-ready** — the EU Digital Product Passport hook is
     legitimate (battery passport mandatory Feb 2027 under EU 2023/1542;
     textiles ~2027–2028). Honest "DPP-ready," not "DPP-compliant."

5. **Multi-life Health Card.** If a resold item gets returned again or
   listed again, we **append** to the existing Health Card chain instead of
   creating a new one. The artefact spans owners — a true second-life
   passport. This is the "future vision" feature from the problem statement,
   delivered cheaply.

**Done means:** A graded item gets a polished AI-generated listing on the
resale storefront, every listing has a scannable QR, scanning the QR shows a
verifiable, signed condition record with full history.

---

## Phase 6 — Demand Registry & Hyperlocal Matching

**Goal:** Make Rahul's "50 parents within 5km want this" moment real.

**What we build:**

1. **`wants` collection** in MongoDB:
   `{user_id, product_category_or_sku, geo_point, max_grade, max_price, notify_on_match, created_at}`.
   With a `2dsphere` index on `geo_point`.

2. **"Wants" capture surfaces.** Two ways to register demand:
   - Explicit: a "Notify me when available" button on out-of-stock or
     resale-relevant product pages.
   - Implicit: when a user searches for a category and there's no match —
     prompt them to register a want. Captures latent demand cheaply.

3. **Geospatial query.** Driven by `$geoNear` aggregation. Two directions:
   - **Routing-engine direction:** "Given this listed item at this location,
     how many wants exist within R kilometres? What's the nearest cluster?"
     This drives the demand factor in the routing score, *and* picks the
     warehouse to ship to.
   - **Lister-facing UX:** "Your item matches 50 nearby buyers" shown the
     instant a sell-used flow completes grading. The single biggest emotional
     moment in the Rahul demo.

4. **Notify-on-match worker.** When an item lists or moves, find every
   matching want within radius and ping them (in-app + email; SMS / WhatsApp
   stretch).

5. **Cross-city matching (stretch).** Only triggered if no nearby demand
   cluster exists — then widen the radius to city-level, factoring shipping
   cost. Implements the "future vision" cross-city matching at low cost.

**Done means:** Every listed item knows its demand neighbourhood; matching
buyers get notified; the routing engine uses the count as a real input.

---

## Phase 7 — Prevention Layer (Return Probability + Fit Recommendations)

**Goal:** "The most sustainable return is the one that never happens." Two
features, both pre-purchase, both running on the existing PDP.

**What we build:**

1. **Return-probability model.** Standard XGBoost binary classifier, trained
   *offline* on a Kaggle returns dataset (Misra ModCloth/RentTheRunway is the
   strongest feasible choice; synthetic-Kaggle as a fallback). Features: order
   value, category, discount %, payment method (especially COD-vs-prepaid for
   the India angle), customer history, basket composition. Target real-world
   AUC 0.72–0.75 — claim it honestly. The trained model ships as a `.joblib`
   file inside the FastAPI service; Express calls a `/predict-return` endpoint
   with a serialised cart at checkout.

2. **What we do with the prediction.**
   - **High-risk warning at checkout:** "8 of 10 customers with similar
     baskets returned this combination — try size up?" Cheap CTA to reconfigure
     the basket.
   - **Cooling-off hold for impulse purchases:** If risk is very high *and*
     trust profile is "Standard" or below, refund happens 24–48h after the
     return is graded instead of instantly. Reduces frivolous returns without
     punishing genuine users (their tier already gets instant refund).
   - **Bracketing detection at cart time:** If the basket already contains
     multi-size of the same SKU, surface the fit recommendation aggressively
     and offer to reduce the basket.

3. **Size / fit recommendations.** Simple KNN over the Misra fit dataset:
   given the user's measurement profile (collected once, gently), find similar
   profiles for this brand+category and surface the modal "just right" size.
   Surfaced as a one-liner on the PDP: *"82% of customers with your
   measurements rated size 8 'just right' for this brand."* No deep learning,
   no GPU, no training — just a group-by query.

4. **Brand-side defects feedback.** When return reasons concentrate on a SKU
   ("runs tight across shoulders" comes up repeatedly), surface that to the
   seller dashboard — Amazon's "Fit Insights" feature, lighter weight. We
   compute it nightly with a simple aggregation; an LLM summarises the cluster
   into one sentence for the seller.

**Done means:** The PDP shows a fit recommendation, checkout shows a return-
risk nudge for risky baskets, and the seller dashboard shows aggregated
return-reason clusters per SKU.

---

## Phase 8 — Sustainability, Green Credits & Donation Routing

**Goal:** Make the ecological story tangible to every user. Trivial to
compute, huge narrative payoff.

**What we build:**

1. **CO2 + water-saved factor table.** Per category, hardcoded from credible
   sources cited in Claude SOLUTION (WRAP, UPC/INTEXTER 25 kg CO2/kg clothing,
   2,700L per cotton T-shirt). Each factor cites its source — we don't fudge.
   "Estimated, not audited LCA" disclaimer everywhere.

2. **Per-disposition computation.** Every routing decision computes the
   estimated CO2 / water saved vs the counterfactual (manufacture-new) and
   writes it into the lifecycle event log. Donation paths credit the sender;
   resale paths credit both parties.

3. **Two visible counters.**
   - **User-level:** "You've saved 4.2 kg CO2 this year." Lives in the
     account dashboard. Drives the Green Credits ledger.
   - **Platform-level:** Live ticker on the homepage for the demo. Sums every
     completed disposition.

4. **Green Credits ledger.** A simple wallet-style table:
   `{user_id, credits_earned, credits_spent, ledger_entries[]}`. Earnings
   triggered on routing decisions (donate > resell > refurbish > liquidate
   in credit weight). Credits redeemable as a checkout discount on new
   purchases — ties the circular economy back into the linear one and creates
   the engagement loop the research calls for.

5. **Donation routing path completion.** When the routing engine picks
   "donate," do the heavy lifting:
   - **NGO directory** (seeded for two demo cities) with categories accepted,
     pickup radius, contact info.
   - **Match the item to the nearest NGO** that accepts the category.
   - **Auto-generate a tax-receipt PDF** with the user's name, item, estimated
     fair-market value, NGO details, signed by the platform Ed25519 key (same
     key as Health Cards — one trust artefact, two uses).
   - Schedule the pickup (mocked for demo).

**Done means:** Every disposition produces a CO2 number; users see their
counter grow; donations issue real-looking tax receipts; the running platform
counter is demoable.

---

## Phase 9 — Demo Polish, Persona Scripting & Cross-Cutting Concerns

**Goal:** Make the four personas play through the system end-to-end without
manual intervention. Hide every rough edge.

**What we do:**

1. **The four persona scripts** must run cleanly end-to-end:
   - **Priya (₹500 worn shoes, returns):** Initiate return → Pass 1 form →
     uploads → Grade C with worn-soles → reverse-logistics calc shows
     uneconomical → routing recommends donate → NGO match → tax receipt PDF
     → CO2 counter ticks up → Green Credits awarded.
   - **Rahul (used baby monitor, returns or sell-used):** Initiate (either
     path) → Grade B → demand registry shows "50 parents within 5 km" →
     route to nearest demand-cluster warehouse → AI listing generated →
     Health Card QR issued → one nearby parent gets a notification.
   - **Anjali (DSLR, sell-used):** Pick from past order → Grade A → routing
     finds high city demand → polished AI listing with suggested price →
     locker drop simulated → buyer purchases via the storefront with the same
     UX as a normal Amazon order → Health Card on the buyer's side.
   - **Small seller (200 returns/month, batch):** Bulk dashboard → every
     return auto-graded and routed → recovery-value summary across the batch
     → seller-policy panel that visibly drives different routing outcomes →
     B2B-API framing (one screen showing the same workflow as an API).

2. **Trust-tier demos.** A second Priya — same return, but on a "Watch" tier
   account because we synthesised abuse history. The demo visibly diverges:
   weight verification required, refund delayed, additional evidence fields
   appear. Shows the trust layer doing real work.

3. **Cross-cutting hardening:**
   - **Observability:** CloudWatch logs for every pipeline call; one
     CloudWatch dashboard the team keeps open during demo for confidence.
   - **Error states:** every stage (Pass 1, Pass 2, routing, listing-gen) has
     a graceful fallback. Bedrock down → cached schema or text-only fallback.
     Rekognition down → grade-with-warning. Nothing crashes the demo.
   - **Security:** all AWS keys in Secrets Manager / KMS, never in repo. The
     Ed25519 *private* key never leaves KMS. Image uploads via pre-signed S3
     URLs only.
   - **Performance:** any path that calls Bedrock returns *something* in
     under 5s — either by cache hit (Pass 1) or by streaming the response
     (Pass 2 listing copy). User never stares at a spinner.

4. **Seed everything deterministically.** One command rebuilds the demo state
   from scratch in under 60s. The team must be able to "reset and redo" mid-
   pitch if something goes wrong.

5. **Failure-mode rehearsal.** Run the demo with the network throttled and
   with one AWS service stubbed-out at a time. Catch the rough edges before
   the judges do.

**Done means:** All four persona stories play end-to-end on a fresh laptop
in under five minutes, every time.

---

## Cross-Phase Notes

**Things to consciously NOT do.**
- No real blockchain. Ed25519 + hash chain achieves the demo trust story at
  zero infra cost. Mention blockchain only as a roadmap item if asked.
- No custom-trained vision model. Rekognition Label Detection covers the
  "general defect" need without training data. Optional YOLOv8 stretch only
  if a team member has bandwidth and just for a single bounding-box flourish.
- No real escrow / KYC / payments. Assume platform-mediated; demo flows show
  refund and payout events without actually moving money.
- No real WhatsApp production integration. Twilio sandbox or screen recording.
- No live weight scales. Mock the weight-verification event in the locker
  drop simulation — it's the *signal*, not the hardware, that matters here.

**Honest caveats for the pitch.**
- Vision-LLM grading is probabilistic, not a calibrated industrial inspection.
  Pitch as "AI-assisted grading" with human review on low-confidence cases.
- Return-prediction AUC ceiling is real; quote 0.72–0.75 honestly.
- Crypto signatures verify the *digital record*, not the physical product —
  a determined fraudster can attach a valid QR to a fake item. Combine with
  the trust score and the photo evidence to mitigate; mention the limitation
  if pressed. (This is identical to blockchain DPPs, by the way — same
  limitation, no infrastructure cost.)
- CO2-savings figures are estimates with cited sources, not audited LCAs.

**One-paragraph elevator pitch the build maps to.**
Every returned, unused, or outgrown item enters one pipeline. AI grades it
objectively. A trust score decides whether the customer needs friction or
deserves trust. A transparent routing engine picks the path that actually
makes economic and ecological sense — donate Priya's shoes, ship Rahul's
baby monitor across town to a nearby parent, list Anjali's DSLR with a
verified Health Card. Every disposition leaves a tamper-evident trail and a
CO2 number. Sellers automate at scale via the same engine. The platform
behaves like Amazon's existing system on the linear path and like Relove
plus a fraud-aware Cashify on the circular one — without any of them.
