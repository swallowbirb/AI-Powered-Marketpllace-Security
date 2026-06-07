# Seller Copilot — Hackathon MVP Architecture
**Target:** 5-day solo build · Stack: React · Node.js/Express · FastAPI · MongoDB Atlas · XGBoost · Claude API · Ollama (dev)

---

## What This Is

Seller Copilot gives sellers one dashboard to: know what to stock, know what to charge, and know how to negotiate — automatically. Three modules, two services, one page.

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│           REACT FRONTEND (port 3000)         │
│  Inventory table | Pricing card | Alert+Email │
└────────────────────────┬────────────────────┘
                         │ REST
┌────────────────────────▼────────────────────┐
│        NODE.JS / EXPRESS (port 3001)         │
│  Products · Alerts · Pricing · Negotiation   │
└──────────┬──────────────────────────────────┘
           │ HTTP
┌──────────▼──────────────────────────────────┐
│          FASTAPI ML SERVICE (port 8000)      │
│   XGBoost price optimizer · RAG pipeline     │
└──────────┬──────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────┐
│              MONGODB ATLAS                   │
│  products · alerts · suppliers · supplier_docs│
│  (Vector Search index on supplier_docs)      │
└─────────────────────────────────────────────┘

LLM: Ollama + llama3 (dev) → Claude API (demo only)
```

**React** calls Node.js only — never FastAPI directly.  
**Node.js** owns all business logic, MongoDB CRUD, and alert detection.  
**FastAPI** owns all ML inference, embeddings, vector search, and LLM calls.  
**Node.js passes retrieved context to FastAPI** for email generation — FastAPI does not query MongoDB independently.

---

## Collections (4 only)

### `products`
```json
{
  "_id": "ObjectId",
  "sku": "string (unique)",
  "name": "string",
  "category": "string",
  "unit_price": "number",
  "cost_price": "number",
  "current_stock": "number",
  "reorder_point": "number",
  "lead_time_days": "number",
  "supplier_id": "ObjectId",
  "product_score": "number (0–1)",
  "volume": "number",
  "comp_1": "number",
  "comp_2": "number",
  "comp_3": "number",
  "last_recommended_price": "number (nullable)",
  "last_predicted_demand": "number (nullable)",
  "last_estimated_profit": "number (nullable)",
  "last_confidence_score": "number (nullable)",
  "status": "enum: active | low_stock",
  "updated_at": "Date"
}
```
> Price recommendation is stored inline on the product document — no separate `price_history` collection.

### `alerts`
```json
{
  "_id": "ObjectId",
  "product_id": "ObjectId",
  "sku": "string",
  "type": "LOW_STOCK",
  "current_stock": "number",
  "reorder_point": "number",
  "suggested_reorder_qty": "number",
  "status": "enum: open | resolved",
  "draft_email": "string (nullable)",
  "created_at": "Date"
}
```
> Email draft is stored inline on the alert — no separate `negotiation_logs` collection.

### `suppliers`
```json
{
  "_id": "ObjectId",
  "name": "string",
  "contact_email": "string",
  "contact_name": "string",
  "payment_terms": "string",
  "avg_lead_time_days": "number"
}
```

### `supplier_docs` ← Vector Search lives here
```json
{
  "_id": "ObjectId",
  "supplier_id": "ObjectId",
  "doc_type": "enum: invoice | negotiation_email",
  "title": "string",
  "content": "string",
  "metadata": {
    "product_sku": "string",
    "date": "Date",
    "amount": "number",
    "discount_pct": "number",
    "outcome": "enum: accepted | rejected | pending"
  },
  "embedding": "[number] (768 or 1536 dim)",
  "created_at": "Date"
}
```
> Atlas Vector Search index on `embedding` field. Index name: `supplier_vector_index`. Cosine similarity.  
> **Create this index on Day 1 — it takes 10–30 minutes to build.**

---

## API Endpoints

### Node.js (port 3001)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/products` | List all products |
| PUT | `/api/products/:id` | Update product (triggers alert check) |
| GET | `/api/alerts` | Get all open alerts |
| PUT | `/api/alerts/:id/resolve` | Resolve alert |
| POST | `/api/pricing/optimize` | Run price optimization for a product |
| POST | `/api/negotiation/draft` | Generate supplier email draft |

**POST /api/pricing/optimize — request:**
```json
{ "product_id": "string" }
```
**Response:**
```json
{
  "recommended_price": 24.99,
  "predicted_demand": 87,
  "estimated_profit": 1131.13,
  "confidence_score": 0.82
}
```

**POST /api/negotiation/draft — request:**
```json
{
  "product_id": "string",
  "alert_id": "string",
  "action_type": "initial_request | price_negotiation"
}
```

### FastAPI (port 8000)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/health` | Health check |
| POST | `/ml/optimize-price` | XGBoost price sweep → optimal price |
| POST | `/rag/generate-email` | Vector search + LLM → draft email |

**POST /ml/optimize-price — request:**
```json
{
  "unit_price": 22.50,
  "cost_price": 12.00,
  "customers": 140,
  "holiday": 0,
  "weekday": 1,
  "weekend": 0,
  "comp_1": 21.00,
  "comp_2": 23.50,
  "comp_3": 22.00,
  "ps1": 0.8, "ps2": 0.75, "ps3": 0.72,
  "fp1": 22.0, "fp2": 23.0, "fp3": 21.5,
  "lag_price": 21.00,
  "volume": 500,
  "product_score": 0.78,
  "price_range_pct": 0.30,
  "price_steps": 30
}
```
**Response:**
```json
{
  "recommended_price": 24.99,
  "predicted_demand": 87,
  "estimated_profit": 1131.13,
  "confidence_score": 0.82
}
```

**POST /rag/generate-email — request:**
```json
{
  "product_context": {
    "sku": "ELEC-001",
    "name": "Wireless Earbuds Pro",
    "current_stock": 8,
    "reorder_point": 20,
    "suggested_reorder_qty": 100
  },
  "supplier_context": {
    "name": "TechSupply Co.",
    "contact_name": "Jane Smith",
    "payment_terms": "NET30"
  },
  "supplier_id": "string",
  "action_type": "initial_request | price_negotiation"
}
```

---

## Core Logic

### Alert detection (runs on every stock update)
```
PUT /api/products/:id received
  → save updated stock
  → if current_stock <= reorder_point:
      → check for existing open LOW_STOCK alert (idempotency guard)
      → if none exists: create alert with suggested_reorder_qty
```

> Idempotency check: `Alert.findOne({ product_id, type: "LOW_STOCK", status: "open" })` before inserting.

### Price optimization sweep (FastAPI)
```
receive product features
→ sweep ±30% around current_price in 30 steps
→ at each candidate price: XGBoost.predict(features)
→ compute profit = predicted_qty × (price − cost)
→ return price with highest profit
→ confidence = 1 − (std(top5_profits) / mean(top5_profits))  [clamped 0–1]
```

### RAG email generation (FastAPI)
```
receive product_context + supplier_id + action_type
→ embed action_type + product name as query
→ Atlas Vector Search: top 3 similar supplier_docs filtered by supplier_id
→ assemble prompt with retrieved docs + product context
→ call Claude API (or llama3 in dev)
→ return draft email string
```

---

## Build Order

### Phase 1 — Foundation (Days 1–2)

**Goal:** Data models running, API stubbed, ML model trained, vector index live.

1. Create MongoDB Atlas cluster. Define and seed 4 collections.
2. Write Mongoose schemas for `products`, `alerts`, `suppliers`.
3. Seed 5–10 synthetic products with realistic `comp_*`, `cost_price`, `reorder_point` values.
4. **Create the Atlas Vector Search index immediately** — it takes up to 30 minutes.
5. Run `generate_synthetic_docs.py` to create 20–30 supplier docs with varied vocabulary. Embed and seed them.
6. Run `train.py`: generate 676-row synthetic CSV → train XGBoost → save `model.pkl`.
7. Stub all 5 Node.js route handlers returning hardcoded JSON.
8. Stand up FastAPI with `/health`, `/ml/optimize-price` (model loaded), `/rag/generate-email` (template only).

### Phase 2 — Core logic (Days 3–4)

**Goal:** All three demo flows work end-to-end via API (no UI yet).

1. Wire `POST /api/pricing/optimize`: Node reads product doc → calls FastAPI `/ml/optimize-price` → saves result back to product → returns to client.
2. Wire alert detection: on `PUT /api/products/:id`, run low-stock check with idempotency guard.
3. Wire `POST /api/negotiation/draft`: Node passes context to FastAPI `/rag/generate-email` → FastAPI does vector search + llama3 call → Node saves draft to alert doc.
4. Test all three flows with curl/Postman before touching the frontend.

### Phase 3 — UI + demo polish (Day 5)

**Goal:** Dashboard wired, all flows demoable, fallbacks in place.

1. Build the single-page dashboard: inventory table (left), pricing card with "Optimize" button (center), alert list + email composer (right).
2. Inline competitor data as a color badge on each product row — no separate CompetitorPanel component.
3. Wire all three demo flows through the UI: lower stock → alert → draft email; click Optimize → recommendation card; browse alerts.
4. Add 5-minute in-memory cache on the Node pricing endpoint keyed by `product_id`.
5. Pre-generate one fallback email and store it as an env var for LLM rate limit failures.
6. Switch LLM from llama3 to Claude API. Run one full end-to-end test.

---

## What Was Cut (and Why)

| Removed | Reason |
|---------|--------|
| `price_history` collection | Last recommendation stored inline on product doc — sufficient for demo |
| `negotiation_logs` collection | Email draft stored inline on alert — same result, one fewer collection |
| `CompetitorPanel` UI component | Competitor status shown as inline badge — saves half a day, same information |
| `PriceHistoryChart` | Just show the number; the chart adds no demo value |
| PRICE_RISK alerts | Reduces scope; competitor data still surfaces in the table |
| Renewal `action_type` | Only `initial_request` and `price_negotiation` needed for demo |
| `sweep_results` in pricing response | Best price is what matters; the full sweep array is noise |
| `price_delta_pct` in pricing response | Frontend can compute this if needed |
| User auth / multi-tenant | Demo-only product |
| `/ml/predict-demand` as a separate endpoint | Demand prediction is internal to the price sweep only |

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Atlas Vector Search index creation delay | Create on Day 1 before writing any code |
| Ollama embedding dim (768) ≠ OpenAI (1536) | Decide embedding model on Day 1 and never switch — re-ingesting is painful |
| LLM API rate limits during live demo | 5-min in-memory cache on pricing; hardcoded fallback email as env var |
| FastAPI Motor async conflicts | Keep all MongoDB access in Node.js; FastAPI receives context from Node, not from its own DB queries |
| XGBoost overfits on 676 rows | Set `max_depth=3`, `colsample_bytree=0.7`; frame as "trend direction" not absolute accuracy |
| Duplicate LOW_STOCK alerts | Idempotency check before every alert insert |

---

## Folder Structure

```
seller-copilot/
├── client/                   # React frontend
│   └── src/
│       ├── App.jsx
│       ├── components/
│       │   ├── InventoryTable.jsx
│       │   ├── PricingCard.jsx
│       │   └── AlertComposer.jsx
│       └── api/
│           └── index.js      # axios wrappers
│
├── server/                   # Node.js / Express
│   ├── index.js
│   ├── models/
│   │   ├── Product.js
│   │   ├── Alert.js
│   │   └── Supplier.js
│   ├── routes/
│   │   ├── products.js
│   │   ├── pricing.js
│   │   └── negotiation.js
│   └── services/
│       ├── alertService.js
│       └── pricingCache.js
│
├── ml/                       # FastAPI Python service
│   ├── main.py
│   ├── routers/
│   │   ├── ml.py
│   │   └── rag.py
│   ├── model.pkl             # trained XGBoost
│   ├── train.py
│   └── requirements.txt
│
└── data/
    └── synthetic/
        ├── products.json
        └── supplier_docs.json
```

---

## Demo Script (3 flows, ~3 minutes)

1. **Low-stock alert → email:** Edit a product's stock below its reorder point. Alert appears in the sidebar. Click "Draft Email." Supplier email renders with context pulled from past invoices.
2. **Price optimization:** Select a product. Click "Optimize Price." Recommendation card shows recommended price, predicted demand, and estimated profit.
3. **Alert management:** Show the alerts list. Resolve one. Confirm it disappears.

---

*Estimated build time: 5 days solo, 3–4 days with two people.*
