const express = require('express');
const router = express.Router();
const orderController = require('./order.controller');
const { validateCreateOrder } = require('./order.validation');
const { requireAuth, attachUser, requireRole } = require('../../middleware/auth.middleware');

const buyerAuth = [requireAuth, attachUser, requireRole(['buyer'])];
const sellerAuth = [requireAuth, attachUser, requireRole(['seller', 'admin'])];

// POST /api/orders — Buyer places an order ("Buy Now")
router.post('/', buyerAuth, validateCreateOrder, orderController.createOrder);

// GET /api/orders/my — Buyer gets their order history
router.get('/my', buyerAuth, orderController.getBuyerOrders);

// GET /api/orders/seller — Seller gets orders for their products
router.get('/seller', sellerAuth, orderController.getSellerOrders);

module.exports = router;
