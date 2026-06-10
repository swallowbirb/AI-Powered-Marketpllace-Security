const mongoose = require('mongoose');

/**
 * Lightweight order model.
 * We're NOT building a full checkout/payment system.
 * Orders are simulated — clicking "Buy Now" creates a record instantly.
 * Purpose: establish purchase legitimacy for reviews + sales velocity for anomaly detection.
 */
const orderSchema = new mongoose.Schema(
  {
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Denormalized from product — avoids extra join on every order query
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      index: true,
      default: null,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    // Price at time of purchase (product price × quantity)
    totalPrice: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['completed', 'cancelled', 'refunded'],
      default: 'completed',
    },
    paymentDetails: {
      mockCreditCard: {
        type: String,
        required: true,
      },
    },
    // Populated when the order was placed via a catalog entry offer (catalog path).
    // Null for standalone product orders (existing behavior).
    offerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SellerOffer',
      default: null,
    },
    catalogEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BrandCatalogEntry',
      default: null,
    },
  },
  { timestamps: true } // createdAt = order date, used for velocity calculation
);

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
