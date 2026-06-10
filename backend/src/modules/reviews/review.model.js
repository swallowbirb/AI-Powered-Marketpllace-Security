const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Denormalized for efficient graph queries (avoid extra joins)
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    title: {
      type: String,
      trim: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    // Did the buyer actually place an order for this product?
    isVerifiedPurchase: {
      type: Boolean,
      default: false,
    },

    // AI Analysis fields (populated by ML microservice in Phase 4)
    reviewRS: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
    // Derived risk level from reviewRS thresholds
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high', null],
      default: null,
    },
    isFlagged: {
      type: Boolean,
      default: false,
      index: true,
    },
    // e.g. ["text_similarity_high", "burst_timing", "graph_cluster"]
    flagReasons: {
      type: [String],
      default: [],
    },

    // Graph node metadata — Device/IP for reviewer graph analysis
    deviceFingerprint: {
      type: String,
    },
    ipAddress: {
      type: String,
    },

    // Admin moderation
    isRemoved: {
      type: Boolean,
      default: false,
    },
    removedReason: {
      type: String,
    },
  },
  { timestamps: true }
);

// One review per buyer per product (compound unique index)
reviewSchema.index({ productId: 1, buyerId: 1 }, { unique: true });
reviewSchema.index({ riskLevel: 1 });

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
