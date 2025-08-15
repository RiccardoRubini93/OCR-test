import React, { useState } from 'react';
import { apiUrl, extractError } from './api';

const accentGradient = 'linear-gradient(90deg, #a259ff 0%, #4f8cff 100%)';
const accentText = {
  background: accentGradient,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  fontWeight: 700,
};

function QueryTexts({ projectId }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResults([]);
    try {
      const url = projectId
        ? `${apiUrl('/texts/search')}?q=${encodeURIComponent(query)}&project_id=${encodeURIComponent(projectId)}`
        : `${apiUrl('/texts/search')}?q=${encodeURIComponent(query)}`;
      const res = await fetch(url);
      const data = await res.json();
      setResults(data);
    } catch (err) {
      setError('Failed to fetch search results');
    }
    setLoading(false);
  };

  const handleDeleteText = async (textId) => {
    if (!confirm('Are you sure you want to delete this text? This action cannot be undone.')) {
      return;
    }

    try {
      const res = await fetch(apiUrl(`/texts/${textId}`), {
        method: 'DELETE',
      });
      
      if (res.ok) {
        setResults(prev => prev.filter(t => t.id !== textId));
      } else {
        const data = await res.json();
        setError(extractError(data) || 'Failed to delete text');
      }
    } catch (err) {
      setError('Network error while deleting text');
    }
  };

  return (
    <div className="main-responsive-box" style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '0 5vw' }}>
      <h2 style={{ fontSize: 38, marginBottom: 32, ...accentText }}>Query OCR Texts</h2>
      <form onSubmit={handleSearch} className="row g-2 align-items-center mb-4" style={{ marginBottom: 32 }}>
        <div className="col-12 col-md-9 mb-2 mb-md-0">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search for text..."
            className="form-control bg-dark text-white"
            style={{ padding: 16, borderRadius: 12, border: '2px solid #4f8cff', fontSize: 18, fontWeight: 500 }}
          />
        </div>
        <div className="col-12 col-md-3 d-grid">
          <button type="submit" className="btn btn-primary" style={{ borderRadius: 12, padding: '14px 36px', fontWeight: 700, fontSize: 18 }}>
            Search
          </button>
        </div>
      </form>
      {loading && <div style={{ color: '#bfc9d9' }}>Loading...</div>}
      {error && <div style={{ color: '#e63946' }}>{error}</div>}
      {!loading && !error && results.length > 0 && (
        <div className="d-flex flex-column gap-4">
          {results.map((item) => (
            <div key={item.id} className="mx-auto w-100" style={{ background: '#191919', borderRadius: 20, boxShadow: '0 2px 12px rgba(162,89,255,0.08)', padding: 32, color: '#fff', fontSize: 18, fontWeight: 500, maxWidth: 900, border: '1.5px solid #232323' }}>
              {/* Text Name - Display prominently */}
              {item.name && (
                <div style={{ marginBottom: 16, padding: '12px 16px', background: 'linear-gradient(135deg, rgba(79,140,255,0.1), rgba(162,89,255,0.1))', borderRadius: 12, border: '1px solid rgba(79,140,255,0.2)' }}>
                  <h4 style={{ margin: 0, color: '#4f8cff', fontWeight: 600, fontSize: 20 }}>
                    <i className="bi bi-tag me-2"></i>
                    {item.name}
                  </h4>
                </div>
              )}
              
              {/* Header with metadata and delete button */}
              <div className="d-flex justify-content-between align-items-start mb-3">
                <div>
                  {item.filename && (
                    <div style={{ marginBottom: 10, color: '#bfc9d9', fontSize: 16 }}>
                      <span style={{ fontWeight: 700, color: '#fff' }}>File:</span> {item.filename}
                    </div>
                  )}
                  <div style={{ marginBottom: 10, color: '#bfc9d9', fontSize: 16 }}>
                    <span style={{ fontWeight: 700, color: '#fff' }}>Saved:</span> {new Date(item.created_at).toLocaleString()}
                  </div>
                </div>
                
                <button
                  className="btn btn-outline-danger btn-sm"
                  onClick={() => handleDeleteText(item.id)}
                  title="Delete this text"
                >
                  <i className="bi bi-trash"></i>
                </button>
              </div>
              
              <pre style={{ background: '#232323', padding: 20, borderRadius: 12, fontSize: 17, color: '#fff', whiteSpace: 'pre-wrap', fontWeight: 500, margin: 0, boxShadow: '0 1px 4px rgba(162,89,255,0.05)' }}>{item.text}</pre>
            </div>
          ))}
        </div>
      )}
      {!loading && !error && results.length === 0 && query && (
        <div style={{ color: '#bfc9d9', fontSize: 20 }}>No results found.</div>
      )}
    </div>
  );
}

export default QueryTexts; 