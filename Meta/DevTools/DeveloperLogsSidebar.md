# Developer Logs Sidebar — Technical Reference

> **Purpose:** Real-time, step-by-step visibility into the intake → grading
> pipeline. Shows exactly what happened (or failed), which AI models were
> invoked, what data was sent, and what came back — right inside the browser.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Frontend (React)                                             │
│                                                              │
│   DeveloperLogsSidebar.jsx                                   │
│     • Polls GET /api/items/:itemId/logs every 2s             │
│     • Renders logs chronologically with step icons           │
│     • Expandable "▸ detail" blocks for metadata JSON         │
│     • Log level filter: All / Key Steps / Errors             │
│     • Smart scroll: follows new logs only if at bottom       │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTP GET
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Backend (Express)                                            │
│                                                              │
│   GET /api/items/:itemId/logs  (auth-gated, owner or admin)  │
│     → ItemLogger.getLogs(itemId)                             │
│     → returns { logs: [...] }                                │
│                                                              │
│   ItemLogger utility (backend/src/utils/itemLogger.js)       │
│     .log(itemId, step, message, metadata)                    │
│     .error(itemId, step, error, extra)                       │
│     .getLogs(itemId, limit=200)                              │
│                                                              │
│   Persisted in MongoDB "itemlogs" collection                 │
│     • TTL index: auto-expire after 7 days                   │
│     • Indexed on { itemId, timestamp }                       │
└──────────────────────────────────────────────────────────────┘
```

---

## File Locations

| Component | Path |
|-----------|------|
| Sidebar React component | `frontend/src/components/shared/DeveloperLogsSidebar.jsx` |
| Trust tier badge | `frontend/src/components/shared/TrustTierBadge.jsx` |
| Frontend service (getLogs) | `frontend/src/services/item.service.js` |
| ItemLogger utility | `backend/src/utils/itemLogger.js` |
| ItemLog Mongoose model | `backend/src/modules/items/itemLog.model.js` |
| Routes (GET /logs) | `backend/src/modules/items/item.routes.js` |
| Controller (getLogs) | `backend/src/modules/items/item.controller.js` |
| Log emission points (items) | `backend/src/modules/items/item.service.js` |
| Log emission points (grading) | `backend/src/modules/grading/grading.service.js` |

---

## Log Entry Schema (MongoDB)

```js
{
  itemId:    ObjectId,       // the item this log belongs to
  step:      String,         // machine key, e.g. "GRADE_ASSIGNED"
  message:   String,         // plain-English message with emoji prefix
  metadata:  Object,         // structured payload (expandable in sidebar)
  timestamp: Date            // indexed; TTL auto-deletes after 7 days
}
```

---

## Complete Step Catalogue

Below is every log step emitted across the flow, in the order they typically
appear. Each includes the icon displayed in the sidebar, the emitting file,
and what metadata is attached.

### Initiation (item.service.js)

| Step | Icon | Message | Metadata |
|------|------|---------|----------|
| `INITIATE` | 🚀 | "Return initiated by user" / "Sell-used listing initiated" | `intakePath`, `reason` |
| `TRUST_COMPLETE` | ✅ | "Trust tier: STANDARD" | `tier` |
| `ITEM_CREATED` | ✅ | "Item record created in database" | `status` |

### Evidence Submission (item.service.js)

| Step | Icon | Message | Metadata |
|------|------|---------|----------|
| `EVIDENCE_SUBMIT` | 📤 | "Evidence submitted: N photo(s)" | `photoCount` |
| `STATUS_UPDATE` | 📊 | "Status changed to EVIDENCE_PENDING" | — |
| `PASS2_START` | ⚙️ | "Starting AI grading analysis..." | — |

### Grading Pipeline (grading.service.js)

| Step | Icon | Message | Metadata |
|------|------|---------|----------|
| `GRADING_REQUEST` | 📡 | "POST http://localhost:8000/grade/ — N evidence photo(s), M listing reference photo(s)" | `endpoint`, `timeout_ms`, `category`, `reason`, `evidencePhotoCount`, `listingReferenceCount`, `hasCatalogHashes`, `expectedPrimaryModel`, `expectedFallbackModel` |
| `ANALYSIS_WARNING` | ⚠️ | "No listing reference photos available…" (when product has no images) | `reason: "no_reference_images"` |
| `FRAUD_CHECK` | 🛡️ | "ML pipeline started: fraud preflight → parallel analysis → Bedrock Pass 2..." | — |
| `GRADING_REQUEST` | 📡 | "ML service responded in 1842ms (HTTP 200, status=ok)" | `latency_ms`, `status` |

### — When ML service responds successfully: —

| Step | Icon | Message | Metadata |
|------|------|---------|----------|
| `FRAUD_PASS` / `FRAUD_RESULT` | ✅ / 🛡️ | "Fraud preflight CLEAN — no signals" or "Fraud preflight SOFT — missing_exif" | `classification`, `triggering_signal`, `phash_match`, `exif_has_camera_data`, `rekognition_web_match`, `notes` |
| `ANALYSIS_OPENCV` | 🎨 | "OpenCV color/histogram delta: 0.23" or "OpenCV skipped (no_reference)" | Full analysis output |
| `ANALYSIS_CLIP` | 🧠 | "CLIP visual similarity: 87.3%" or "CLIP skipped (unavailable)" | Full CLIP result |
| `ANALYSIS_REKOGNITION` | 🏷️ | "Rekognition: 14 labels, 2 defect candidate(s). Top: Laptop(99%), Screen(97%), ..." | `labelCount`, `defectCount`, `topLabels`, `defect_candidates` |
| `ANALYSIS_TEXTRACT` | 🔤 | "Textract OCR: 3 line(s) extracted — 'Serial: ABC123 \| Model: X1'" | `lineCount`, `sample` |
| `ANALYSIS_WARNING` | ⚠️ | "Analysis warnings: clip_similarity_unavailable, textract_failed" | `warnings` |
| `MODEL_INVOKE` | 🤖 | "Bedrock Pass 2 synthesized grade using amazon.nova-pro-v1:0" | `pass1Model`, `pass2Model`, `rekognitionVersion` |

### — When ML service is DOWN: —

| Step | Icon | Message | Metadata |
|------|------|---------|----------|
| `ML_UNAVAILABLE` | 🔌 | "ML service unavailable. Falling back to manual-review grade. ML service is not running at http://localhost:8000 (ECONNREFUSED). Start it with: cd ml-service && uvicorn app.main:app --reload --port 8000" | `errorCode`, `errorMessage`, `httpStatus`, `responseBody`, `mlServiceUrl` |

### — When ML response is invalid: —

| Step | Icon | Message | Metadata |
|------|------|---------|----------|
| `ML_INVALID_RESPONSE` | ⚠️ | "ML response failed shape validation (grade=…, confidence=…). Using fallback grade." | `received` (raw response) |

### Persistence & Lifecycle (grading.service.js)

| Step | Icon | Message | Metadata |
|------|------|---------|----------|
| `PASS2_BEDROCK` | 🤖 | "Persisting grade to MongoDB (grade=B, score=78, confidence=high, routing=resell)" | `grade`, `qualityScore`, `confidence`, `routingHint`, `returnClaimVerified`, `estimatedResalePct`, `defectCount`, `missingEvidence`, `usedFallback` |
| `LIFECYCLE_EMIT` | ⛓️ | "Lifecycle GRADED emission: pending (emitter_not_implemented)" | `emission` object |

### Grade Completion (item.service.js → markGraded)

| Step | Icon | Message | Metadata |
|------|------|---------|----------|
| `GRADE_ASSIGNED` | 🎯 | "Grade B assigned (78/100, confidence: high). Claim verified ✓. Routing hint: resell. Defects: minor screen_wear" | `grade`, `qualityScore`, `confidence`, `routingHint`, `returnClaimVerified`, `estimatedResalePct`, `defects`, `missingEvidence`, `gradeId` |
| `STATUS_UPDATE` | 📊 | "Item status changed: GRADING → GRADED" | — |
| `REVIEW_FLAGGED` | ⚠️ | "Flagged for human review (low_confidence)" | `reviewReason` |
| `FLOW_COMPLETE` | ✨ | "Grading complete. Ready for routing." | — |

### Errors (anywhere)

| Step | Icon | Message | Metadata |
|------|------|---------|----------|
| `ERROR` | ❌ | "PERSIST_GRADE: Failed to save grade to MongoDB — duplicate key…" | `error` (stack trace), `itemId` |
| `GRADE_REJECTED` | 🚫 | "Item rejected by fraud checks" | `reviewReason` |

---

## Frontend Sidebar Features

### Smart Scroll
The sidebar only auto-follows new log entries when the user is scrolled to the
bottom (within 48px). The moment you scroll up to inspect a log, auto-follow
disengages. Scroll back down to re-engage.

### Log Level Filter
Three modes accessible via buttons at the top:

- **All** — every log entry
- **Key Steps** — only `COMPLETE`, `ASSIGNED`, `START`, `INITIATE`, `REJECTED`
- **Errors** — only `ERROR` and `REJECTED` steps

### Expandable Metadata
Every log that carries a `metadata` object shows a collapsible `▸ detail`
link. Clicking it opens a dark panel showing key-value pairs and, for errors,
the full stack trace in a scrollable `<pre>` block.

### Responsive
The sidebar renders only on `lg` viewports (`hidden lg:flex`) and collapses
to a 12px-wide rail with a terminal icon when toggled closed.

---

## Adding New Log Points

To log a new step in the flow:

```js
const ItemLogger = require('../../utils/itemLogger');

await ItemLogger.log(itemId, 'MY_STEP', '🔧 Description of what happened', {
  someKey: 'someValue',      // appears in the ▸ detail panel
  anotherKey: 42,
});
```

- **step** — ALL_CAPS_SNAKE_CASE machine key. Add a matching icon in
  `DeveloperLogsSidebar.jsx` → `STEP_ICONS`.
- **message** — Prefix with an emoji for at-a-glance scanning. Use
  plain English so non-devs can follow.
- **metadata** — Any structured data. Rendered as key-value pairs in the
  sidebar detail panel. Include error stacks under key `error`.

`ItemLogger.log` never throws — logging failures don't break the flow.

---

## API Endpoint

```
GET /api/items/:itemId/logs
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "_id": "665b...",
        "itemId": "665a...",
        "step": "INITIATE",
        "message": "🚀 Return initiated by user",
        "metadata": { "intakePath": "return", "reason": "defective" },
        "timestamp": "2026-06-13T14:23:45.000Z"
      }
    ]
  }
}
```

Returns up to 200 logs per item, sorted oldest-first. Access restricted to
item owner or admin role.

---

## Design Decisions

1. **Polling (not WebSocket)** — simpler for a hackathon. 2s interval is a
   good tradeoff. Socket.IO support is stubbed (`global.io.to(...)`) but not
   wired.

2. **Separate from lifecycle events** — lifecycle events are the tamper-evident
   audit log (fed into the Health Card hash chain in Phase 5). Dev logs are
   ephemeral, detailed, and auto-expire. Two different purposes.

3. **Never-throwing logger** — `ItemLogger.log` catches its own errors and
   warns to console. A broken log must never break the grading pipeline.

4. **Fallback grade when ML is down** — instead of leaving the item stuck in
   `GRADING` forever with a vague error, the pipeline now produces a
   `confidence: low` fallback grade (`Grade C / 50/100`) flagged for human
   review. The item progresses to `GRADED` and the status page renders the
   result, making it obvious that manual review is needed.

5. **Technical detail behind a toggle** — the sidebar stays scannable at the
   message level. Raw JSON payloads, model names, similarity scores, and stack
   traces are behind `▸ detail` so they don't overwhelm at first glance.
