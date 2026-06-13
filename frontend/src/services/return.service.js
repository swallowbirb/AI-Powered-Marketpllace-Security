import api from './api';

export const initiateReturn = async ({ orderId, reasonCode, reasonText }) => {
  const response = await api.post('/returns', { orderId, reasonCode, reasonText });
  return response.data;
};

export const submitReturnEvidence = async (itemId, photos) => {
  const response = await api.post(`/returns/${itemId}/evidence`, { photos });
  return response.data;
};

export const getMyReturns = async () => {
  const response = await api.get('/returns/my');
  return response.data;
};

export const getReturnById = async (returnId) => {
  const response = await api.get(`/returns/${returnId}`);
  return response.data;
};
