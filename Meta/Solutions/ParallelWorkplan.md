# Parallel Workplan — Phase-Based Streams for Team of 2–3

> Maps the Implementation Plan's phases (P0–P9) into parallel streams.
> Shows which phases can run simultaneously, which must wait, and who owns what.

---

## Phase Dependency Graph

```
                    ┌──── P0 (Foundation) ────┐
                    │   Everyone together     │
                    └────────────┬────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                  │
              ▼                 ▼                  ▼
     ┌────────────────┐ ┌────────────┐ ┌──────────────────┐
     │ P1 — Dual      │ │ P2 — AI    │ │ P3 — Trust Score │
     │ Intake Entry   │ │ Grading    │ │ & Fraud Defence  │
     │ Points (UI +   │ │ Pipeline   │ │                  │
     │ state machine) │ │ (FastAPI)  │ │                  │
     └───────┬────────┘ └─────┬──────┘ └────────┬─────────┘
              │                │                  │
              │                ▼                  │
              │   ┌────────────────────────┐      │
              └──►│ P4 — Smart Routing     │◄─────┘
                  │ (needs Grade + Trust   │
                  │  + intake path)        │
                  └───────────┬────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
     ┌────────────────┐ ┌──────────┐ ┌───────────────────┐
     │ P5 — Resale    │ │ P6 —     │ │ P8 — Sustain-     │
     │ Marketplace +  │ │ Demand   │ │ ability + Green    │
     │ AI Listing +   │ │ Registry │ │ Credits + Donation │
     │ Health Card    │ │ + Geo    │ │                    │
     └────────────────┘ └──────────┘ └───────────────────┘
              │               │               │
              └───────────────┼───────────────┘
                              │
                    ┌─────────┴─────────┐
                    │ P7 — Prevention   │  (independent — can start after P0)
                    │ (Return model +   │
                    │  Fit recs)        │
                    └─────────┬─────────┘
                              │
                    ┌─────────┴─────────┐
                    │ P9 — Demo Polish  │
                    │ (needs everything │
                    │  above working)   │
                    └───────────────────┘
```

---

## What Can Run in Parallel — Phase by Phase

### LAYER 0: Must finish first (blocking everything)

| Phase | Duration | Why it blocks |
|---|---|---|
| **P0 — Foundation** | ~2 hours | AWS creds, Bedrock model access, S3 bucket, Atlas cluster, JSON contracts, seed data. Without these, nobody can write real code. |

**Everyone does P0 together.** It's short. Split the tasks:
- One person: AWS account + Bedrock access + S3 bucket + KMS key
- One person: MongoDB Atlas + connection string + create indexes
- One person: Commit JSON contract schemas + scaffold empty module folders

---

### LAYER 1: Three phases in parallel (no cross-dependencies)

Once P0 is done, these three phases have **zero dependencies on each other** and run simultaneously:

| Phase | Owner | What they're building | Needs from others |
|---|---|---|---|
| **P1 — Dual Intake** | Frontend person | Returns UI, Sell-Used UI, shared state machine, evidence upload shell | Only P0 outputs (S3 bucket, schemas) |
| **P2 — AI Grading** | Python/AI person | Full hybrid pipeline: fraud checks → Pass 1 → photo validation → parallel analysis → Pass 2 → store grade | Only P0 outputs (S3, Bedrock access, schemas) |
| **P3 — Trust Score** | Backend person | Trust profile computation from order/return history, tier assignment logic | Only P0 outputs (Atlas, seed data with user histories) |

**Why these are parallel:** P1 builds the *entry point* that feeds data into the pipeline. P2 builds the *pipeline itself*. P3 builds the *context layer* that annotates the pipeline's input. None needs the other's output — they all consume the raw item record and user record from P0's schema.

**Integration contract:** They agree on one interface: "When a return/sell-used is submitted, the item record contains `{user_id, product_id, reason, image_urls[], intake_path}`." That's all any of them needs to start.

---

### LAYER 2: One phase, needs all three from Layer 1

| Phase | Owner | What they're building | Needs from Layer 1 |
|---|---|---|---|
| **P4 — Smart Routing** | Backend person (or pair) | Weighted scoring engine, reverse-logistics cost calc, candidate paths, hard gates, rationale output | Grade JSON (from P2) + Trust Profile (from P3) + intake_path (from P1's state machine) |

**This is the convergence point.** P4 is the first phase that combines outputs from all three Layer 1 streams. It's the "brain" — takes a graded item with a trust context and decides where it goes.

**Who builds it:** Ideally the Backend person who did P3 (they already have the trust tier logic and the routing-adjacent thinking). The Python/AI person is freed up for the parallel Layer 3 work below.

---

### LAYER 3: Four phases in parallel (after P4 exists)

Once routing decisions are flowing, these four phases are **independent of each other**:

| Phase | Owner | What they're building | Needs from P4 |
|---|---|---|---|
| **P5 — Resale Marketplace + Listing Gen + Health Card** | Frontend + Backend collab | AI listing (Bedrock call), storefront UI, QR + Ed25519 signing, hash chain | Routing decision = "resell" → triggers listing gen |
| **P6 — Demand Registry + Geo Matching** | Backend person | `wants` collection, $geoNear queries, notify-on-match | Routing engine calls demand count as an input (can stub initially), listed items trigger notify |
| **P7 — Prevention (Return Model + Fit)** | Python/AI person | XGBoost endpoint, KNN fit rec, checkout nudge | **Actually independent of P4** — runs on the PDP/checkout, not the return flow. Can start after P0. |
| **P8 — Sustainability + Green Credits + Donation** | Backend person | CO2 computation, credit ledger, NGO match, tax receipt | Routing decision = "donate" → triggers NGO match + receipt |

**Key insight: P7 (Prevention) has NO dependency on P1–P4.** It lives on the *purchase* side, not the *return* side. You can start it any time after P0. If you have bandwidth in Layer 1, start P7 early.

---

### LAYER 4: Final phase (needs everything above)

| Phase | Owner | What they're building | Needs |
|---|---|---|---|
| **P9 — Demo Polish** | Everyone together | Four persona scripts, trust-tier divergence demo, error fallbacks, seed refresh, rehearsal | All of the above working end-to-end |

---

## Visual Timeline (2–3 People)

```
TIME ──────────────────────────────────────────────────────────────►

Hour 0─2     │ P0 (everyone together)
             │
Hour 2─8     │ ┌──────────┐  ┌──────────┐  ┌──────────┐
             │ │ P1       │  │ P2       │  │ P3       │   ← ALL PARALLEL
             │ │ (Frontend)│  │ (AI/Py)  │  │ (Backend)│
             │ └──────────┘  └──────────┘  └──────────┘
             │                    │               │
             │            Also start P7 here if bandwidth ──┐
             │                                              │
Hour 8─12    │ ┌──────────────────────────────┐             │
             │ │ P4 — Routing Engine          │             │
             │ │ (Backend, or pair up)        │             │
             │ └──────────────────────────────┘             │
             │                                              │
Hour 12─18   │ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐│
             │ │ P5     │ │ P6     │ │ P8     │ │ P7     ││ ← ALL PARALLEL
             │ │Listing │ │Demand  │ │Sustain │ │Prevent ││
             │ │+Market │ │+Geo    │ │+Donate │ │+Fit    ││
             │ └────────┘ └────────┘ └────────┘ └────────┘│
             │                                              │
Hour 18─20   │ ┌──────────────────────────────┐
             │ │ P9 — Demo Polish (everyone)  │
             │ └──────────────────────────────┘
```

---

## Assignment for 3 People

| Person | Layer 1 | Layer 2 | Layer 3 | Layer 4 |
|---|---|---|---|---|
| **Person A (Python/AI)** | P2 — Grading pipeline | Supports P4 (provides grade endpoint) | P7 — Prevention + P5's AI listing gen call | P9 |
| **Person B (Node/Backend)** | P3 — Trust Score | P4 — Routing engine (lead) | P6 — Demand + P8 — Sustainability | P9 |
| **Person C (Frontend)** | P1 — Dual Intake UI | P4 — Routing visualization UI | P5 — Marketplace page + Health Card QR display | P9 |

---

## Assignment for 2 People

| Person | Layer 1 | Layer 2 | Layer 3 | Layer 4 |
|---|---|---|---|---|
| **Person A (Python/AI)** | P2 — Grading + start P7 early | Grade endpoint ready for P4 | P7 — Prevention + AI listing gen | P9 |
| **Person B (Full-stack JS)** | P1 — UI + P3 — Trust | P4 — Routing (full: engine + viz) | P5 + P6 + P8 (marketplace, demand, sustainability) | P9 |

Person B has more phases but they're all in the same language (Node + React + Mongo). Person A has fewer but deeper (Python orchestration, Bedrock prompts, model serving).

---

## The Rules

1. **Never start a Layer N+1 phase until its inputs from Layer N exist** — even if just as stubs returning hardcoded JSON.
2. **P7 is the exception** — it has no upstream dependency beyond P0. Start it whenever you have slack.
3. **The critical path is P2 (Grading).** If the Grade JSON isn't flowing by the end of Layer 1, P4 can't start. Mitigate: Person C stubs the grade with a hardcoded JSON to unblock the routing UI.
4. **P9 is not optional.** A working demo that crashes mid-pitch is worse than a demo with fewer features that runs cleanly. Protect at least 2 hours for P9.
5. **Communicate at layer boundaries.** When you finish your Layer 1 phase, announce it and verify the integration point works with the other streams before diving into Layer 2.
