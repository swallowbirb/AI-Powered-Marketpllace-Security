const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    // Array of image URLs — needed for MLLM image-text verification
    images: {
      type: [String],
      default: [],
    },
    // Seller's free-text brand claim — the honeypot field for counterfeit detection.
    // AI Hook: cross-referenced against BrandCatalogEntry in Phase 4.
    brandName: {
      type: String,
      trim: true,
    },
    // Optional link to a registered Brand document (resolved from brandName)
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Brand',
      default: null,
    },
    // AI-auto-matched catalog entry when brandName resolves to a registered brand
    // Null until Phase 4 AI runs the similarity check
    claimedCatalogEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BrandCatalogEntry',
      default: null,
    },
    // AI-assigned similarity score (0-100) between this product and the claimed catalog entry
    // Null until Phase 4 AI assigns it
    catalogMatchScore: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
    // Condition — used by AI to avoid flagging used items under strict brand gates
    condition: {
      type: String,
      enum: ['New', 'Used'],
      default: 'New',
    },
    // Denormalized review stats
    averageRating: {
      type: Number,
      default: 0,
    },
    reviewCount: {
      type: Number,
      default: 0,
    },
    // Sales metrics for transactional anomaly detection (IsolationForest)
    totalSales: {
      type: Number,
      default: 0,
    },
    salesVelocity: {
      type: Number,
      default: 0,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending_review', 'pending', 'published', 'approved', 'flagged', 'rejected'],
      default: 'approved',
      index: true,
    },
    // Risk Score — to be assigned by AI in Phase 3 (null until then)
    productRS: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
    // Derived from productRS thresholds: 0-39=low, 40-69=medium, 70-100=high
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high', null],
      default: null,
      index: true,
    },
    // Hard block — removed from all public views
    banned: {
      type: Boolean,
      default: false,
    },
    // Soft block — temporarily hidden, can be reinstated
    suspended: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
