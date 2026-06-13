# Parallel Workplan — Team of 3

> Who does what, when, and what can happen simultaneously.
> Based on the Implementation Plan phases. Names are role-based — assign as you like.

---

## Role Assignments

| Role | Focus | Primary Skills |
|---|---|---|
| **Person A — Backend + AI** | FastAPI microservice, Bedrock integration, grading pipeline, trust score logic, routing engine | Python, boto3, OpenCV/CLIP, prompt engineering |
| **Person B — Backend + Data** | Express API modules, MongoDB schemas, seed data, demand registry, sustainability/credits, Health Card signing | Node/Express, MongoDB/Mongoose, crypto |
| **Person C — Frontend + Integration** | React UI for all flows, dynamic forms, marketplace storefront, routing visualisation, QR display, demo polish | React, UI/UX, API consumption |

If you're only 2 people: merge B and C — one person handles Express + React (they share the same JS ecosystem), while the other handles the entire Python/AI side.

---

## Timeline — 3 Sprints

### Sprint 1: Foundation (first ~6 hours)

Everyone works on their own track *simultaneously* after a 30-minute kickoff.

```
┌─────────────────────────────────────────────────────────────┐
│  KICKOFF (30 min, together)                                  │
│  • Create AWS account, apply credits                         │
│  • Request Bedrock model access (Nova Pro + Claude)          │
│  • Spin up MongoDB Atlas M0, get connection string           │
│  • Create S3 bucket + configure CORS for browser uploads     │
│  • Agree on the data contracts (Grade JSON, Trust JSON,      │
│    Routing JSON, Listing JSON) — commit as .schema.json      │
│    files so everyone codes against the same shapes           │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ PERSON A          │ │ PERSON B          │ │ PERSON C          │
│                   │ │                   │ │                   │
│ Set up ml-service/│ │ Scaffold new      │ │ Returns flow UI:  │
│ (FastAPI project) │ │ Express modules:  │ │ "Initiate Return" │
│                   │ │ returns, grading, │ │ button on order   │
│ Wire S3 upload    │ │ routing, demand,  │ │ page, reason form │
│ helper (presigned │ │ secondhand,       │ │                   │
│ URL generation)   │ │ health-card,      │ │ Sell-Used flow UI:│
│                   │ │ sustainability,   │ │ "Sell Second-Hand"│
│ Implement fraud   │ │ trust             │ │ page, pick from   │
│ checks:           │ │                   │ │ past orders or    │
│ • imagehash       │ │ Define Mongoose   │ │ search catalog    │
│ • EXIF check      │ │ schemas + indexes │ │                   │
│ • Rekognition     │ │ (2dsphere on      │ │ Generic evidence  │
│   web-detect      │ │ demand.geo_point) │ │ upload form       │
│                   │ │                   │ │ (placeholder for  │
│ Implement OpenCV  │ │ Seed script:      │ │ Pass 1 dynamic    │
│ blur + lighting   │ │ products, users,  │ │ form swap)        │
│ check endpoint    │ │ orders, wants,    │ │                   │
│                   │ │ NGOs for 2 cities │ │ Wire S3 presigned │
│ Implement CLIP    │ │                   │ │ upload from       │
│ subject-match     │ │ Trust Profile     │ │ browser           │
│ endpoint          │ │ computation:      │ │                   │
│                   │ │ query purchase    │ │                   │
│                   │ │ history, return   │ │                   │
│                   │ │ rate, account age │ │                   │
│                   │ │ → tier output     │ │                   │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

**Sprint 1 exit criteria:** Each person can demo their piece in isolation.
- A: `POST /analyze` with a test image → returns fraud-check + blur + CLIP scores.
- B: Seed runs clean; `POST /returns` creates a return record; trust profile endpoint returns a tier for a seeded user.
- C: UI lets you start a return or sell-used flow, upload photos to S3, and shows the state machine visually.

---

### Sprint 2: Core AI + Routing (next ~8 hours)

This is where the real magic happens. Dependencies from Sprint 1 are met, so
the heavy integrations can proceed.

```
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ PERSON A          │ │ PERSON B          │ │ PERSON C          │
│                   │ │                   │ │                   │
│ GRADING PIPELINE: │ │ ROUTING ENGINE:   │ │ DYNAMIC FORM:     │
│                   │ │                   │ │                   │
│ Bedrock Pass 1 —  │ │ Reverse-logistics │ │ When Pass 1 JSON  │
│ form generator.   │ │ cost calculator   │ │ arrives from API,  │
│ Send reason +     │ │ (distance × rate) │ │ render it as a    │
│ photos + prompts  │ │                   │ │ real React form    │
│ to Nova Pro →     │ │ Candidate paths   │ │ with the specific │
│ get JSON form     │ │ scoring functions │ │ photo-upload       │
│ schema back.      │ │ (resell, donate,  │ │ fields the AI     │
│                   │ │ liquidate, etc.)  │ │ asked for.         │
│ Bedrock Pass 2 —  │ │                   │ │                   │
│ grade synthesis.  │ │ Weighted scoring  │ │ PROGRESSIVE UX:   │
│ Assemble parallel │ │ + hard gates      │ │ Show generic form  │
│ analysis results  │ │ (hygiene, trust,  │ │ instantly, swap in │
│ → send to Nova    │ │ seller-policy,    │ │ AI fields when     │
│ Pro → Grade JSON. │ │ intake-path).     │ │ Pass 1 returns.    │
│                   │ │                   │ │                   │
│ Wire the full     │ │ $geoNear demand   │ │ PER-PHOTO FEEDBACK │
│ pipeline end-to-  │ │ query → feeds     │ │ As user uploads    │
│ end: fraud check  │ │ demand factor     │ │ each photo, call   │
│ → Pass 1 → per-  │ │ into the score.   │ │ /validate-photo    │
│ photo validate →  │ │                   │ │ → show inline      │
│ parallel analysis │ │ OUTPUT: ranked    │ │ pass/fail.         │
│ → Pass 2 → store. │ │ JSON with bars +  │ │                   │
│                   │ │ rationale.        │ │ ROUTING VIZ:       │
│ Rekognition +     │ │                   │ │ Horizontal bars    │
│ Textract calls    │ │ DEMAND REGISTRY:  │ │ showing each       │
│ wired inside the  │ │ "Notify me"       │ │ path's ₹ recovery. │
│ parallel analysis │ │ endpoint + the    │ │ Winning path       │
│ step.             │ │ match-on-list     │ │ highlighted +      │
│                   │ │ worker that pings │ │ one-line rationale.│
│                   │ │ nearby want-ers.  │ │                   │
│                   │ │                   │ │ MARKETPLACE PAGE:  │
│                   │ │ HEALTH CARD:      │ │ Browse listings    │
│                   │ │ Hash the grade    │ │ with grade badge,  │
│                   │ │ JSON, sign with   │ │ condition lane,    │
│                   │ │ KMS Ed25519,      │ │ and QR code.       │
│                   │ │ append to chain,  │ │                   │
│                   │ │ generate QR URL.  │ │                   │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

**Sprint 2 exit criteria:** The full happy-path works end-to-end for ONE persona.
- Upload photos → get a real AI grade → see the routing bars → item appears on
  the marketplace with a scannable QR Health Card.

---

### Sprint 3: Extras + Demo Hardening (final ~6 hours)

Everyone shifts from "build" to "complete + polish." Features divide cleanly.

```
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ PERSON A          │ │ PERSON B          │ │ PERSON C          │
│                   │ │                   │ │                   │
│ RETURN PREDICTION │ │ SUSTAINABILITY:   │ │ SELLER DASHBOARD: │
│ Load pre-trained  │ │ CO2 factor table, │ │ Bulk view of all  │
│ XGBoost .joblib,  │ │ per-disposition   │ │ returns, grades,  │
│ expose /predict-  │ │ calculation,      │ │ routing outcomes,  │
│ return endpoint.  │ │ user counter,     │ │ recovery summary. │
│                   │ │ platform ticker.  │ │                   │
│ SIZE/FIT REC:     │ │                   │ │ TRUST TIER VIZ:   │
│ KNN over Misra    │ │ GREEN CREDITS:    │ │ Show different UX  │
│ dataset, expose   │ │ Wallet table,     │ │ for Watch/Restrict │
│ /fit-recommend.   │ │ earn on donate/   │ │ vs Verified users. │
│                   │ │ resell, redeem at │ │                   │
│ AI LISTING GEN:   │ │ checkout.         │ │ FIT REC on PDP:   │
│ One Bedrock call  │ │                   │ │ "82% of similar    │
│ → title + desc +  │ │ DONATION PATH:    │ │ customers prefer   │
│ price suggestion. │ │ NGO match, tax    │ │ size 8."           │
│                   │ │ receipt PDF gen   │ │                   │
│ ERROR FALLBACKS:  │ │ (pdfkit or        │ │ RETURN-RISK NUDGE │
│ If Bedrock is     │ │ puppeteer).       │ │ at checkout.       │
│ slow/down, serve  │ │                   │ │                   │
│ cached schemas    │ │ SEED REFRESH:     │ │ DEMO SCRIPTS:     │
│ and degrade       │ │ Add demo personas │ │ Run all 4 personas│
│ gracefully.       │ │ with pre-built    │ │ end-to-end. Fix   │
│                   │ │ histories so      │ │ every rough edge.  │
│                   │ │ trust tiers demo  │ │                   │
│                   │ │ visibly.          │ │ QR SCAN PAGE:     │
│                   │ │                   │ │ Public verify URL  │
│                   │ │                   │ │ shows grade +      │
│                   │ │                   │ │ chain + ✓ badge.   │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

**Sprint 3 exit criteria:** All four personas play cleanly. CO2 counter ticks.
QR scans work. Seller dashboard shows batch recovery. Demo can be reset and
re-run in 60 seconds.

---

## Dependency Map (What Blocks What)

```
Nothing blocks Sprint 1 — all three people work independently.

Sprint 2 dependencies:
  Person A (grading) needs: S3 upload working (Sprint 1-A), schemas committed (Kickoff)
  Person B (routing) needs: Grade JSON shape (Kickoff), demand seed data (Sprint 1-B)
  Person C (dynamic form) needs: Pass 1 endpoint live (Sprint 2-A, but can stub with mock JSON)

Sprint 3 dependencies:
  Person A (listing gen) needs: Grade JSON stored (Sprint 2-A)
  Person B (sustainability) needs: Routing decisions emitting events (Sprint 2-B)
  Person C (seller dashboard) needs: Multiple grades + routing results in DB (Sprint 2-A+B)
```

**The critical path is Person A's grading pipeline.** If that's running by mid-Sprint-2, everything else flows. If it's stuck, Person C stubs with hardcoded Grade JSONs to keep moving.

---

## Parallel Independence Summary

| Sprint | Person A | Person B | Person C | Blocking? |
|---|---|---|---|---|
| 1 | FastAPI + fraud + CV tools | Express modules + schemas + seed + trust | UI entry points + S3 upload | **No blocking** — all independent |
| 2 | Full grading pipeline | Routing engine + demand + Health Card | Dynamic form + routing viz + marketplace | **Light dep:** C needs A's Pass-1 output (stub if needed) |
| 3 | Return model + fit rec + listing gen | Sustainability + credits + donation + seed | Dashboard + demo scripts + polish | **No blocking** — all independent |

---

## If You're Only 2 People

Merge Person B + Person C into one "Full-stack JS" person:

- **Person 1 (Python/AI):** Everything in `ml-service/` — fraud checks, OpenCV, CLIP, Bedrock Pass 1 + 2, Rekognition, Textract, XGBoost, fit KNN, listing gen.
- **Person 2 (Full-stack JS):** Express modules, React UI, MongoDB schemas, seed, trust score, routing engine, demand registry, Health Card signing, sustainability, green credits, donation, seller dashboard, demo polish.

Person 2 has more surface area but each piece is smaller. Person 1 has fewer pieces but each one is deeper (prompt engineering, parallel async orchestration, model loading).

---

## Quick "Am I Blocked?" Checklist

If you're stuck, check:
1. Is Bedrock model access approved? (Do this in the FIRST 10 minutes.)
2. Is the S3 bucket CORS-configured for browser uploads?
3. Is the Atlas connection string in `.env`?
4. Did you run the seed script so there's data to query?
5. Are you coding against the agreed JSON contract shape or guessing?

If any of those is "no," fix that before writing feature code.
