export const API_BASE = process.env.REACT_APP_API_BASE || `${window.location.protocol}//${window.location.hostname}:8000`;
export const apiUrl = (path) => `${API_BASE}${path}`; 

// Helper to extract a user-visible message from API error payloads
export function extractError(data) {
	if (!data) return null;
	if (typeof data === 'string') return data;
	// FastAPI validation errors often put an array in detail
	if (data.detail) {
		if (typeof data.detail === 'string') return data.detail;
		if (Array.isArray(data.detail)) {
			return data.detail.map(d => (d && (d.msg || d.message)) ? (d.msg || d.message) : JSON.stringify(d)).join('; ');
		}
		return JSON.stringify(data.detail);
	}
	if (data.error) return typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
	return JSON.stringify(data);
}