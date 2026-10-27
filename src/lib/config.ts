const env = import.meta.env;
export const apiBaseUrl = (env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
export const mongoApiEnabled = Boolean(apiBaseUrl);
export const firebaseEnabled = false;
export const modeLabel = mongoApiEnabled
  ? 'MongoDB Atlas · API configured'
  : 'Local demo mode · saved in this browser';
