import React, { useState } from 'react';
import { apiUrl } from './api';

const accentGradient = 'linear-gradient(90deg, #a259ff 0%, #4f8cff 100%)';
const accentText = {
  background: accentGradient,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  fontWeight: 700,
};

function SimilaritySearch() {
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
      const res = await fetch(apiUrl('/texts/similarity'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      setResults(data);
    } catch (err) {
      setError('Failed to fetch similarity results');
    }
    setLoading(false);
  };

  return (
    <div className="main-responsive-box" style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '0 5vw' }}>
      <h2 style={{ fontSize: 38, marginBottom: 32, ...accentText }}>Similarity Search (Embeddings)</h2>
      <form onSubmit={handleSearch} className="row g-2 align-items-center mb-4" style={{ marginBottom: 32 }}>
        <div className="col-12 col-md-9 mb-2 mb-md-0">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Enter a query to find similar texts..."
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
              {item.filename && (
                <div style={{ marginBottom: 10, color: '#bfc9d9', fontSize: 16 }}>
                  <span style={{ fontWeight: 700, color: '#fff' }}>File:</span> {item.filename}
                </div>
              )}
              <div style={{ marginBottom: 10, color: '#bfc9d9', fontSize: 16 }}>
                <span style={{ fontWeight: 700, color: '#fff' }}>Saved:</span> {new Date(item.created_at).toLocaleString()} | <span style={{ color: '#a259ff', fontWeight: 700 }}>Similarity:</span> {(item.score * 100).toFixed(2)}%
              </div>
              <pre style={{ background: '#232323', padding: 20, borderRadius: 12, fontSize: 17, color: '#fff', whiteSpace: 'pre-wrap', fontWeight: 500, margin: 0, boxShadow: '0 1px 4px rgba(162,89,255,0.05)' }}>{item.text}</pre>
            </div>
          ))}
        </div>
      )}
      {!loading && !error && results.length === 0 && query && (
        <div style={{ color: '#bfc9d9', fontSize: 20 }}>No similar results found.</div>
      )}
    </div>
  );
}

export default SimilaritySearch; 