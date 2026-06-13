import api from './api';

export const getItemById = async (itemId) => {
  const response = await api.get(`/items/${itemId}`);
  return response.data;
};

export const getMyItems = async () => {
  const response = await api.get('/items/my');
  return response.data;
};

export const getPresignedUrl = async ({ fileName, contentType, itemId }) => {
  const response = await api.post('/uploads/presign', { fileName, contentType, itemId });
  return response.data;
};

/**
 * Upload a File object directly to S3 via presigned URL.
 * Returns the public S3 URL.
 */
export const uploadToS3 = async (file, itemId) => {
  const { data } = await getPresignedUrl({
    fileName: file.name,
    contentType: file.type,
    itemId,
  });

  await fetch(data.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  return data.publicUrl;
};
