export const API_BASE = process.env.REACT_APP_API_BASE || `${window.location.protocol}//${window.location.hostname}:8000`;
export const apiUrl = (path) => `${API_BASE}${path}`; 