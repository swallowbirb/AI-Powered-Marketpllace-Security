const Return = require('./return.model');
const Order = require('../orders/order.model');
const itemService = require('../items/item.service');
const { getEventsByItemId } = require('../lifecycle/lifecycle.service');

const RETURN_WINDOW_DAYS = 30;

/**
 * Initiate a return for a completed order.
 */
const initiateReturn = async (userId, { orderId, reasonCode, reasonText }) => {
  // Verify order belongs to user and is completed
  const order = await Order.findOne({ _id: orderId, buyerId: userId, status: 'completed' })
    .populate('productId', 'title category')
    .populate('catalogEntryId', 'title category')
    .lean();

  if (!order) throw new Error('Order not found or not eligible for return');

  // Enforce return window
  const daysSinceOrder = (Date.now() - new Date(order.createdAt)) / (1000 * 60 * 60 * 24);
  if (daysSinceOrder > RETURN_WINDOW_DAYS) {
    throw new Error(`Return window expired (${RETURN_WINDOW_DAYS} days)`);
  }

  // Check no active return already exists for this order
  const existing = await Return.findOne({ orderId, userId });
  if (existing) throw new Error('A return already exists for this order');

  // Resolve product info
  const isCatalog = !!order.catalogEntryId;
  const productTitle = isCatalog ? order.catalogEntryId?.title : order.productId?.title;
  const productCategory = isCatalog ? order.catalogEntryId?.category : order.productId?.category;

  // Snapshot trust tier (Phase 3 fills this — graceful fallback)
  let trustTierAtSubmission = null;
  try {
    const trustService = require('../trust/trust.service');
    const profile = await trustService.getTrustProfile(userId);
    if (profile) trustTierAtSubmission = profile.tier;
  } catch {
    // Phase 3 not yet implemented — continue
  }

  const actor = { userId, role: 'buyer' };

  // Create the shared Item (convergence model)
  const item = await itemService.createItem(
    {
      intakePath: 'return',
      initiatorUserId: userId,
      originalOrderId: orderId,
      originalProductId: isCatalog ? null : order.productId?._id,
      category: productCategory,
      reasonCode,
      reasonText,
      trustTierAtSubmission,
    },
    actor
  );

  // Create the Return record
  const returnRecord = await Return.create({
    orderId,
    userId,
    itemId: item._id,
    reasonCode,
    reasonText,
    originalProductId: isCatalog ? null : order.productId?._id,
    originalCatalogEntryId: isCatalog ? order.catalogEntryId?._id : null,
    productTitle,
    productCategory,
    orderTotal: order.totalPrice,
  });

  // Back-link the item to the return record
  await require('../items/item.model').findByIdAndUpdate(item._id, { returnId: returnRecord._id });

  return { itemId: item._id, returnId: returnRecord._id, status: item.status };
};

/**
 * Attach evidence photos and trigger grading.
 */
const submitEvidence = async (userId, itemId, photos) => {
  const item = await require('../items/item.model').findById(itemId).lean();
  if (!item) throw new Error('Item not found');
  if (item.initiatorUserId.toString() !== userId.toString()) throw new Error('Forbidden');
  if (item.intakePath !== 'return') throw new Error('Item is not a return');

  return itemService.attachEvidence(itemId, photos, { userId, role: 'buyer' });
};

/**
 * Get all returns for a buyer, with item populated.
 */
const getReturnsByUser = async (userId) => {
  return Return.find({ userId })
    .populate('orderId', 'totalPrice createdAt')
    .populate('itemId')
    .sort({ createdAt: -1 })
    .lean();
};

/**
 * Get a single return with full item + lifecycle events.
 */
const getReturnById = async (returnId, userId) => {
  const returnRecord = await Return.findById(returnId)
    .populate('orderId', 'totalPrice createdAt')
    .populate('itemId')
    .lean();

  if (!returnRecord) return null;
  if (returnRecord.userId.toString() !== userId.toString()) throw new Error('Forbidden');

  const events = returnRecord.itemId
    ? await getEventsByItemId(returnRecord.itemId._id)
    : [];

  return { ...returnRecord, lifecycleEvents: events };
};

module.exports = { initiateReturn, submitEvidence, getReturnsByUser, getReturnById };
