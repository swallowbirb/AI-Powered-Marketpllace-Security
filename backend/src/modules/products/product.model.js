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
    images: {
      type: [String],
      default: [],
    },
    // Seller's free-text brand claim
    brandName: {
      type: String,
      trim: true,
    },
    // Optional link to a registered Brand document
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Brand',
      default: null,
    },
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
    // Sales metrics
    totalSales: {
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
      enum: ['pending', 'published', 'approved', 'flagged', 'rejected'],
      default: 'approved',
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
