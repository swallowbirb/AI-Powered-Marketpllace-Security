# Phase 7 — Prevention Intelligence Layer — DETAILED Implementation Guide

> The build-level reference for the prevention layer. Prevention is **the highest-leverage
> layer in the whole system** — "the most sustainable return is the one that never happens."
> This document gives every file to touch, the exact scorecard math, the intervention
> decision table, endpoint contracts, the fit-mining lexicon, worked examples, the seed plan,
> the cost/storage budget, and the test matrix. Follow it top-to-bottom and Phase 7 is done.
>
> Companion to the Phase 7 section of `ImplementationPlan.md` (the plan). This is the build doc.

---

## Hackathon Scope (read this before anything else)

**The explainable scorecard IS the risk engine. There is no ML model and no ML-service
involvement in Phase 7.** An earlier draft trained a LightGBM model on synthetic data — we
cut it, on purpose:

- We have **no real return labels** yet (new platform), so any model would have to train on
  data we invent. We'd invent that data *using the scorecard's own formula* → the model would
  just re-learn the scorecard, adding training cost, a model artifact, calibration, and a
  cross-service round-trip **without adding any signal**. That is not worth it for a hackathon.
- The scorecard is a **pure function** (same proven pattern as Phase 3's `trust.scoring.js`):
  known signals, known weights, instant to run, trivially testable, and trustworthy *because*
  every number is explainable on the nudge.
- It still **self-improves**: the nightly RIKB recompute means the return rates, fit verdicts,
  and complaint clusters the scorecard reads get sharper as real returns accumulate — no
  retraining required.

**The ML model is a documented roadmap step**, not a hackathon deliverable (see §5). The
feature vector is designed so that, once we have real labels, training a model is a clean
drop-in later.

**What this changes vs the old draft:** Phase 7 is now a **backend + frontend** module only.
It does **not** touch `ml-service/` — no `return_risk.py`, no `fit_intel.py`, no `training/`,
no model artifacts, and the `prediction.py` stubs stay as they are. The scorecard, fit
sentence, and intervention logic all run as pure JS in the backend.

**Component feasibility at a glance:**

| Component | Status | Why |
|---|---|---|
| RIKB (`returnInsights`) + nightly recompute | **Core** | The data asset; one aggregate doc/SKU |
| Fit-mining lexicon (keyword counts) | **Core** | No NLP model; plain string matching |
| Return-risk scorecard (pure JS) | **Core** | The engine; instant, explainable |
| Intervention engine (pure JS) | **Core** | Where prevention earns its keep |
| `<FitReturnNote>` (PDP) + `<ReturnRiskNudge>` (checkout) | **Core** | The two demo surfaces |
| Seed (`seed-prevention.js`) | **Core** | Day-1 demo signal |
| Seller summary (nightly Bedrock, cached) | **Optional** | Dashboard works on structured data without it |
| `<BracketingNudge>` + `<ReturnInsightsPanel>` | **Optional** | Nice-to-have; bracketing needs a client cart (§15.2) |
| Trained ML model (LightGBM) | **Deferred** | Post-hackathon; needs real labels (§5) |

---

## 0. Why This Is a Redesign (read first — it explains every later decision)

The original Phase 7 was "an XGBoost trained on the Kaggle Misra ModCloth/RentTheRunway
dataset + a KNN fit recommender over body measurements." **Both are infeasible on our actual
schema, and we should not pretend otherwise:**

| Original assumption | Reality in this codebase | Consequence |
|---|---|---|
| Features: order value, **discount %**, **COD-vs-prepaid**, **basket composition** | `order.model.js` has only `productId, quantity, totalPrice, status, paymentDetails.mockCreditCard` — no discount, no payment type, single-item orders | A foreign-trained model's feature space doesn't map to ours |
| Fit KNN over **user body measurements** | No measurement profile exists anywhere on `user.model.js`; we never collect one | The KNN has no query vector |
| **Size variants** per SKU | `product.model.js` has no size/variant field | "bought 3 sizes" can't be read literally |
| Train on a foreign dataset | Different catalog, different population | Predictions are theatre, not signal |

**What we DO have, and will build on instead:**

- `returns` — a clean `reasonCode` enum (`defective | not_as_described | changed_mind |
  wrong_item | other`) **plus free-text `reasonText`**, snapshotted `productCategory`,
  `originalProductId`, `orderTotal`. This is gold.
- `reviews` — `rating` + free-text `text` we can mine for fit/quality language.
- `orders` — purchase history per buyer (kept vs returned is derivable by joining returns).
- `products` — `category`, `price`, `condition`, `brandName/brandId`, `averageRating`,
  `reviewCount`, `totalSales`.
- **Phase 3 trust profiles** — already compute `returnRate`, `recentReturnRate90d`,
  `bracketingFlag`, `wardrobingFlag`, `tier`. Prevention **consumes** these; it never
  recomputes user risk.

**The redesign:** a **closed-loop Prevention Intelligence layer** that turns our own
return/review/order stream into a growing knowledge base, scores risk with a transparent
**explainable scorecard**, and intervenes with friction sized to the buyer's trust tier —
all at near-zero marginal cost. Every return makes the next purchase smarter. That loop,
on our own data, is the moat — and it's *more* honest than a foreign-data model, not less.
(An ML model on real labels is a deliberate post-hackathon step — see "Hackathon Scope" and §5.)

---

## 1. Ground Rules (module boundaries)

**Folders / files I MUST NOT touch (other phases own them):**
- `backend/src/modules/trust/**` (P3 — I only **call** `getTrustProfile(userId)`)
- `backend/src/modules/grading/**`, `routing/**`, `returns/**`, `secondhand/**`, `items/**`
  (read-only where I need data; never write)
- `backend/src/modules/orders/order.service.js` — I add a **non-blocking hook**, I do not
  rewrite the order flow (see §9.2 for the surgical seam)
- `backend/seed.js` (base seed — I ship a separate additive `seed-prevention.js`)
- The Phase 2 grading pipeline in `ml-service/app/services/**` (untouched)

**Files / folders I OWN and will create (backend + frontend only):**
- `backend/src/modules/prevention/` — the whole module (model, service, scoring,
  intervention, controller, routes, validation, job, fit helper)
- `backend/src/contracts/prevention.contract.js` — canonical constants
- `backend/seed-prevention.js` — additive demo seed
- `frontend/src/services/prevention.service.js` + a handful of self-contained components

**`ml-service/` is NOT touched by Phase 7.** No `return_risk.py`, no `fit_intel.py`, no
`training/`, no model artifacts; the `prediction.py` stubs stay as they are. The scorecard,
fit-sentence composition, and intervention logic all run as pure JS in the backend (§4, §6,
§8). This removes a whole cross-service integration surface — a deliberate feasibility win.

**Frozen interfaces I depend on (do not change them; mock if not merged yet):**
1. **P3:** `require('../trust/trust.service').getTrustProfile(userId)` →
   `{ tier, score, returnRate, recentReturnRate90d, bracketingFlag, wardrobingFlag,
   lifetimePurchases, lifetimeReturns, accountAge, signals[] }` or `null`.
   Tiers: `verified | trusted | standard | watch | restricted`.
2. **Returns:** `return.model.js` fields above. Read-only.

**Writes:** Phase 7 writes ONLY to the `returnInsights` collection (+ its own seed rows).
Refund-timing is **exposed as a pure function** for returns/routing to consume — Phase 7
does not write refund state itself (boundary respect, §8.4).

---

## 2. Architecture of the Prevention Module

```
                         PRE-PURCHASE (per request — cheap, deterministic)
   PDP load ───────────────► GET /api/prevention/product/:productId
                                      │  reads RIKB (1 indexed find) + buyer's own kept-history
                                      ▼
                              { fitVerdict, returnNote, personalizedHint }

   Buy Now / cart ─────────► POST /api/prevention/checkout-risk   { items[], userId }
        │                             │ 1. gather features (RIKB per item + trust profile)
        │                             │ 2. scorecard(features)  ──► riskScore + band + reasons (PURE JS)
        │                             │ 3. decideIntervention(band × tier × context)  (PURE JS)
        │                             ▼
        │                     { riskBand, riskScore, topReasons[], intervention, refundTiming }
        │                     (no network hop — all in-process arithmetic)
        │
   Seller dashboard ───────► GET /api/prevention/seller/insights  (their SKUs from RIKB)

─────────────────────────────────────────────────────────────────────────────────────
                         NIGHTLY (batch — the closed loop; LLM here only)
   cron / npm run prevention:recompute ──► prevention.job.recomputeReturnInsights()
        • aggregate returns + reviews + orders  ──►  upsert returnInsights (one doc/SKU)
        • mine fit signal (lexicon over reasonText + review text)
        • ONE Bedrock call per significant complaint cluster → cached seller summary
```

**Everything runs in the backend.** Mongo lives in the backend; the scorecard and
intervention logic are pure JS that read RIKB docs + the Phase 3 trust profile and return a
score, reasons, and an intervention. There is no call to the ML service — risk scoring is
arithmetic, so a network hop would only add latency and a failure mode for nothing.

**Why mirror Phase 3's pattern.** `prevention.scoring.js` (the scorecard) and
`prevention.intervention.js` (the decision table) are **pure functions** — inputs → outputs,
no I/O. Same discipline as `trust.scoring.js`: trivially unit-testable against the worked
examples in §4.3/§12, and safe to retune because every weight is in one place.

---

## 3. The Data Asset — `returnInsights` (RIKB)

### 3.1 `returnInsight.model.js` (NEW — collection `returnInsights`)

One compact aggregate per product, plus `(brand, category)`-level rollup docs for cold
items. **Bounded storage:** ~0.5 KB/doc → 1,000 SKUs ≈ 0.5 MB on a 512 MB M0. We store
aggregates, never raw events.

```js
const mongoose = require('mongoose');

const FIT_VERDICTS = ['runs_small', 'true_to_size', 'runs_large', 'unknown'];

const returnInsightSchema = new mongoose.Schema({
  // Scope: either a specific product, or a category-level rollup (productId null)
  productId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null, index: true },
  brandName:  { type: String, default: null },
  category:   { type: String, index: true },          // always set (for cold-start backoff)

  unitsSold:     { type: Number, default: 0 },
  unitsReturned: { type: Number, default: 0 },
  returnRate:    { type: Number, default: 0 },         // unitsReturned / max(unitsSold,1)

  // histogram over return.reasonCode
  reasonHistogram: {
    defective:        { type: Number, default: 0 },
    not_as_described: { type: Number, default: 0 },
    changed_mind:     { type: Number, default: 0 },
    wrong_item:       { type: Number, default: 0 },
    other:            { type: Number, default: 0 },
  },
  dominantReason: { type: String, default: null },

  // mined fit signal (no body measurements involved)
  fitSignal: {
    verdict:     { type: String, enum: FIT_VERDICTS, default: 'unknown' },
    smallMentions: { type: Number, default: 0 },
    largeMentions: { type: Number, default: 0 },
    sampleSize:    { type: Number, default: 0 },       // total fit-relevant texts scanned
    confidence:    { type: Number, default: 0 },       // 0..1
  },

  topComplaints: { type: [String], default: [] },      // short extracted phrases (cap 5)
  sellerSummary: { type: String, default: null },      // ONE nightly LLM sentence (cached)

  scope: { type: String, enum: ['product', 'category'], default: 'product', index: true },
  lastComputed: { type: Date, default: Date.now },
}, { timestamps: true });

// fast PDP lookup + cold-start backoff
returnInsightSchema.index({ productId: 1 });
returnInsightSchema.index({ scope: 1, category: 1 });

module.exports = mongoose.model('ReturnInsight', returnInsightSchema);
```

### 3.2 Cold-start category priors (in `prevention.contract.js`)

When a SKU has fewer than `MIN_SALES_FOR_OWN_RATE` (default 5) sales, back off to the
category rollup; if even that is thin, use a seeded prior. Each prior cites a public source
in a comment — "estimated, not audited."

```js
// Estimated category return-rate priors (sources cited in comments; clearly labelled estimates)
const CATEGORY_RETURN_PRIORS = {
  apparel:     0.28,   // online apparel returns widely reported ~25–30%
  clothing:    0.28,
  footwear:    0.20,   // shoes ~18–22% (fit-driven)
  shoes:       0.20,
  electronics: 0.08,
  home:        0.10,
  kitchen:     0.10,
  beauty:      0.06,
  cosmetics:   0.06,
  toys:        0.10,
  baby:        0.10,
  books:       0.04,
  media:       0.04,
  default:     0.12,
};
```

### 3.3 Fit-mining lexicon (in `prevention.contract.js`)

A tiny, transparent keyword lexicon — no NLP model needed. Run over `reasonText` (returns)
and `text` (reviews). Weight a mention more when it co-occurs with a fit-relevant reason
(`changed_mind`, `not_as_described`) and less for `defective` (defects aren't fit).

```js
const FIT_LEXICON = {
  small: ['too tight', 'runs small', 'size up', 'snug', 'tight', 'narrow', 'cramped', 'smaller than'],
  large: ['too big', 'runs large', 'size down', 'loose', 'baggy', 'roomy', 'oversized', 'larger than'],
};
const FIT_MIN_MENTIONS = 3;          // need ≥3 fit mentions before we claim a verdict
const FIT_VERDICT_MARGIN = 1.5;      // dominant side must be ≥1.5× the other to call it
```

**Verdict rule:** count `small` vs `large` mentions across the SKU's return/review text.
If `total < FIT_MIN_MENTIONS` → `unknown`. Else if `small ≥ large*MARGIN` → `runs_small`;
if `large ≥ small*MARGIN` → `runs_large`; else `true_to_size`. `confidence =
min(total / 10, 1) * |small−large| / max(small+large,1)`.

### 3.4 The nightly aggregation — `prevention.job.recomputeReturnInsights()`

Pure batch, idempotent, re-runnable. This is the **closed loop**.

```
for each productId that has ANY order OR return:
  unitsSold     = Order.countDocuments({ productId, status: 'completed' })
  returnsForSku = Return.find({ originalProductId: productId }).select('reasonCode reasonText')
  unitsReturned = returnsForSku.length
  returnRate    = unitsReturned / max(unitsSold, 1)
  reasonHistogram = tally reasonCode over returnsForSku
  dominantReason  = argmax(reasonHistogram)

  texts = [...returnsForSku.reasonText, ...Review.find({productId}).text]   // mine fit
  fitSignal = mineFit(texts)                                                // §3.3

  topComplaints = top-5 frequent short phrases from texts (simple n-gram tally)
  upsert returnInsights { productId, category, brandName, scope:'product', ... , lastComputed:now }

# category rollups for cold-start backoff
for each category:
  aggregate product docs in that category → upsert { productId:null, scope:'category', category, ... }

# seller summaries — OPTIONAL (polish item O1). LLM, BATCHED + CACHED (only for SKUs above a
# return-rate/volume threshold, and only if the complaint cluster changed since last run)
for each product doc with returnRate >= 0.15 AND unitsReturned >= 3 AND clusterChanged:
  sellerSummary = await bedrockSummariseCluster(topComplaints, dominantReason)   // 1 call
  save on the product's returnInsights doc
```

> **Cost rule (non-negotiable):** the optional LLM summary is touched ONLY here, ONLY for SKUs
> that cross a volume/return threshold, ONLY when the cluster changed. Everything the
> PDP/checkout reads at request time is precomputed and contains **no** LLM call. A nightly run
> on the demo catalog is a handful of calls — and if O1 is skipped, the LLM is never called at
> all and `sellerSummary` simply stays null (the dashboard renders the structured fields).

> **Simplification:** `topComplaints` can be a plain frequency tally of short `reasonText`
> snippets — no NLP needed. The n-gram phrasing is a nicety, not a requirement.

**Trigger:** `npm run prevention:recompute` (root script → `node backend/seed-prevention.js
--recompute` or a dedicated runner) and a dev/admin endpoint `POST /api/prevention/recompute`.
For the demo, run it after seeding; in prod it's a nightly cron. No streaming, no per-write
recompute.

---

## 4. The Return-Risk Scorecard (PURE — exact math)

Risk is a **0–100 score where 100 = maximum return risk** (opposite polarity to the trust
score, where 100 = good — keep this straight). **This scorecard is the entire risk engine
for the hackathon** — there is no model behind it. It produces the score, the band, and the
top-3 human-readable reasons. A displayed "return probability," when we want one, is just
`riskScore / 100` (honestly labelled as a heuristic estimate, not a calibrated model output).

### 4.1 Signals, weights, normalisation (weights sum to 1.00)

| Signal | Weight | Source | Normalised to 100 (max risk) when… |
|---|---|---|---|
| `PRODUCT_RETURN_RATE` | 0.28 | RIKB sku rate (backoff to category) | sku returnRate ≥ 0.40 |
| `FIT_MISMATCH` | 0.20 | RIKB fitSignal + category + buyer action | apparel/footwear & verdict≠true_to_size & buyer didn't act on it |
| `USER_RETURN_BEHAVIOUR` | 0.20 | Phase 3 trust profile | high personal returnRate / recent90d / risky tier |
| `CATEGORY_PRIOR` | 0.12 | `CATEGORY_RETURN_PRIORS` | high-return category (apparel/footwear) |
| `BRACKETING_INTENT` | 0.12 | checkout intent + trust.bracketingFlag | basket has dup SKU/category, or historical bracketer |
| `PRICE_BAND` | 0.04 | `product.price` | mid "try-and-see" band |
| `REVIEW_SENTIMENT_GAP` | 0.04 | `product.averageRating` + RIKB | low rating with enough reviews + complaints |

```
productReturnRateScore = min(skuRate / 0.40, 1) * 100
        where skuRate = (unitsSold >= 5) ? sku.returnRate : categoryPrior

categoryPriorScore     = min(categoryPrior / 0.30, 1) * 100      // apparel .28→93, electronics .08→27

fitMismatchScore       = (category ∈ {apparel,clothing,footwear,shoes}
                          && verdict ∈ {runs_small,runs_large}
                          && !buyerActedOnFit)
                          ? fitSignal.confidence * 100 : 0
        // buyerActedOnFit is true if the client passes sizeAdjusted=true (user took the advice)

userReturnBehaviourScore = 0.6*min(returnRate/0.40,1)*100 + 0.4*min(recent90d/0.50,1)*100
        // then FLOOR by tier (the tier already encodes risk):
        if tier == 'restricted' → max(score, 90)
        if tier == 'watch'      → max(score, 60)
        if tier ∈ {verified}    → min(score, 20)    // genuine users capped LOW

bracketingScore        = (intentHasDuplicateSku || intentHasMultiVariantSameCategory) ? 100
                         : (trust.bracketingFlag ? 60 : 0)

priceBandScore         = piecewise(price):  <P10 → 20,  P10–P60 → 100,  P60–P200 → 60,  >P200 → 30
        // mid-band "I'll just try it" is riskiest; cheap & premium less so. (Use ₹ or $ bands per catalog.)

reviewSentimentGapScore= (reviewCount >= 5 && rating < 3.5) ? ((3.5-rating)/2.5)*100 : 0
```

> Edge cases: cold SKU (0 sales) → `productReturnRateScore` uses category prior, never NaN.
> Missing trust profile (new user) → `returnRate=recent90d=0`, tier treated as `standard`,
> so `userReturnBehaviourScore=0` (innocent until proven — mirrors Phase 3).

### 4.2 Weighted sum → band

```
riskScore = Σ (signalScore × weight)          // 0–100
band = riskScore > 65 ? 'high'
     : riskScore >= 35 ? 'medium'
     : 'low'
topReasons = top-3 signals by (signalScore × weight), rendered as human strings (§4.4)
```

### 4.3 Worked examples (bake these into tests)

**Priya — ₹500 footwear, SKU runs small, she's a VERIFIED loyal buyer, ordering her usual size.**

| Signal | Norm | ×W | Contribution |
|---|---|---|---|
| PRODUCT_RETURN_RATE (sku 0.30) | 75 | 0.28 | 21.0 |
| FIT_MISMATCH (footwear, runs_small, not adjusted, conf 0.8) | 80 | 0.20 | 16.0 |
| USER_RETURN_BEHAVIOUR (verified → capped 20) | 20 | 0.20 | 4.0 |
| CATEGORY_PRIOR (footwear .20) | 67 | 0.12 | 8.0 |
| BRACKETING_INTENT (none) | 0 | 0.12 | 0.0 |
| PRICE_BAND (mid) | 100 | 0.04 | 4.0 |
| REVIEW_SENTIMENT_GAP (fine) | 0 | 0.04 | 0.0 |
| **riskScore** | | | **53 → medium** |

→ band **medium**, top reason **FIT_MISMATCH**. Intervention = **fit nudge "size up"** — a
*helpful* nudge, **no refund delay** (verified). This is the showcase: risk ≠ punishment.
A great customer still gets a useful heads-up that prevents the return.

**Rahul — mid-range electronics, trusted user, healthy SKU.**

PRODUCT_RETURN_RATE (sku .06→15) , FIT_MISMATCH 0 (electronics), CATEGORY_PRIOR (.08→27),
USER low. **riskScore ≈ 14 → low.** No nudge. Frictionless.

**Bracketer — apparel, cart has 3 of the same SKU, standard tier, historical bracketingFlag.**

BRACKETING_INTENT 100×0.12=12, FIT_MISMATCH high, PRODUCT_RETURN_RATE high (apparel),
USER_RETURN_BEHAVIOUR elevated. **riskScore ≈ 78 → high.** Intervention = **bracketing
interception** ("keep the recommended size, skip the extras") **+ cooling-off refund timing**
(standard tier → delayed). Verified users in the same basket would NOT get the delay.

### 4.4 Reason strings (human-readable, for the nudge)

```
PRODUCT_RETURN_RATE → "About {pct}% of these are returned"
FIT_MISMATCH        → "Tends to run {small|large} — most returns cite {tightness|looseness}"
USER_RETURN_BEHAVIOUR→ "Your recent returns are higher than usual"   (only shown for watch/restricted)
CATEGORY_PRIOR      → "{Category} items are returned more often than average"
BRACKETING_INTENT   → "You've added multiple of the same item"
REVIEW_SENTIMENT_GAP→ "Recent reviews mention quality concerns"
```

> Tone rule: never accusatory. For genuine users the nudge is framed as *help* ("size up?"),
> never as suspicion. Suspicion-flavoured reasons (`USER_RETURN_BEHAVIOUR`) are surfaced only
> for `watch`/`restricted`, and even then drive *timing*, not a block.

---

## 5. The ML Model — Deliberately Deferred (roadmap, not a deliverable)

**We are NOT training a model for the hackathon.** This section exists to (a) record *why*,
so nobody re-adds it under time pressure, and (b) document the clean upgrade path so reviewers
see the scorecard is model-ready, not a dead end.

### 5.1 Why we cut it

A model needs labelled examples (`features → returned: yes/no`). We have **zero real return
labels** (new platform). The only way to get a training set today is to **invent** one — and
we'd have to invent the labels using a formula, which would be… the scorecard's formula. So
the model would spend its training budget **re-learning the scorecard we already wrote**, then
emit a number that looks more "ML" but carries no extra information. In exchange we'd pay for:

- a synthetic-data generator + training + calibration script to build and maintain,
- a model artifact, `scikit-learn`/`lightgbm` deps, and a `trained_models/` payload,
- a backend↔ML-service round-trip on the checkout path (latency + a new failure mode),
- and a credibility risk — quoting an "AUC" off self-generated data invites exactly the
  "isn't that circular?" question you don't want in a demo.

**Verdict: not worth it.** The scorecard is faster to build, faster to run, fully
explainable, and honest. Cut.

### 5.2 The upgrade path (post-hackathon, when real labels exist)

The scorecard's feature set is intentionally a clean **feature vector** so a model is a
drop-in later. The target spec for that day:

```
features = [ product_return_rate, category_prior, price_band_ordinal, condition_used,
             user_return_rate, user_recent90d, user_tier_ordinal, first_time_category,
             fit_mismatch, bracketing_intent, review_rating, review_count_log ]
tier_ordinal = { verified:0, trusted:1, standard:2, watch:3, restricted:4 }
```

When the platform has accumulated enough **real** completed returns (rule of thumb: a few
hundred labelled events with both outcomes represented):

1. Export `(feature_vector, returned)` rows from our own orders/returns history.
2. Train a small CPU model (LightGBM is a fine choice — tiny artifact, no GPU) and calibrate
   it (`CalibratedClassifierCV`, isotonic) so the displayed probability is honest.
3. Serve it from the ML service behind a `/predict/return` endpoint, and have the backend call
   it **with the scorecard as the automatic fallback** when the model is cold/unavailable.

Nothing above is hackathon work. The scorecard ships now; the model is a future PR that reuses
the same feature definitions. **Do not build §5.2 for the demo.**

---

## 6. Fit Intelligence — `backend/src/modules/prevention/prevention.fit.js` (PURE JS)

No body measurements, no ML service. Input is the SKU's mined `fitSignal` (already stored in
RIKB by the nightly job, §3.3) + the buyer's *own* kept-brand history. Output is an honest
sentence + a `suggestedAction` the intervention engine consumes. Pure function → unit-tested.

```js
function recommendFit(fitSignal, category, keptBrandHistory = null) {
  const { verdict, confidence, smallMentions: small, largeMentions: large } = fitSignal || {};
  if (!FIT_CATEGORIES.includes(category) || !verdict || verdict === 'unknown') {
    return { verdict: 'unknown', message: null, confidence: 0, suggestedAction: null };
  }
  let message, suggestedAction;
  if (verdict === 'runs_small') {
    const pct = Math.round((small / Math.max(small + large, 1)) * 100);
    message = `Runs small — ${pct}% of shoppers who returned this said it was too tight. Consider sizing up.`;
    suggestedAction = 'SIZE_UP';
  } else if (verdict === 'runs_large') {
    message = 'Runs large — most returns cite it being too loose. Consider sizing down.';
    suggestedAction = 'SIZE_DOWN';
  } else {
    message = 'Sizing looks true to size for most shoppers.';
    suggestedAction = null;
  }
  // personalization from OUR data (no measurements):
  if (keptBrandHistory) {  // e.g. { brand: 'Nike', size: 'M' }
    message += ` You took ${keptBrandHistory.size} in ${keptBrandHistory.brand} and kept it.`;
  }
  return { verdict, message, confidence: confidence ?? 0, suggestedAction };
}
module.exports = { recommendFit };
```

The service (§8.2) supplies `keptBrandHistory` by checking the buyer's past orders in the same
`brandName`+`category` that have **no** matching return (`Return.originalProductId`).

---

## 7. Backend Contract — `backend/src/contracts/prevention.contract.js`

```js
const RISK_BANDS = ['low', 'medium', 'high'];

const INTERVENTION_TYPES = [
  'NONE',               // low risk → nothing
  'FIT_NUDGE',          // PDP/checkout: size up/down
  'INFO_NUDGE',         // "commonly returned for X — check Y"
  'BRACKETING_NUDGE',   // multi-buy → drop extras
  'COOLING_OFF',        // delay refund post-grade (timing only, never a block)
  'CONFIDENCE_BOOST',   // inverse prevention for genuine users
];

const REFUND_TIMING = { INSTANT: 'instant', DELAYED: 'delayed' };
const COOLING_OFF_HOURS = 36;     // 24–48h window midpoint

// reused from returns module — keep in sync, don't redefine the enum source of truth
const RETURN_REASON_CODES = ['defective','not_as_described','changed_mind','wrong_item','other'];

const FIT_CATEGORIES = ['apparel','clothing','footwear','shoes'];

// + CATEGORY_RETURN_PRIORS, FIT_LEXICON, FIT_VERDICTS, FIT_MIN_MENTIONS, FIT_VERDICT_MARGIN (§3)

module.exports = { RISK_BANDS, INTERVENTION_TYPES, REFUND_TIMING, COOLING_OFF_HOURS,
  RETURN_REASON_CODES, FIT_CATEGORIES, CATEGORY_RETURN_PRIORS, FIT_LEXICON, FIT_VERDICTS,
  FIT_MIN_MENTIONS, FIT_VERDICT_MARGIN };
```

---

## 8. Backend Module — `backend/src/modules/prevention/`

### 8.1 `prevention.intervention.js` (PURE — the decision table, fully unit-testable)

Maps `(riskBand, trustTier, context)` → intervention object. No DB, no async. This is the
heart of "friction sized to the buyer."

```js
function decideIntervention({ riskBand, trustTier, fitSuggestedAction, bracketing, category }) {
  const genuine = trustTier === 'verified' || trustTier === 'trusted';

  // 1. bracketing always intercepts (any tier) — but framed as savings, not suspicion
  if (bracketing) return { type:'BRACKETING_NUDGE', refundTiming: genuine ? 'instant' : timing(riskBand,trustTier) };

  // 2. fit help whenever we have a concrete action (PDP + checkout) — pure help
  if (fitSuggestedAction) return { type:'FIT_NUDGE', action:fitSuggestedAction, refundTiming: timing(riskBand,trustTier) };

  // 3. otherwise band-driven
  if (riskBand === 'high')   return { type: genuine ? 'INFO_NUDGE' : 'INFO_NUDGE', refundTiming: timing(riskBand,trustTier) };
  if (riskBand === 'medium') return { type:'INFO_NUDGE', refundTiming:'instant' };
  // low + genuine → optionally a confidence boost (encourage single correct purchase)
  return { type: genuine ? 'CONFIDENCE_BOOST' : 'NONE', refundTiming:'instant' };
}

// refund TIMING only — never a block. Verified/trusted always instant.
function timing(riskBand, trustTier) {
  if (trustTier === 'verified' || trustTier === 'trusted') return 'instant';
  if (riskBand === 'high' && (trustTier === 'standard' || trustTier === 'watch' || trustTier === 'restricted'))
    return 'delayed';          // refund 24–48h AFTER grading clears
  return 'instant';
}
module.exports = { decideIntervention, timing };
```

### 8.2 `prevention.service.js` (DB I/O + orchestration)

```
getProductInsight(productId):
  doc = ReturnInsight.findOne({ productId }) || categoryBackoff(product.category)
  return { returnRate, dominantReason, fitSignal, topComplaints, returnNote, sellerSummary }

assessCheckoutRisk({ userId, items }):           // items: [{ productId, quantity, sizeAdjusted? }]
  trust = await trustService.getTrustProfile(userId)          // CONSUME P3, never recompute
  perItem = for each item:
      product  = Product.findById(item.productId).lean()
      insight  = await getProductInsight(item.productId)
      keptHist = await keptBrandHistory(userId, product)       // §6 personalization
      fit      = recommendFit(insight.fitSignal, product.category, keptHist)   // §6, pure JS
      sc       = scorecard(buildSignals(product, insight, trust, item, fit))   // §4, pure JS — THE engine
      intervention = decideIntervention({ riskBand: sc.band, trustTier: trust?.tier ?? 'standard',
                        fitSuggestedAction: fit.suggestedAction,
                        bracketing: detectBracketingIntent(items, item, trust),
                        category: product.category })
      return { productId, riskScore: sc.riskScore, riskBand: sc.band,
               topReasons: sc.topReasons, fit, intervention }
  basketRisk = max(perItem.riskBand)            // worst item drives basket-level messaging
  return { basketRisk, items: perItem, trustTier: trust?.tier ?? 'standard',
           refundTiming: worstRefundTiming(perItem) }

getSellerInsights(sellerId):
  skus = Product.find({ sellerId }).select('_id title category')
  return ReturnInsight.find({ productId: { $in: skus.ids } })  // returnRate, dominantReason, fitSignal, sellerSummary

getRefundTiming({ userId, productId, riskBand }):   // EXPOSED to returns/routing (boundary-safe)
  trust = await trustService.getTrustProfile(userId)
  return timing(riskBand, trust?.tier ?? 'standard')           // 'instant' | 'delayed' + hours
```

`detectBracketingIntent(items, item, trust)`: true if `items` contains the same `productId`
twice, OR ≥2 items share the same `category` with `quantity>1`, OR `trust.bracketingFlag`.

`scorecard(...)` lives in `prevention.scoring.js` as a **pure function** (the §4 math) and is
unit-tested against the §4.3 worked examples. It is the only risk computation — no model, no
network call, no fallback branch to maintain. `buildSignals(...)` is a small pure helper that
maps `(product, insight, trust, item, fit)` into the seven scorecard inputs of §4.1.

### 8.3 `prevention.controller.js` / `routes.js` / `validation.js`

| Method | Path | Auth | Body / Query | Returns |
|---|---|---|---|---|
| GET | `/api/prevention/health` | none | — | `{ module, status }` |
| GET | `/api/prevention/product/:productId` | none | — | `{ returnNote, fit, returnRate, dominantReason }` |
| POST | `/api/prevention/checkout-risk` | buyer | `{ items:[{productId,quantity,sizeAdjusted?}] }` | `{ basketRisk, items[], trustTier, refundTiming }` |
| GET | `/api/prevention/seller/insights` | seller | — | `{ items:[{ productId,title,returnRate,dominantReason,fitVerdict,sellerSummary }] }` |
| POST | `/api/prevention/recompute` | admin/dev | — | `{ updated: N }` (runs §3.4 job) |

`validation.js`: validate `productId` is an ObjectId; `items` non-empty array; `quantity≥1`.
Controllers are thin and use the Standard_Response envelope (`{ success, data }`) like the
rest of the repo.

### 8.4 The order-flow seam (surgical, non-blocking)

Do **not** rewrite `order.service.createOrder`. Prevention is **advisory pre-purchase**, so
the integration is a *frontend* call to `/checkout-risk` **before** confirming the order (the
`CheckoutModal` confirm path, §10). The only optional backend touch:

- When returns/refunds are processed (returns module, possibly P4), they call
  `preventionService.getRefundTiming({ userId, productId, riskBand })` to decide
  instant-vs-delayed. That's a **read-only consume** of a pure function we expose — Phase 7
  never writes refund state. If returns isn't ready, this is simply unused; nothing breaks.

---

## 9. Frontend (self-contained, drops onto existing pages)

### 9.1 `frontend/src/services/prevention.service.js`

```js
import api from './api';
export const getProductInsight = (productId) => api.get(`/prevention/product/${productId}`).then(r=>r.data);
export const getCheckoutRisk  = (items)     => api.post('/prevention/checkout-risk', { items }).then(r=>r.data);
export const getSellerInsights = ()          => api.get('/prevention/seller/insights').then(r=>r.data);
```

### 9.2 PDP — `<FitReturnNote productId />` (place inside the product-details card)

On `ProductDetailPage`, after the description, fetch `getProductInsight(id)` and render the
honest one-liner when present:

```
🧵 Runs small — 7 of 10 shoppers who returned this said it was too tight. Consider sizing up.
↩︎ Returned more often than average (mostly: "doesn't match expectations").
```

Renders nothing when `verdict==='unknown'` and `returnRate` is unremarkable. Never scolds.

### 9.3 Checkout — `<ReturnRiskNudge />` in the Buy Now confirm path

Wire into `ProductDetailPage.handleBuyNowClick` / `CheckoutModal`: before finalizing, call
`getCheckoutRisk([{ productId:id, quantity:1 }])`. If `basketRisk !== 'low'` and there's a
`FIT_NUDGE`/`INFO_NUDGE`, show a non-blocking banner with the top reason and a concrete CTA
("Size up" / "Read fit notes" / "Continue anyway"). `CONFIDENCE_BOOST` shows a positive
assurance instead. The user can always continue — **no hard block**.

### 9.4 Bracketing — `<BracketingNudge />` *(OPTIONAL — polish item O2)*

If a (minimal client-side) cart array holds duplicate/variant SKUs, `checkout-risk` returns a
`BRACKETING_NUDGE`; show "You've added 3 of these — most shoppers keep one. Want the
recommended size only?" with a one-tap "Keep recommended, remove extras." (Since there's no
cart backend, the demo can drive this with the client cart array; the API is cart-agnostic —
it scores whatever `items` you pass.) **Feasibility note:** the Buy Now flow is single-item,
so without a client cart the bracketing demo falls back to `quantity>1` on one SKU or the
historical `trust.bracketingFlag` (§15.2). Treat the full cart-driven version as optional.

### 9.5 Seller dashboard — `<ReturnInsightsPanel />` *(OPTIONAL — polish item O2)*

On `SellerDashboard`, a card listing the seller's SKUs with return rate, dominant reason, and
fit verdict badge. The nightly `sellerSummary` sentence shows only if O1 was built; the panel
is complete on the structured fields without it. This is the "Fit Insights" surface that
closes the loop upstream.

---

## 10. Seed Plan — `backend/seed-prevention.js` (additive, idempotent)

Never edits `seed.js`. Creates a deterministic demo state and then runs the recompute so the
RIKB has signal Day 1 (solves cold-start for the demo).

**What it seeds (tagged `p7-prev-demo`, deletable on re-run):**
1. A **runs-small footwear SKU** with ~30% return rate: orders + several returns whose
   `reasonText` contains "too tight / size up", plus reviews echoing it → fit verdict
   `runs_small`, confidence high. Drives the **Priya** PDP + checkout demo.
2. A **healthy electronics SKU**: many orders, ~6% returns → low risk. Drives **Rahul**
   (frictionless).
3. A **high-return apparel SKU** with mixed complaints → seller `sellerSummary` generated;
   drives the **seller dashboard** demo + bracketing.
4. Buyers at different tiers reusing the Phase 3 seed personas (verified Priya, standard
   bracketer) so `assessCheckoutRisk` shows tier-sensitive interventions.

**End of seed:** call `recomputeReturnInsights()` and print a table:
`SKU | sold | returned | rate | fitVerdict | dominantReason`.

**Run:** `node backend/seed-prevention.js` then it auto-recomputes; or `npm run
prevention:recompute` anytime.

---

## 11. Cost & Storage Budget (the binding constraint — verify against this)

| Item | Cost / Storage | Note |
|---|---|---|
| `returnInsights` docs | ~0.5 KB × #SKUs (≈0.5 MB / 1k SKUs) | bounded aggregates, not raw events; fits M0 easily |
| ML model artifacts | **none** | no model trained — scorecard is pure code |
| Per PDP view | 1 indexed `findOne` | precomputed; no LLM, no vision |
| Per checkout-risk call | 1 trust read + N RIKB reads + pure JS scorecard | in-process arithmetic; no network hop, no model |
| LLM (Bedrock) usage | **optional, nightly only**, gated by volume/return threshold, cached | a handful of calls per nightly run; the seller summary is the only LLM touch and it's optional |
| New managed services | **none** | reuse Atlas M0 (+ existing Bedrock only if the optional summary is built) |
| GPU | **none** | lexicon + group-by + arithmetic only |
| Extra cross-service traffic | **none** | prevention runs entirely in the backend, not the ML service |

If any of these grow unbounded in your implementation, you've drifted from the design — stop
and re-read this table.

---

## 12. Test Matrix

**Pure scorecard (`prevention.scoring.js` — the engine):**

| # | Input | Expect |
|---|---|---|
| 1 | Priya footwear (§4.3) | band=medium, top reason=FIT_MISMATCH |
| 2 | Rahul electronics (§4.3) | band=low |
| 3 | Bracketer apparel (§4.3) | band=high, BRACKETING_INTENT present |
| 4 | verified user, risky SKU | userReturnBehaviour capped ≤20; never high *because of the user* |
| 5 | cold SKU (0 sales) | uses category prior, no NaN |
| 6 | missing trust profile | treated as standard, userReturnBehaviour=0 |

**Intervention table (`prevention.intervention.js`):**

| # | (band, tier, fit, bracketing) | Expect |
|---|---|---|
| 7 | (medium, verified, SIZE_UP, false) | FIT_NUDGE, refund **instant** |
| 8 | (high, standard, none, false) | INFO_NUDGE, refund **delayed** |
| 9 | (high, verified, none, false) | INFO_NUDGE, refund **instant** (genuine never delayed) |
| 10 | (any, any, none, true) | BRACKETING_NUDGE |
| 11 | (low, trusted, none, false) | CONFIDENCE_BOOST |

**Fit mining + sentence (`mineFit` §3.3 + `recommendFit` §6):**

| # | texts | Expect |
|---|---|---|
| 12 | 5×"too tight", 1×"loose" | runs_small, confidence>0, suggestedAction=SIZE_UP |
| 13 | 2 fit mentions only | unknown (below FIT_MIN_MENTIONS), message=null |
| 14 | balanced small/large | true_to_size |

**Integration smoke (run backend only — no ML service needed):**
- `GET /api/prevention/product/:footwearSku` → fit note "runs small".
- `POST /api/prevention/checkout-risk` Priya → medium + FIT_NUDGE + instant refund.
- Same SKU, bracketer user, 3× qty → high + BRACKETING_NUDGE + delayed refund.
- `GET /api/prevention/seller/insights` → returns the seeded SKUs (sellerSummary present only
  if the optional nightly LLM summary was built).
- `POST /api/prevention/recompute` → updates docs; re-running is idempotent.
- Regression: `/api/orders`, `/api/products`, PDP still 200; order flow unchanged.

---

## 13. Build Order Checklist (do in this sequence)

```
CORE (everything needed for the demo):
[ ] 1.  prevention.contract.js            — priors, lexicon, bands, intervention types (§3.2/3.3/7)
[ ] 2.  returnInsight.model.js            — collection returnInsights (§3.1)
[ ] 3.  prevention.scoring.js (JS)        — pure scorecard + worked-example tests (§4) — TDD first
[ ] 4.  fit mining (mineFit) + prevention.fit.js — lexicon verdict + sentence + tests (§3.3/§6)
[ ] 5.  prevention.job.recompute          — nightly aggregation incl. fit mining (§3.4)
[ ] 6.  prevention.intervention.js (PURE) — decision table + timing + tests (§8.1)
[ ] 7.  prevention.service.js             — getProductInsight, assessCheckoutRisk (calls scorecard
                                            directly), sellerInsights, getRefundTiming (§8.2)
[ ] 8.  controller / routes / validation  — 5 endpoints, Standard_Response (§8.3)
[ ] 9.  seed-prevention.js                — 3 demo SKUs + tiers, auto-recompute, print table (§10)
[ ] 10. frontend: prevention.service.js   — api wrappers (§9.1)
[ ] 11. <FitReturnNote> on PDP            — honest one-liner (§9.2)
[ ] 12. <ReturnRiskNudge> in checkout     — non-blocking, concrete CTA (§9.3)
[ ] 13. test matrix (§12) + cost/storage audit (§11) + regression check (§1)

OPTIONAL (polish, only if time remains):
[ ] O1. seller nightly LLM summary        — reuse Bedrock wrapper, gated + cached (§3.4)
[ ] O2. <BracketingNudge> + <ReturnInsightsPanel> (seller) (§9.4/9.5)
```

**Critical path:** 1 → 2 → 3 → 5 → 7 → 8 → 11/12 — a demoable PDP + checkout nudge needs the
contract, RIKB model, scorecard, recompute job, service, and the two UI surfaces. Everything
runs in the backend; there is no model or ML service to wait on.

**Parallelizable:** the pure functions (3, 4, 6) are independent and TDD-friendly; frontend
(10–12) can start against a stubbed `/checkout-risk`. The optional items (O1, O2) never block
the demo.

---

## 14. Definition of Done (Phase 7)

1. ✅ `returnInsights` exists; the nightly `recomputeReturnInsights()` is idempotent and
   produces one compact doc per SKU + category rollups; storage stays within §11.
2. ✅ Fit signal is mined from our own `reasonText` + review `text` (lexicon, §3.3); the PDP
   shows an honest, sourced one-liner and renders nothing when `unknown`.
3. ✅ `assessCheckoutRisk` returns a **risk band + 0–100 score + top-3 reasons** computed by
   the pure `prevention.scoring.js` scorecard — no model, no ML-service call, never a 500 on
   the request path.
4. ✅ The scorecard passes the §12 pure tests, matching the §4.3 worked examples within
   rounding.
5. ✅ `assessCheckoutRisk` **consumes** Phase 3's `getTrustProfile` (never recomputes user
   risk) and returns tier-sensitive interventions.
6. ✅ Intervention engine: genuine users (verified/trusted) get **help, never delay**; risky
   users get cooling-off **timing** (not a block); bracketing is intercepted for everyone but
   framed as savings.
7. ✅ Seller dashboard shows per-SKU return rate, dominant reason, and fit verdict. *(Optional:*
   *a nightly **cached** LLM summary, touched **only** in the nightly batch, gated by*
   *volume/return threshold — the dashboard is complete without it.)*
8. ✅ `getRefundTiming` is exposed as a pure consume-able function; Phase 7 writes **only** to
   `returnInsights` and never to refund/order/return state.
9. ✅ `node seed-prevention.js` reproducibly builds the demo (runs-small footwear, healthy
   electronics, high-return apparel) and prints the expected insight table.
10. ✅ Demo runs end-to-end: Priya gets a "size up" fit nudge (no refund delay); Rahul is
    frictionless; the bracketer is intercepted + cooling-off; `recompute` visibly refreshes
    the knowledge base.
11. ✅ No edits to `trust/`, `grading/`, `routing/`, `returns/`, `secondhand/`, `items/`, base
    `seed.js`, `order.service.createOrder`, or **anything in `ml-service/`**. Existing routes
    regression-free.
12. ✅ Cost/storage budget (§11) holds: no GPU, no model artifacts, no new managed services, no
    extra cross-service traffic; per-request path is a Mongo read + pure JS math.

---

## 15. Open Questions (confirm while building)

1. **Currency/price bands:** the catalog mixes ₹ (problem statement) and `$` (PDP renders
   `$`). Pick one for `PRICE_BAND` cutoffs and document it; the bands in §4.1 are placeholders.
2. **Client cart for bracketing:** there is no cart backend (the "Add to Cart" button is
   inert). Confirm whether P7 ships a minimal client-side cart array to drive the bracketing
   demo, or scopes bracketing to the historical `trust.bracketingFlag` only. Recommend: client
   array (the `/checkout-risk` API is already cart-agnostic).
3. **Refund-timing owner:** does the returns module (or P4 routing) own refund issuance? P7
   only *exposes* `getRefundTiming`. Confirm the consumer so cooling-off actually takes effect
   in the demo (else it's advisory text only).
4. **ML model:** explicitly **deferred** (§5) — no model trained for the hackathon. Decision
   is made; flagged here only so nobody re-adds synthetic-data training under time pressure.
   Frame the real-label model as the roadmap step; we ship the closed loop (RIKB + nightly
   recompute), and the nightly recompute is what makes "self-improving" true today.
5. **Seller summary (optional):** if built, reuse the Phase 2 `BedrockService` wrapper (it has
   fallback + JSON handling). It's an optional polish item (O1) — the seller dashboard is
   complete on the structured RIKB fields without any LLM call. Skip it if time is tight.
```

