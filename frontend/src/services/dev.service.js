import api from './api';

export const eraseAllData = async () => {
  const response = await api.delete('/dev/erase');
  return response.data;
};

export const populateFakeStore = async () => {
  const response = await api.post('/dev/populate');
  return response.data;
};

export const downloadDatabaseSnapshot = async () => {
  // We use standard fetch or window.open because it's a file download.
  // Using axios for downloads requires blob handling.
  try {
    const response = await api.get('/dev/save', { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'marketplace-snapshot.json');
    document.body.appendChild(link);
    link.click();
    link.parentNode.removeChild(link);
    return { success: true };
  } catch (error) {
    console.error('Error downloading snapshot:', error);
    return { success: false, message: 'Download failed' };
  }
};
