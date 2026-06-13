const mongoose = require('mongoose');

/**
 * SecondhandItem Model
 * TODO: Expected fields:
 *   - userId: ObjectId (ref: User) — seller who is listing
 *   - category: String
 *   - title: String
 *   - description: String
 *   - photos: [String] (S3 URLs)
 *   - status: String (enum: draft | submitted | grading | graded | listed | sold | rejected)
 *   - gradeId: ObjectId (ref: Grade)
 *   - routingDecisionId: ObjectId (ref: RoutingDecision)
 *   - listingId: ObjectId (ref: Listing)
 *   - askingPrice: Number
 *   - acceptedPrice: Number
 *   - createdAt / updatedAt: Date
 */

const secondhandSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, required: true, trim: true },
    title: { type: String, trim: true },
    description: { type: String, trim: true },
    photos: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['draft', 'submitted', 'grading', 'graded', 'listed', 'sold', 'rejected'],
      default: 'draft',
      index: true,
    },
    gradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade' },
    routingDecisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'RoutingDecision' },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing' },
    askingPrice: { type: Number, min: 0 },
    acceptedPrice: { type: Number, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SecondhandItem', secondhandSchema);
