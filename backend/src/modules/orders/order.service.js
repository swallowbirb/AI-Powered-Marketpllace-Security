const Order = require('./order.model');
const Product = require('../products/product.model');
const SellerOffer = require('../offers/sellerOffer.model');
const BrandCatalogEntry = require('../brandCatalog/brandCatalogEntry.model');

/**
 * Create a simulated order ("Buy Now").
 *
 * Supports two paths:
 *   1. Catalog path: { buyerId, offerId, quantity }
 *      - Resolves price and sellerId from the SellerOffer
 *      - productId is null; offerId is populated
 *   2. Standalone path: { buyerId, productId, quantity }
 *      - Original behavior: price and sellerId from the Product
 *      - offerId is null
 */
const createOrder = async ({ buyerId, productId, offerId, quantity, mockCreditCard }) => {
  // ── Catalog path ──────────────────────────────────────────────────────────
  if (offerId) {
    const offer = await SellerOffer.findById(offerId)
      .populate('catalogEntryId')
      .lean();
    if (!offer) throw new Error('Offer not found');
    if (offer.status !== 'active') throw new Error('Offer is not available for purchase');

    const totalPrice = offer.price * quantity;

    const order = await Order.create({
      buyerId,
      sellerId: offer.sellerId,
      productId: null,
      offerId: offer._id,
      catalogEntryId: offer.catalogEntryId._id,
      quantity,
      totalPrice,
      status: 'completed',
      paymentDetails: { mockCreditCard },
    });

    return order;
  }

  // ── Standalone path (original behavior) ──────────────────────────────────
  const product = await Product.findById(productId).lean();
  if (!product) {
    throw new Error('Product not found');
  }
  if (product.status !== 'published' && product.status !== 'approved') {
    throw new Error('Product is not available for purchase');
  }
  if (product.banned || product.suspended) {
    throw new Error('Product is not available for purchase');
  }

  const totalPrice = product.price * quantity;

  const order = await Order.create({
    buyerId,
    sellerId: product.sellerId,
    productId,
    quantity,
    totalPrice,
    status: 'completed',
    paymentDetails: { mockCreditCard },
  });

  // Increment product's total sales count
  await Product.findByIdAndUpdate(productId, { $inc: { totalSales: quantity } });

  return order;
};

/**
 * Get order history for the authenticated buyer.
 */
const getBuyerOrders = async (buyerId, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;

  const [orders, total] = await Promise.all([
    Order.find({ buyerId })
      .populate('productId', 'title images price category')
      .populate('catalogEntryId', 'title officialImages brandId')
      .populate('sellerId', 'firstName lastName storeName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments({ buyerId }),
  ]);

  return { orders, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * Get orders for a seller's products.
 */
const getSellerOrders = async (sellerId, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;

  const [orders, total] = await Promise.all([
    Order.find({ sellerId })
      .populate('productId', 'title images price')
      .populate('buyerId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments({ sellerId }),
  ]);

  return { orders, total, page, limit, totalPages: Math.ceil(total / limit) };
};

module.exports = {
  createOrder,
  getBuyerOrders,
  getSellerOrders,
};
