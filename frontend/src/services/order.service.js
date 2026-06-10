import api from './api';

export const createOrder = async ({ productId, offerId, quantity = 1, mockCreditCard }) => {
  try {
    const response = await api.post('/orders', { productId, offerId, quantity, mockCreditCard });
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const getBuyerOrders = async (page = 1, limit = 20) => {
  const response = await api.get('/orders/my', { params: { page, limit } });
  return response.data;
};

export const getSellerOrders = async (page = 1, limit = 20) => {
  const response = await api.get('/orders/seller', { params: { page, limit } });
  return response.data;
};
