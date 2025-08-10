import React, { useEffect, useState } from 'react';
import { apiUrl } from './api';

const accentGradient = 'linear-gradient(90deg, #a259ff 0%, #4f8cff 100%)';
const accentText = {
  background: accentGradient,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  fontWeight: 700,
};

function SavedTexts() {
  const [texts, setTexts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchTexts = async () => {
      try {
        const res = await fetch(apiUrl('/texts/'));
        const data = await res.json();
        setTexts(data);
      } catch (err) {
        setError('Failed to fetch saved texts');
      }
      setLoading(false);
    };
    fetchTexts();
  }, []);

  return (
    <div className="main-responsive-box" style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '0 5vw' }}>
      <h2 style={{ fontSize: 38, marginBottom: 32, ...accentText }}>Saved OCR Texts</h2>
      {loading && <div style={{ color: '#bfc9d9' }}>Loading...</div>}
      {error && <div style={{ color: '#e63946' }}>{error}</div>}
      {!loading && !error && (
        <div className="d-flex flex-column gap-4">
          {texts.length === 0 ? (
            <div style={{ color: '#bfc9d9', fontSize: 20 }}>No saved texts yet.</div>
          ) : (
            texts.map((item) => (
              <div key={item.id} className="mx-auto w-100" style={{ background: '#191919', borderRadius: 20, boxShadow: '0 2px 12px rgba(162,89,255,0.08)', padding: 32, color: '#fff', fontSize: 18, fontWeight: 500, maxWidth: 900, border: '1.5px solid #232323' }}>
                <div style={{ marginBottom: 10, color: '#bfc9d9', fontSize: 16 }}>
                  <span style={{ fontWeight: 700, color: '#fff' }}>Saved:</span> {new Date(item.created_at).toLocaleString()}
                </div>
                {item.filename && (
                  <div style={{ marginBottom: 10, color: '#bfc9d9', fontSize: 16 }}>
                    <span style={{ fontWeight: 700, color: '#fff' }}>File:</span> {item.filename}
                  </div>
                )}
                <pre style={{ background: '#232323', padding: 20, borderRadius: 12, fontSize: 17, color: '#fff', whiteSpace: 'pre-wrap', fontWeight: 500, margin: 0, boxShadow: '0 1px 4px rgba(162,89,255,0.05)' }}>{item.text}</pre>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default SavedTexts; 