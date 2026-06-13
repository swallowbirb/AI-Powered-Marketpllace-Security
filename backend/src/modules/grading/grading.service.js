const axios = require('axios');
const mongoose = require('mongoose');

const Grade = require('./grading.model');
const { emitGraded } = require('./lifecycleEmitter');
const ItemLogger = require('../../utils/itemLogger');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const ML_TIMEOUT_MS = 30000; // Req 1.4 / 14.1 — 30s request timeout
const ML_GRADE_ENDPOINT = `${ML_SERVICE_URL}/grade/`;

// Configured Gemini models (mirrors ml-service config) — surfaced in logs so devs
// can see which model the pipeline is expected to call.
const GEMINI_PRIMARY = process.env.GEMINI_MODEL_PRIMARY || 'gemini-2.5-flash';
const GEMINI_FALLBACK = process.env.GEMINI_MODEL_FALLBACK || 'gemini-2.5-flash-lite';

/**
 * Emit detailed, technical logs reconstructed from an ML GradingResponse.
 * Surfaces fraud preflight, each parallel analysis (OpenCV / CLIP / Rekognition /
 * Textract), the Gemini model(s) used, and the synthesized grade fields.
 */
const logMlPipelineDetail = async (itemId, ml) => {
  // --- Fraud preflight ---
  const fraud = ml.fraud || (ml.analysis_summary && ml.analysis_summary.fraud) || {};
  if (fraud && Object.keys(fraud).length > 0) {
    const cls = fraud.classification || 'UNKNOWN';
    const icon = cls === 'HARD' ? 'FRAUD_DETECTED' : cls === 'SOFT' ? 'FRAUD_DETECTED' : 'FRAUD_PASS';
    await ItemLogger.log(itemId, icon === 'FRAUD_PASS' ? 'FRAUD_PASS' : 'FRAUD_RESULT',
      cls === 'CLEAN'
        ? '✅ Fraud preflight CLEAN — no signals'
        : `🛡️ Fraud preflight ${cls}${fraud.triggering_signal ? ` — ${fraud.triggering_signal}` : ''}`,
      {
        classification: cls,
        triggering_signal: fraud.triggering_signal,
        phash_match: fraud.phash_match,
        exif_has_camera_data: fraud.exif_has_camera_data,
        rekognition_web_match: fraud.rekognition_web_match,
        notes: fraud.notes,
      }
    );
  }

  const summary = ml.analysis_summary || {};
  const analyses = summary.analyses || {};

  // --- OpenCV color/histogram ---
  if (analyses.opencv_color) {
    const a = analyses.opencv_color;
    await ItemLogger.log(itemId, 'ANALYSIS_OPENCV',
      a.available
        ? `🎨 OpenCV color/histogram delta: ${a.color_histogram_delta}`
        : `🎨 OpenCV skipped (${a.reason || 'unavailable'})`,
      a
    );
  }

  // --- CLIP visual similarity ---
  if (analyses.clip_similarity) {
    const a = analyses.clip_similarity;
    const sim = a.similarity ?? a.max_similarity ?? a.score;
    await ItemLogger.log(itemId, 'ANALYSIS_CLIP',
      a.available === false
        ? `🧠 CLIP skipped (${a.reason || 'unavailable'})`
        : `🧠 CLIP visual similarity: ${sim != null ? `${(Number(sim) * 100).toFixed(1)}%` : 'n/a'}`,
      a
    );
  }

  // --- Rekognition labels ---
  if (analyses.rekognition) {
    const a = analyses.rekognition;
    const labelCount = (a.labels || []).length;
    const defectCount = (a.defect_candidates || []).length;
    const topLabels = (a.labels || []).slice(0, 5).map((l) => `${l.label}(${Math.round(l.confidence)}%)`);
    await ItemLogger.log(itemId, 'ANALYSIS_REKOGNITION',
      a.available
        ? `🏷️ Rekognition: ${labelCount} labels, ${defectCount} defect candidate(s). Top: ${topLabels.join(', ') || 'none'}`
        : `🏷️ Rekognition unavailable`,
      { labelCount, defectCount, topLabels, defect_candidates: a.defect_candidates }
    );
  }

  // --- Textract OCR ---
  if (analyses.textract) {
    const a = analyses.textract;
    const texts = a.extracted_text || [];
    await ItemLogger.log(itemId, 'ANALYSIS_TEXTRACT',
      a.available
        ? `🔤 Textract OCR: ${texts.length} line(s) extracted${texts.length ? ` — "${texts.slice(0, 3).join(' | ').slice(0, 80)}"` : ''}`
        : `🔤 Textract unavailable`,
      { lineCount: texts.length, sample: texts.slice(0, 10) }
    );
  }

  // --- Analysis warnings ---
  if (Array.isArray(summary.warnings) && summary.warnings.length > 0) {
    await ItemLogger.log(itemId, 'ANALYSIS_WARNING',
      `⚠️ Analysis warnings: ${summary.warnings.join(', ')}`,
      { warnings: summary.warnings }
    );
  }

  // --- Gemini model(s) used in Pass 2 ---
  const mv = ml.model_versions || {};
  if (mv.pass2Model || mv.pass1Model) {
    await ItemLogger.log(itemId, 'MODEL_INVOKE',
      `🤖 Gemini Pass 2 synthesized grade using ${mv.pass2Model || 'unknown model'}`,
      {
        pass1Model: mv.pass1Model,
        pass2Model: mv.pass2Model,
        rekognitionVersion: mv.rekognitionVersion,
      }
    );
  }
};

/**
 * Call the ML_Service grading pipeline.
 * @returns {Promise<object>} parsed GradingResponse
 * @throws on timeout / unreachable / non-2xx
 */

/**
 * Map an ML_Service GradingResponse (snake_case) into our Grade document shape.
 */
const mapMlResponseToGrade = (ml) => ({
  grade: ml.grade,
  qualityScore: typeof ml.quality_score === 'number' ? Math.round(ml.quality_score) : ml.quality_score,
  confidence: ml.confidence,
  defects: (ml.defects || []).map((d) => ({
    type: d.type,
    severity: d.severity,
    location: d.location || '',
    description: d.description || '',
  })),
  missingEvidence: ml.missing_evidence || [],
  returnClaimVerified: !!ml.return_claim_verified,
  estimatedResalePct: typeof ml.estimated_resale_pct === 'number' ? ml.estimated_resale_pct : 0,
  routingHint: ml.routing_hint,
  rationale: ml.rationale,
  modelVersions: ml.model_versions || {},
});

/**
 * Basic shape check that the ML response matches the GradingResponse contract (Req 14.4).
 */
const isValidMlResponse = (ml) => {
  if (!ml || typeof ml !== 'object') return false;
  const grades = ['A', 'B', 'C', 'D'];
  const confidences = ['high', 'medium', 'low'];
  const routes = ['resell', 'refurbish', 'donate', 'liquidate'];
  return (
    grades.includes(ml.grade) &&
    confidences.includes(ml.confidence) &&
    routes.includes(ml.routing_hint) &&
    typeof ml.rationale === 'string'
  );
};

/**
 * Build a fallback grade when the ML service is unreachable or returns garbage.
 * The item still completes the flow — it's flagged for human review with full
 * context so no work is lost.
 *
 * @param {object} payload - the grading payload (itemId, imageUrls, reason, category)
 * @param {string} failureReason - plain-English explanation of what failed
 */
const buildFallbackGrade = (payload, failureReason) => ({
  grade: 'C',
  quality_score: 50,
  confidence: 'low',
  defects: [],
  missing_evidence: ['AI grading unavailable — manual review required'],
  return_claim_verified: false,
  estimated_resale_pct: 0.3,
  routing_hint: 'refurbish',
  rationale: `Automated grading could not complete. Reason: ${failureReason}. ` +
    `This item has been flagged for human review. Evidence photos are preserved for manual inspection.`,
  model_versions: { fallback: 'manual-review-required' },
  analysis_summary: { fallback: true, failureReason },
  form_schema: {},
  prompts: {},
  fraud: {},
  status: 'ok',
});

/**
 * Call the ML_Service grading pipeline. Returns { data, ms } where ms is the
 * round-trip latency. Throws on timeout / unreachable / non-2xx.
 */
const callMlGrade = async (payload) => {
  const body = {
    item_id: payload.itemId,
    photos: payload.imageUrls,
    category: payload.category,
    return_claim_description: payload.reason,
    original_product_id: payload.productId,
    listing_image_urls: payload.listingImageUrls || [],
    catalog_hashes: payload.catalogHashes || [],
  };

  const startedAt = Date.now();
  const resp = await axios.post(ML_GRADE_ENDPOINT, body, {
    timeout: ML_TIMEOUT_MS,
    validateStatus: (s) => s >= 200 && s < 300,
  });
  return { data: resp.data, ms: Date.now() - startedAt };
};

/**
 * Persist a Grade + Evidence_Bundle and compute review/lifecycle state.
 * Replaces any existing grade for the same itemId (Req 8.6) — upsert.
 */
const persistGrade = async ({ payload, ml }) => {
  const mapped = mapMlResponseToGrade(ml);

  // Human-review escalation (Req 9.1 / 9.2).
  const flaggedForReview = mapped.confidence === 'low' || (mapped.missingEvidence || []).length > 0;
  let reviewReason = '';
  if (flaggedForReview) {
    reviewReason = mapped.confidence === 'low' ? 'low_confidence' : 'missing_evidence';
  }

  const doc = {
    itemId: payload.itemId,
    userId: mongoose.isValidObjectId(payload.userId) ? payload.userId : undefined,
    productId: mongoose.isValidObjectId(payload.productId) ? payload.productId : undefined,
    intakePath: payload.intakePath,
    ...mapped,
    evidenceBundle: {
      prompts: {
        pass1: (ml.prompts && ml.prompts.pass1) || '',
        pass2: (ml.prompts && ml.prompts.pass2) || '',
      },
      imageUrls: payload.imageUrls,
      analysisSummary: ml.analysis_summary || {},
      formSchema: ml.form_schema || {},
      fraud: ml.fraud || {},
    },
    flaggedForReview,
    reviewReason,
    lifecycleEmission: 'pending',
    status: ml.status === 'fraud_rejected' ? 'fraud_rejected' : 'ok',
  };

  // Upsert keyed by itemId so exactly one grade exists per item (Req 8.1 / 8.6).
  const saved = await Grade.findOneAndUpdate(
    { itemId: payload.itemId },
    { $set: doc },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  return saved;
};

/**
 * Trigger AI grading for an item.
 *
 * Service_Call_Contract (Phase 1 → Phase 2):
 *   triggerGrading(itemId, { evidencePhotos, category, originalProductId })
 *
 * Also accepts the full Grading_Request_Contract via the REST controller, which
 * passes a normalized payload object as the second argument.
 *
 * @param {string} itemId
 * @param {object} options
 * @returns {Promise<object>} the persisted Grade document
 */
const triggerGrading = async (itemId, options = {}) => {
  // Normalize both calling conventions into one payload.
  const productId = options.originalProductId || options.productId;
  const payload = {
    itemId,
    userId: options.userId,
    productId,
    reason: options.reason || options.returnClaimDescription || 'used item submission',
    imageUrls: options.evidencePhotos || options.imageUrls || [],
    intakePath: options.intakePath || 'sell-used',
    category: options.category,
    listingImageUrls: options.listingImageUrls || [],
    catalogHashes: options.catalogHashes || [],
  };

  // Backfill listing reference photos from the catalog when the caller didn't
  // supply them. The visual-comparison analyses (OpenCV colour delta, CLIP
  // similarity) need the original product photos as a reference; without them
  // those steps are skipped. attachEvidence only passes originalProductId, so we
  // resolve the product's catalog images here.
  if (payload.listingImageUrls.length === 0 && payload.productId &&
      mongoose.Types.ObjectId.isValid(payload.productId)) {
    try {
      const Product = require('../products/product.model');
      const product = await Product.findById(payload.productId).select('images').lean();
      if (product && Array.isArray(product.images) && product.images.length > 0) {
        payload.listingImageUrls = product.images;
        await ItemLogger.log(itemId, 'ANALYSIS_REFERENCE',
          `🖼️ Loaded ${product.images.length} listing reference photo(s) from the catalog ` +
          `for visual comparison.`,
          { phase: 'request', level: 'info', referenceCount: product.images.length,
            productId: String(payload.productId) }
        );
      }
    } catch (err) {
      await ItemLogger.log(itemId, 'ANALYSIS_REFERENCE',
        `⚠️ Could not load catalog reference photos — ${err.message || err}`,
        { phase: 'request', level: 'warn', productId: String(payload.productId) }
      );
    }
  }

  // --- Log the outgoing request (Req 1.4, 14) ---
  await ItemLogger.log(itemId, 'GRADING_REQUEST',
    `📡 POST ${ML_GRADE_ENDPOINT} — ${payload.imageUrls.length} evidence photo(s), ` +
    `${payload.listingImageUrls.length} listing reference photo(s)`,
    {
      endpoint: ML_GRADE_ENDPOINT,
      timeout_ms: ML_TIMEOUT_MS,
      category: payload.category || '(none)',
      reason: payload.reason,
      evidencePhotoCount: payload.imageUrls.length,
      listingReferenceCount: payload.listingImageUrls.length,
      hasCatalogHashes: payload.catalogHashes.length > 0,
      expectedPrimaryModel: GEMINI_PRIMARY,
      expectedFallbackModel: GEMINI_FALLBACK,
    }
  );

  if (payload.listingImageUrls.length === 0) {
    await ItemLogger.log(itemId, 'ANALYSIS_WARNING',
      '⚠️ No listing reference photos available for this product — visual comparison ' +
      '(OpenCV color delta, CLIP similarity) will be skipped. Grading proceeds on evidence photos alone.',
      { phase: 'request', level: 'warn', reason: 'no_reference_images' }
    );
  }

  // --- Call ML service ---
  let ml;
  let usedFallback = false;
  let ingestedTrace = false;

  try {
    await ItemLogger.log(itemId, 'FRAUD_CHECK',
      '🛡️ ML pipeline started: fraud preflight → parallel analysis → Gemini Pass 2...',
      { phase: 'request' });
    const { data, ms } = await callMlGrade(payload);
    ml = data;

    // Replay the ML service's internal step-by-step trace into the dev-log stream
    // BEFORE validation, so even a degraded/invalid response surfaces its detail.
    if (Array.isArray(ml.trace) && ml.trace.length > 0) {
      await ItemLogger.ingestTrace(itemId, ml.trace, { source: 'ml' });
      ingestedTrace = true;
    }

    await ItemLogger.log(itemId, 'GRADING_REQUEST',
      `📡 ML service responded in ${ms}ms (HTTP 200, status="${ml.status}")`,
      { phase: 'request', level: ml.status === 'ok' ? 'success' : 'warn', durationMs: ms, latency_ms: ms, status: ml.status });
  } catch (err) {
    // Build a human-readable reason for the specific failure mode.
    let reason;
    if (err.code === 'ECONNREFUSED') {
      reason = `ML service is not running at ${ML_SERVICE_URL} (ECONNREFUSED). Start it with: cd ml-service && uvicorn app.main:app --reload --port 8000`;
    } else if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      reason = `ML service timed out after ${ML_TIMEOUT_MS / 1000}s (${err.code}). Gemini or a downstream AWS service may be slow.`;
    } else if (err.response) {
      const body = err.response.data;
      const inner = body?.detail?.error || (typeof body?.detail === 'string' ? body.detail : null) || body?.message;
      reason = `ML service returned HTTP ${err.response.status}${inner ? `: ${inner}` : `: ${JSON.stringify(body)}`}`;
    } else {
      reason = `ML service unreachable — ${err.message} (${err.code || 'no code'})`;
    }

    // The ML service attaches its full internal trace to the error detail when a
    // stage fails (e.g. Gemini PERMISSION_DENIED in Pass 2). Replay it so the REAL
    // cause is visible in the sidebar — not just "HTTP 502".
    const errTrace = err.response?.data?.detail?.trace || err.response?.data?.trace;
    if (Array.isArray(errTrace) && errTrace.length > 0) {
      await ItemLogger.ingestTrace(itemId, errTrace, { source: 'ml' });
      ingestedTrace = true;
    }

    await ItemLogger.log(itemId, 'ML_UNAVAILABLE',
      `🔌 ML pipeline did not complete. Falling back to manual-review grade. ${reason}`,
      {
        phase: 'request',
        level: 'error',
        errorCode: err.code,
        errorMessage: err.message,
        httpStatus: err.response?.status,
        responseBody: err.response?.data,
        mlServiceUrl: ML_SERVICE_URL,
      }
    );

    ml = buildFallbackGrade(payload, reason);
    usedFallback = true;
  }

  // --- Validate ML response shape (Req 14.4) ---
  if (!isValidMlResponse(ml)) {
    const detail = `grade="${ml?.grade}", confidence="${ml?.confidence}", routing_hint="${ml?.routing_hint}", has_rationale=${typeof ml?.rationale === 'string'}`;
    await ItemLogger.log(itemId, 'ML_INVALID_RESPONSE',
      `⚠️ ML response failed shape validation (${detail}). Using fallback grade.`,
      { phase: 'request', level: 'warn', received: ml }
    );
    ml = buildFallbackGrade(payload, `Invalid response shape from ML service — ${detail}`);
    usedFallback = true;
  }

  // --- Detailed per-stage logging reconstructed from the response ---
  // Only needed when the ML service did not supply a structured trace (older ML
  // build); otherwise ingestTrace already covered every internal step.
  if (!usedFallback && !ingestedTrace) {
    await logMlPipelineDetail(itemId, ml);
  }

  // --- Persist grade + evidence bundle (Req 8) ---
  await ItemLogger.log(itemId, 'PERSIST_GRADE',
    `💾 Persisting grade to MongoDB (grade=${ml.grade}, score=${Math.round(ml.quality_score)}, ` +
    `confidence=${ml.confidence}, routing=${ml.routing_hint})`,
    {
      phase: 'persist',
      grade: ml.grade,
      qualityScore: Math.round(ml.quality_score),
      confidence: ml.confidence,
      routingHint: ml.routing_hint,
      returnClaimVerified: ml.return_claim_verified,
      estimatedResalePct: ml.estimated_resale_pct,
      defectCount: (ml.defects || []).length,
      missingEvidence: ml.missing_evidence,
      usedFallback,
    }
  );

  let saved;
  try {
    saved = await persistGrade({ payload, ml });
  } catch (err) {
    const detail = err.message || String(err);
    await ItemLogger.log(itemId, 'ERROR',
      `❌ PERSIST_GRADE: Failed to save grade to MongoDB — ${detail}`,
      { error: err.stack, itemId }
    );
    const e = new Error(`Failed to persist grade: ${detail}`);
    e.statusCode = 500;
    e.cause = err;
    throw e;
  }

  // --- Lifecycle emission (Req 10) ---
  // Emit GRADED only when not flagged and not a fraud rejection.
  if (!saved.flaggedForReview && saved.status === 'ok') {
    const emission = await emitGraded(String(saved.itemId), {
      gradeId: String(saved._id),
      grade: saved.grade,
      confidence: saved.confidence,
      routingHint: saved.routingHint,
    });
    if (emission.status !== saved.lifecycleEmission) {
      saved.lifecycleEmission = emission.status;
      await saved.save();
    }
    await ItemLogger.log(itemId, 'LIFECYCLE_EMIT',
      `⛓️ Lifecycle GRADED emission: ${emission.status}${emission.reason ? ` (${emission.reason})` : ''}`,
      { emission });
  } else {
    // Flagged grades withhold auto-routing; emission stays pending (skipped path).
    saved.lifecycleEmission = 'skipped';
    await saved.save();
    await ItemLogger.log(itemId, 'LIFECYCLE_EMIT',
      `⛓️ Lifecycle auto-emit skipped — grade ${saved.status === 'fraud_rejected' ? 'fraud-rejected' : 'flagged for human review'} (${saved.reviewReason || saved.status})`,
      { flaggedForReview: saved.flaggedForReview, reviewReason: saved.reviewReason, status: saved.status });
  }

  return saved;
};

const getGradeByItemId = async (itemId) => {
  if (!mongoose.isValidObjectId(itemId)) return null;
  return Grade.findOne({ itemId }).lean();
};

const getGradeById = async (gradeId) => {
  if (!mongoose.isValidObjectId(gradeId)) return null;
  return Grade.findById(gradeId).lean();
};

/**
 * Flagged-grade query for the seller/admin dashboard (Req 9.4).
 * Admin sees all flagged grades; a seller sees only grades they own (by userId).
 */
const getFlaggedGrades = async ({ role, userId }) => {
  const query = { flaggedForReview: true };
  if (role !== 'admin') {
    query.userId = userId;
  }
  return Grade.find(query).sort({ createdAt: -1 }).lean();
};

// --- Progressive form rendering (Task 2.11, Requirement 4) ---

// In-memory readiness store: itemId -> { status, schema }.
const _formState = new Map();

const GENERIC_FORM_FIELDS = {
  title: 'Item Condition Evidence',
  fields: [
    { id: 'front_photo', label: 'Front view', type: 'photo', required: true,
      guidance: 'Clear, well-lit photo of the front of the item.' },
    { id: 'back_photo', label: 'Back view', type: 'photo', required: true,
      guidance: 'Clear photo of the back of the item.' },
    { id: 'defect_photo', label: 'Close-up of any damage', type: 'photo', required: false,
      guidance: 'Close-up of any defect, wear, or damage.' },
    { id: 'condition_notes', label: 'Condition notes', type: 'text', required: false,
      guidance: 'Describe the condition or reason in your own words.' },
  ],
  photo_guidance: ['Use good lighting and a plain background.', 'Hold the camera steady to avoid blur.'],
  generated: false,
};

/**
 * Kick off Pass 1 form generation for an item (fire-and-forget).
 * Stores readiness state so the frontend can poll getForm.
 */
const startFormGeneration = async (itemId, { productId, reason, category, initialPhotos }) => {
  _formState.set(itemId, { status: 'pending', schema: null });
  await ItemLogger.log(itemId, 'PASS1_START',
    `📝 Pass 1 form generation requested (category=${category || 'unknown'}, ` +
    `${(initialPhotos || []).length} initial photo(s))`,
    { phase: 'pass1', endpoint: `${ML_SERVICE_URL}/grade/form` });
  try {
    const startedAt = Date.now();
    const resp = await axios.post(`${ML_SERVICE_URL}/grade/form`, {
      product_id: productId,
      reason,
      category,
      initial_photos: initialPhotos || [],
      listing_data: {},
    }, { timeout: ML_TIMEOUT_MS });
    const ms = Date.now() - startedAt;

    // Replay the ML service's Pass 1 internal trace (image fetches, Gemini call).
    if (Array.isArray(resp.data?.trace) && resp.data.trace.length > 0) {
      await ItemLogger.ingestTrace(itemId, resp.data.trace, { source: 'ml' });
    }

    const schema = resp.data.schema || resp.data;
    const fieldCount = Array.isArray(schema?.fields) ? schema.fields.length : 0;
    _formState.set(itemId, { status: 'ready', schema });
    await ItemLogger.log(itemId, 'PASS1_COMPLETE',
      `✅ Pass 1 form ready in ${ms}ms (status=${resp.data?.status || 'ready'}, ${fieldCount} field(s))`,
      { phase: 'pass1', level: 'success', durationMs: ms, status: resp.data?.status, fieldCount });
  } catch (err) {
    // Pass 1 failed irrecoverably -> serve generic default as ready (Req 4.5).
    const errTrace = err.response?.data?.detail?.trace || err.response?.data?.trace;
    if (Array.isArray(errTrace) && errTrace.length > 0) {
      await ItemLogger.ingestTrace(itemId, errTrace, { source: 'ml' });
    }
    _formState.set(itemId, { status: 'ready', schema: GENERIC_FORM_FIELDS });
    await ItemLogger.log(itemId, 'PASS1_FALLBACK',
      `⚠️ Pass 1 form generation failed (${err.code || err.response?.status || err.message}). ` +
      'Serving the generic default form so the user is never blocked.',
      { phase: 'pass1', level: 'warn', errorMessage: err.message, httpStatus: err.response?.status });
  }
};

/**
 * Return the current form for an item.
 * Before Pass 1 completes -> generic fields + status 'pending' (Req 4.1).
 * After Pass 1 completes -> AI Form_Schema + status 'ready' (Req 4.2/4.4).
 */
const getForm = (itemId) => {
  const state = _formState.get(itemId);
  if (!state || state.status === 'pending') {
    return { readiness: 'pending', schema: GENERIC_FORM_FIELDS };
  }
  return { readiness: 'ready', schema: state.schema || GENERIC_FORM_FIELDS };
};

/**
 * Health check — reports whether the ML_Service is reachable (Req 14.5).
 */
const checkMlHealth = async () => {
  try {
    const resp = await axios.get(`${ML_SERVICE_URL}/health`, { timeout: 5000 });
    return { mlServiceReachable: resp.status >= 200 && resp.status < 300, mlServiceUrl: ML_SERVICE_URL };
  } catch (_e) {
    return { mlServiceReachable: false, mlServiceUrl: ML_SERVICE_URL };
  }
};

module.exports = {
  triggerGrading,
  getGradeByItemId,
  getGradeById,
  getFlaggedGrades,
  checkMlHealth,
  startFormGeneration,
  getForm,
};
