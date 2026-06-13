const Item = require('./item.model');
const { appendEvent } = require('../lifecycle/lifecycle.service');

// Allowed state machine transitions
const ALLOWED_TRANSITIONS = {
  INITIATED: ['EVIDENCE_PENDING', 'CANCELLED'],
  EVIDENCE_PENDING: ['GRADING', 'CANCELLED'],
  GRADING: ['GRADED', 'REJECTED'],       // Phase 2 drives these
  GRADED: ['ROUTED'],                     // Phase 4
  ROUTED: ['IN_TRANSIT', 'DONATED'],      // Phase 4 → 8
  IN_TRANSIT: ['LISTED', 'LIQUIDATED'],   // Phase 5 / ops
  LISTED: ['SOLD', 'LIQUIDATED'],         // Phase 5
};

/**
 * Transition an item's status. Validates against allowed transitions table.
 */
const transitionStatus = async (itemId, nextStatus, actor, eventData = {}) => {
  const item = await Item.findById(itemId);
  if (!item) throw new Error('Item not found');

  const allowed = ALLOWED_TRANSITIONS[item.status] || [];
  if (!allowed.includes(nextStatus)) {
    throw new Error(`Invalid transition: ${item.status} → ${nextStatus}`);
  }

  item.status = nextStatus;
  await item.save();

  await appendEvent(itemId, nextStatus, actor, eventData);

  return item;
};

/**
 * Create a new Item with status INITIATED and write the first lifecycle event.
 */
const createItem = async (data, actor) => {
  const item = await Item.create({ ...data, status: 'INITIATED' });
  await appendEvent(item._id, 'INITIATED', actor, { intakePath: data.intakePath });
  return item;
};

/**
 * Attach evidence photos and transition INITIATED → EVIDENCE_PENDING → GRADING.
 * Fire-and-forgets gradingService.triggerGrading — never throws on grading failure.
 */
const attachEvidence = async (itemId, photos, actor) => {
  const item = await Item.findById(itemId);
  if (!item) throw new Error('Item not found');

  // Allow re-submission if item got stuck mid-transition (e.g. after a previous failed request)
  const attachableStatuses = ['INITIATED', 'EVIDENCE_PENDING'];
  if (!attachableStatuses.includes(item.status)) {
    throw new Error(`Cannot attach evidence when item is in status: ${item.status}`);
  }
  if (!photos || photos.length === 0) {
    throw new Error('At least one photo is required');
  }

  // Append photos (avoid duplicates on re-submit)
  const existingUrls = new Set(item.evidencePhotos.map(String));
  const newPhotos = photos.filter((p) => !existingUrls.has(String(p)));
  if (newPhotos.length > 0) item.evidencePhotos.push(...newPhotos);

  // Transition to EVIDENCE_PENDING only if not already past it
  if (item.status === 'INITIATED') {
    item.status = 'EVIDENCE_PENDING';
    await item.save();
    await appendEvent(itemId, 'EVIDENCE_SUBMITTED', actor, { photoCount: photos.length });
  } else {
    // Already EVIDENCE_PENDING — just save the new photos
    await item.save();
  }

  // Transition to GRADING
  item.status = 'GRADING';
  await item.save();
  await appendEvent(itemId, 'GRADING', actor, { triggeredAt: new Date() });

  // Fire-and-forget grading pipeline (Phase 2 implements this)
  try {
    const gradingService = require('../grading/grading.service');
    gradingService.triggerGrading(item._id.toString(), {
      evidencePhotos: item.evidencePhotos,
      category: item.category,
      originalProductId: item.originalProductId?.toString() || null,
    }).catch((err) => {
      console.warn(`[items] gradingService.triggerGrading failed (non-blocking):`, err.message);
    });
  } catch (err) {
    console.warn('[items] gradingService not yet implemented — skipping trigger');
  }

  return item;
};

/**
 * Get a single item by ID with populated phase refs.
 */
const getItemById = async (itemId) => {
  return Item.findById(itemId)
    .populate('originalProductId', 'title images category price')
    .populate('originalOrderId', 'totalPrice createdAt')
    .populate('gradeId')
    .lean();
};

/**
 * Get all items for a user across both intake paths.
 */
const getItemsByUser = async (userId) => {
  return Item.find({ initiatorUserId: userId })
    .populate('originalProductId', 'title images category')
    .sort({ createdAt: -1 })
    .lean();
};

module.exports = {
  createItem,
  transitionStatus,
  attachEvidence,
  getItemById,
  getItemsByUser,
};
