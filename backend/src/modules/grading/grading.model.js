const mongoose = require('mongoose');

/**
 * Grade Model — stores the AI grading result (Grade JSON v1.43)
 * TODO: Expected fields (see contracts/grade.contract.js for full shape):
 *   - itemId: ObjectId
 *   - grade: String (A | B | C | D)
 *   - qualityScore: Number (0-100)
 *   - confidence: String (high | medium | low)
 *   - defects: [{ type, severity, location, description }]
 *   - missingEvidence: [String]
 *   - returnClaimVerified: Boolean
 *   - estimatedResalePct: Number (0.0-1.0)
 *   - routingHint: String (resell | refurbish | donate | liquidate)
 *   - rationale: String
 *   - modelVersions: { pass1Model, pass2Model, rekognitionVersion }
 *   - createdAt: Date
 */

const defectSchema = new mongoose.Schema({
  type: String,
  severity: { type: String, enum: ['minor', 'moderate', 'major'] },
  location: String,
  description: String,
}, { _id: false });

const gradingSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    grade: { type: String, enum: ['A', 'B', 'C', 'D'], required: true },
    qualityScore: { type: Number, min: 0, max: 100 },
    confidence: { type: String, enum: ['high', 'medium', 'low'] },
    defects: { type: [defectSchema], default: [] },
    missingEvidence: { type: [String], default: [] },
    returnClaimVerified: { type: Boolean, default: false },
    estimatedResalePct: { type: Number, min: 0, max: 1 },
    routingHint: { type: String, enum: ['resell', 'refurbish', 'donate', 'liquidate'] },
    rationale: { type: String },
    modelVersions: {
      pass1Model: String,
      pass2Model: String,
      rekognitionVersion: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Grade', gradingSchema);
