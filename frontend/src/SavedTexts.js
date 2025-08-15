import React, { useEffect, useState } from 'react';
import { apiUrl } from './api';

const accentGradient = 'linear-gradient(90deg, #a259ff 0%, #4f8cff 100%)';
const accentText = {
  background: accentGradient,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  fontWeight: 700,
};

function SavedTexts({ projectId }) {
  const [texts, setTexts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTexts, setSelectedTexts] = useState(new Set());
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    const fetchTexts = async () => {
      try {
        const url = projectId ? `${apiUrl('/texts/')}?project_id=${encodeURIComponent(projectId)}` : apiUrl('/texts/');
        const res = await fetch(url);
        const data = await res.json();
        setTexts(data);
      } catch (err) {
        setError('Failed to fetch saved texts');
      }
      setLoading(false);
    };
    fetchTexts();
  }, [projectId]);

  const handleDeleteText = async (textId) => {
    if (!confirm('Are you sure you want to delete this text? This action cannot be undone.')) {
      return;
    }

    try {
      const res = await fetch(apiUrl(`/texts/${textId}`), {
        method: 'DELETE',
      });
      
      if (res.ok) {
        setTexts(prev => prev.filter(t => t.id !== textId));
        setSelectedTexts(prev => {
          const newSet = new Set(prev);
          newSet.delete(textId);
          return newSet;
        });
      } else {
        const data = await res.json();
        setError(data.detail || 'Failed to delete text');
      }
    } catch (err) {
      setError('Network error while deleting text');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTexts.size === 0) return;
    
    if (!confirm(`Are you sure you want to delete ${selectedTexts.size} selected text(s)? This action cannot be undone.`)) {
      return;
    }

    setDeleteLoading(true);
    try {
      const res = await fetch(apiUrl('/texts/bulk'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text_ids: Array.from(selectedTexts) }),
      });
      
      if (res.ok) {
        setTexts(prev => prev.filter(t => !selectedTexts.has(t.id)));
        setSelectedTexts(new Set());
      } else {
        const data = await res.json();
        setError(data.detail || 'Failed to delete texts');
      }
    } catch (err) {
      setError('Network error while deleting texts');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleSelectAll = () => {
    if (selectedTexts.size === texts.length) {
      setSelectedTexts(new Set());
    } else {
      setSelectedTexts(new Set(texts.map(t => t.id)));
    }
  };

  const handleSelectText = (textId) => {
    const newSet = new Set(selectedTexts);
    if (newSet.has(textId)) {
      newSet.delete(textId);
    } else {
      newSet.add(textId);
    }
    setSelectedTexts(newSet);
  };

  return (
    <div className="main-responsive-box" style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '0 5vw' }}>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 style={{ fontSize: 38, marginBottom: 0, ...accentText }}>Saved OCR Texts</h2>
        
        {/* Bulk Actions */}
        {texts.length > 0 && (
          <div className="bulk-actions d-flex gap-2 align-items-center">
            <div className="form-check">
              <input
                className="form-check-input"
                type="checkbox"
                checked={selectedTexts.size === texts.length && texts.length > 0}
                onChange={handleSelectAll}
                id="select-all-checkbox"
              />
              <label className="form-check-label" htmlFor="select-all-checkbox">
                Select All ({selectedTexts.size}/{texts.length})
              </label>
            </div>
            
            {selectedTexts.size > 0 && (
              <button
                className="btn btn-danger btn-sm"
                onClick={handleBulkDelete}
                disabled={deleteLoading}
              >
                <i className="bi bi-trash me-1"></i>
                {deleteLoading ? 'Deleting...' : `Delete ${selectedTexts.size} Selected`}
              </button>
            )}
          </div>
        )}
      </div>
      
      {loading && <div style={{ color: '#bfc9d9' }}>Loading...</div>}
      {error && <div style={{ color: '#e63946' }}>{error}</div>}
      {!loading && !error && (
        <div className="d-flex flex-column gap-4">
          {texts.length === 0 ? (
            <div style={{ color: '#bfc9d9', fontSize: 20 }}>No saved texts yet.</div>
          ) : (
            <div className="row g-4">
              {texts.map((item) => (
                <div key={item.id} className="col-12 col-sm-6 col-md-4">
                  <div className="card h-100" style={{ background: '#191919', borderRadius: 14, boxShadow: '0 2px 12px rgba(162,89,255,0.04)', padding: 16, color: '#fff', border: '1.5px solid #232323' }}>
                    <div className="d-flex justify-content-between align-items-start mb-2">
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          checked={selectedTexts.has(item.id)}
                          onChange={() => handleSelectText(item.id)}
                          id={`checkbox-${item.id}`}
                        />
                        <label className="form-check-label ms-2" htmlFor={`checkbox-${item.id}`} style={{ color: '#bfc9d9', fontSize: 14 }}>
                          Select
                        </label>
                      </div>

                      <button
                        className="btn btn-outline-danger btn-sm"
                        onClick={() => handleDeleteText(item.id)}
                        title="Delete this text"
                      >
                        <i className="bi bi-trash"></i>
                      </button>
                    </div>

                    {/* Title / filename */}
                    <div style={{ marginBottom: 8 }}>
                      <h5 style={{ margin: 0, color: '#fff', fontWeight: 700, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.filename || item.name || ''}>
                        <i className="bi bi-image me-2" style={{ color: '#4f8cff' }}></i>
                        {item.filename || item.name || 'Untitled'}
                      </h5>
                    </div>

                    <div style={{ marginBottom: 8, color: '#bfc9d9', fontSize: 13 }}>
                      <span style={{ fontWeight: 700, color: '#fff' }}>Saved:</span> {new Date(item.created_at).toLocaleString()}
                    </div>

                    <div style={{ background: '#232323', padding: 12, borderRadius: 10, fontSize: 14, color: '#fff', whiteSpace: 'pre-wrap', fontWeight: 500, height: 160, overflow: 'auto' }}>
                      {item.text || <span style={{ color: '#9aa6c7' }}>No extracted text</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SavedTexts; 