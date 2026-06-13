const mongoose = require('mongoose');

const ITEM_STATUSES = [
  'INITIATED',
  'EVIDENCE_PENDING',
  'GRADING',
  'GRADED',
  'ROUTED',
  'IN_TRANSIT',
  'LISTED',
  'SOLD',
  'DONATED',
  'LIQUIDATED',
  'REJECTED',
  'CANCELLED',
];

const REASON_CODES = [
  'defective',
  'not_as_described',
  'changed_mind',
  'wrong_item',
  'other',
];

const itemSchema = new mongoose.Schema(
  {
    intakePath: {
      type: String,
      enum: ['return', 'sell-used'],
      required: true,
    },
    initiatorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Source records — exactly one will be set
    returnId: { type: mongoose.Schema.Types.ObjectId, ref: 'Return', default: null },
    secondhandId: { type: mongoose.Schema.Types.ObjectId, ref: 'SecondhandItem', default: null },

    // Snapshot from the order/product at intake time
    originalOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    originalProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    category: { type: String, trim: true },

    // User-provided context
    reasonCode: { type: String, enum: REASON_CODES },
    reasonText: { type: String, trim: true },
    description: { type: String, trim: true },

    // Evidence collected during intake
    evidencePhotos: { type: [String], default: [] },

    // State machine
    status: {
      type: String,
      enum: ITEM_STATUSES,
      default: 'INITIATED',
      index: true,
    },

    // Trust context — snapshotted at submission time (Phase 3 fills in)
    trustTierAtSubmission: { type: String, default: null },

    // Forward refs — populated by later phases
    gradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade', default: null },
    routingDecisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'RoutingDecision', default: null },
    healthCardId: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthCard', default: null },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  },
  { timestamps: true }
);

itemSchema.index({ initiatorUserId: 1, createdAt: -1 });
itemSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Item', itemSchema);
module.exports.ITEM_STATUSES = ITEM_STATUSES;
