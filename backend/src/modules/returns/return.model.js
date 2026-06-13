const mongoose = require('mongoose');

/**
 * Return Model
 * TODO: Expected fields:
 *   - orderId: ObjectId (ref: Order)
 *   - userId: ObjectId (ref: User)
 *   - itemId: ObjectId (ref: Item)
 *   - reason: String (enum: defective | not_as_described | changed_mind | wrong_item | other)
 *   - status: String (enum: initiated | evidence_submitted | under_review | approved | rejected | completed)
 *   - evidencePhotos: [String] (S3 URLs)
 *   - claimDescription: String
 *   - gradeId: ObjectId (ref: Grade) — populated after AI grading
 *   - routingDecisionId: ObjectId (ref: RoutingDecision)
 *   - refundAmount: Number
 *   - createdAt / updatedAt: Date
 */

const returnSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
    reason: {
      type: String,
      enum: ['defective', 'not_as_described', 'changed_mind', 'wrong_item', 'other'],
      required: true,
    },
    status: {
      type: String,
      enum: ['initiated', 'evidence_submitted', 'under_review', 'approved', 'rejected', 'completed'],
      default: 'initiated',
      index: true,
    },
    evidencePhotos: { type: [String], default: [] },
    claimDescription: { type: String, trim: true },
    gradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade' },
    routingDecisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'RoutingDecision' },
    refundAmount: { type: Number, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Return', returnSchema);
