const orderService = require('./order.service');

const createOrder = async (req, res, next) => {
  try {
    const buyerId = req.user._id;
    const { productId, offerId, quantity = 1, mockCreditCard } = req.body;

    const order = await orderService.createOrder({ buyerId, productId, offerId, quantity, mockCreditCard });

    res.status(201).json({ success: true, data: order });
  } catch (error) {
    if (error.message === 'Product not found') {
      return res.status(404).json({ success: false, message: error.message });
    }
    if (error.message === 'Product is not available for purchase') {
      console.error('Order creation error:', error.message, req.body);
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error('Order creation unknown error:', error);
    next(error);
  }
};

const getBuyerOrders = async (req, res, next) => {
  try {
    const buyerId = req.user._id;
    const { page = 1, limit = 20 } = req.query;

    const result = await orderService.getBuyerOrders(buyerId, Number(page), Number(limit));
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getSellerOrders = async (req, res, next) => {
  try {
    const sellerId = req.user._id;
    const { page = 1, limit = 20 } = req.query;

    const result = await orderService.getSellerOrders(sellerId, Number(page), Number(limit));
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createOrder,
  getBuyerOrders,
  getSellerOrders,
};
