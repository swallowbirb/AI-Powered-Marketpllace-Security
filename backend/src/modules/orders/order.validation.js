const mongoose = require('mongoose');

const validateCreateOrder = (req, res, next) => {
  const { productId, offerId, quantity, mockCreditCard } = req.body;
  const errors = [];

  if (!productId && !offerId) {
    errors.push('Either productId or offerId is required');
  }

  if (productId && !mongoose.Types.ObjectId.isValid(productId)) {
    errors.push('productId must be a valid ID');
  }

  if (offerId && !mongoose.Types.ObjectId.isValid(offerId)) {
    errors.push('offerId must be a valid ID');
  }

  if (quantity !== undefined && (typeof quantity !== 'number' || quantity < 1 || !Number.isInteger(quantity))) {
    errors.push('quantity must be a positive integer');
  }

  if (!mockCreditCard || typeof mockCreditCard !== 'string') {
    errors.push('mockCreditCard is required as a string for payment simulation');
  }

  if (errors.length > 0) {
    console.error('Order validation failed:', errors, req.body);
    return res.status(400).json({ success: false, message: 'Validation failed', errors });
  }

  next();
};

module.exports = { validateCreateOrder };
