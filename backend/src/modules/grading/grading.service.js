const axios = require('axios');
const mongoose = require('mongoose');

const Grade = require('./grading.model');
const { emitGraded } = require('./lifecycleEmitter');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const ML_TIMEOUT_MS = 30000; // Req 1.4 / 14.1 — 30s request timeout

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
 * Call the ML_Service grading pipeline.
 * @returns {Promise<object>} parsed GradingResponse
 * @throws on timeout / unreachable / non-2xx
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

  const resp = await axios.post(`${ML_SERVICE_URL}/grade/`, body, {
    timeout: ML_TIMEOUT_MS,
    validateStatus: (s) => s >= 200 && s < 300,
  });
  return resp.data;
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
  const payload = {
    itemId,
    userId: options.userId,
    productId: options.originalProductId || options.productId,
    reason: options.reason || options.returnClaimDescription || 'used item submission',
    imageUrls: options.evidencePhotos || options.imageUrls || [],
    intakePath: options.intakePath || 'sell-used',
    category: options.category,
    listingImageUrls: options.listingImageUrls || [],
    catalogHashes: options.catalogHashes || [],
  };

  // --- Call ML service (Req 1.4, 14) ---
  let ml;
  try {
    ml = await callMlGrade(payload);
  } catch (err) {
    const reason = err.code === 'ECONNABORTED' ? 'timeout' : (err.code || 'unreachable');
    const e = new Error(`Grading pipeline unavailable (${reason})`);
    e.statusCode = 503;
    throw e;
  }

  // --- Validate ML response shape (Req 14.4) ---
  if (!isValidMlResponse(ml)) {
    const e = new Error('Grading pipeline returned an invalid response');
    e.statusCode = 502;
    throw e;
  }

  // --- Persist grade + evidence bundle (Req 8) ---
  let saved;
  try {
    saved = await persistGrade({ payload, ml });
  } catch (err) {
    const e = new Error('Failed to persist grade');
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
  } else {
    // Flagged grades withhold auto-routing; emission stays pending (skipped path).
    saved.lifecycleEmission = 'skipped';
    await saved.save();
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
  try {
    const resp = await axios.post(`${ML_SERVICE_URL}/grade/form`, {
      product_id: productId,
      reason,
      category,
      initial_photos: initialPhotos || [],
      listing_data: {},
    }, { timeout: ML_TIMEOUT_MS });
    _formState.set(itemId, { status: 'ready', schema: resp.data.schema || resp.data });
  } catch (_e) {
    // Pass 1 failed irrecoverably -> serve generic default as ready (Req 4.5).
    _formState.set(itemId, { status: 'ready', schema: GENERIC_FORM_FIELDS });
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
