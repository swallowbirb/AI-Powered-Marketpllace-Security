import api from './api';

export const initiateFromOrder = async ({ orderId, description, askingPrice }) => {
  const response = await api.post('/secondhand/from-order', { orderId, description, askingPrice });
  return response.data;
};

export const submitSecondhandEvidence = async (itemId, photos) => {
  const response = await api.post(`/secondhand/${itemId}/evidence`, { photos });
  return response.data;
};

export const getMySecondhandListings = async () => {
  const response = await api.get('/secondhand/my');
  return response.data;
};
