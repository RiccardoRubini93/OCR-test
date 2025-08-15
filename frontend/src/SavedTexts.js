import React, { useEffect, useState, useMemo } from 'react';
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
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTexts, setSelectedTexts] = useState(new Set());
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [hoveredId, setHoveredId] = useState(null);
  const [fullscreenId, setFullscreenId] = useState(null);

  // Memoize grouping of texts by project_id
  const groups = useMemo(() => {
    const g = {};
    texts.forEach(t => {
      const key = t.project_id != null ? String(t.project_id) : 'no_project';
      if (!g[key]) g[key] = [];
      g[key].push(t);
    });
    return g;
  }, [texts]);

  // Build ordered keys from projects and groups
  const orderedKeys = useMemo(() => {
    const keys = Object.keys(groups).filter(k => k !== 'no_project');
    const projectsMap = {};
    projects.forEach(p => { projectsMap[String(p.id)] = p.name; });
    keys.sort((a,b) => {
      const na = projectsMap[a] || a;
      const nb = projectsMap[b] || b;
      return na.localeCompare(nb);
    });
    if (groups['no_project']) keys.push('no_project');
    return keys;
  }, [groups, projects]);

  // Default expand all groups when first loaded (only when no project selected)
  useEffect(() => {
    if (projectId) return;
    if (orderedKeys.length === 0) return;
    setExpandedGroups(prev => (prev.size > 0 ? prev : new Set(orderedKeys)));
  }, [projectId, orderedKeys]);

  const toggleGroup = (k) => {
    setExpandedGroups(prev => {
      const copy = new Set(prev);
      if (copy.has(k)) copy.delete(k); else copy.add(k);
      return copy;
    });
  };

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

  // When no specific project is selected, load project list so we can map ids -> names
  useEffect(() => {
    if (projectId) return;
    let mounted = true;
    fetch(apiUrl('/projects/'))
      .then(r => r.json())
      .then(data => {
        if (!mounted) return;
        setProjects(Array.isArray(data) ? data : []);
      })
      .catch(() => setProjects([]));
    return () => { mounted = false; };
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

  // Close fullscreen on ESC
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setFullscreenId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const fullscreenItem = fullscreenId ? texts.find(t => t.id === fullscreenId) : null;

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
            <div className="row">
              <div className="col-12 col-md-3 d-none d-md-block">
                {/* Sidebar TOC */}
                <div style={{ position: 'sticky', top: 80 }}>
                  <div style={{ color: '#bfc9d9', marginBottom: 8 }}>Projects</div>
                  <div className="list-group">
                    {orderedKeys.map(k => {
                      const name = k === 'no_project' ? 'No Project' : (projects.find(p => String(p.id) === k)?.name || `Project ${k}`);
                      return (
                        <button
                          key={k}
                          className="list-group-item list-group-item-action"
                          style={{ cursor: 'pointer', background: 'transparent', color: '#dbe7ff', border: '1px solid rgba(255,255,255,0.03)', marginBottom: 6 }}
                          onClick={() => {
                            const el = document.getElementById(`group-${k}`);
                            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }}
                        >
                          <div className="d-flex justify-content-between align-items-center">
                            <div style={{ textAlign: 'left' }}>{name}</div>
                            <div style={{ color: '#9aa6c7', fontSize: 12 }}>{groups[k]?.length || 0}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="col-12 col-md-9">
                {/* Render groups */}
                {orderedKeys.map((key) => {
                  const items = groups[key];
                  const displayName = key === 'no_project' ? 'No Project' : (projects.find(p => String(p.id) === key)?.name || `Project ${key}`);
                  const isExpanded = expandedGroups.has(key);
                  return (
                    <div key={key} id={`group-${key}`} style={{ borderRadius: 12, padding: 12, border: '1px solid rgba(255,255,255,0.03)', background: '#0f0f0f', marginBottom: 18 }}>
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <div>
                          <h4 style={{ margin: 0, color: '#fff', fontSize: 18 }}>{displayName} <span style={{ color: '#9aa6c7', fontSize: 13 }}>({items.length})</span></h4>
                          <div style={{ color: '#bfc9d9', fontSize: 13 }}>{key === 'no_project' ? 'Items without a project' : ''}</div>
                        </div>
                        <div className="d-flex gap-2 align-items-center">
                          <button className="btn btn-sm btn-outline-light" onClick={() => toggleGroup(key)}>{isExpanded ? 'Collapse' : 'Expand'}</button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="row g-4">
                            {items.map(item => {
                              const isHovered = hoveredId === item.id;
                              return (
                                <div key={item.id} className="col-12 col-sm-6 col-md-6">
                  <div
                    className="card h-100"
                    onMouseEnter={() => { setHoveredId(item.id); if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(hover: hover)').matches) setFullscreenId(item.id); }}
                    onMouseLeave={() => setHoveredId(null)}
                    onFocus={() => setHoveredId(item.id)}
                    onBlur={() => setHoveredId(null)}
                    onClick={() => { if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(hover: hover)').matches) return; setFullscreenId(item.id); }}
                    tabIndex={0}
                    role="button"
                                    style={{
                                      background: '#191919',
                                      borderRadius: 14,
                                      boxShadow: isHovered ? '0 8px 24px rgba(162,89,255,0.12)' : '0 2px 12px rgba(162,89,255,0.04)',
                                      padding: 16,
                                      color: '#fff',
                                      border: '1.5px solid #232323',
                                      transform: isHovered ? 'scale(1.02)' : 'scale(1)',
                                      transition: 'transform 180ms ease, box-shadow 180ms ease',
                                      zIndex: isHovered ? 20 : 'auto'
                                    }}
                                  >
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

                                    <div style={{ marginBottom: 8, display: 'flex', gap: 10, alignItems: 'center' }}>
                                      <div style={{ width: 56, height: 56, flex: '0 0 56px', borderRadius: 10, overflow: 'hidden', background: '#0b0b0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {item.image_url ? (
                                          <img src={item.image_url} alt={item.filename || item.name || 'preview'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                          <div style={{ color: '#6b7280' }}><i className="bi bi-card-image" style={{ fontSize: 22 }} /></div>
                                        )}
                                      </div>
                                      <h5 style={{ margin: 0, color: '#fff', fontWeight: 700, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.filename || item.name || ''}>
                                        {item.filename || item.name || 'Untitled'}
                                      </h5>
                                    </div>

                                    <div style={{ marginBottom: 8, color: '#bfc9d9', fontSize: 13 }}>
                                      <span style={{ fontWeight: 700, color: '#fff' }}>Saved:</span> {new Date(item.created_at).toLocaleString()}
                                    </div>

                                    {isHovered ? (
                                      <div style={{ display: 'flex', gap: 12 }}>
                                        <div style={{ flex: '0 0 36%', minHeight: 140, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9aa6c7', fontSize: 13, overflow: 'hidden' }}>
                                          {item.image_url ? (
                                            <img src={item.image_url} alt={item.filename || item.name || 'preview'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                          ) : (
                                            <div style={{ textAlign: 'center', padding: 8, background: 'linear-gradient(135deg,#0f1724,#111827)', width: '100%', height: '100%' }}>
                                              <div style={{ fontSize: 28, marginBottom: 6 }}><i className="bi bi-card-image" /></div>
                                              <div style={{ fontSize: 12 }}>No image stored</div>
                                              <div style={{ fontSize: 11, color: '#6b7280' }}>{item.filename || ''}</div>
                                            </div>
                                          )}
                                        </div>
                                        <div style={{ flex: '1 1 64%', minHeight: 140, background: '#232323', padding: 12, borderRadius: 10, fontSize: 14, color: '#fff', whiteSpace: 'pre-wrap', overflow: 'auto' }}>
                                          {item.text || <span style={{ color: '#9aa6c7' }}>No extracted text</span>}
                                        </div>
                                      </div>
                                    ) : (
                                      <div style={{ background: '#232323', padding: 12, borderRadius: 10, fontSize: 14, color: '#fff', whiteSpace: 'pre-wrap', fontWeight: 500, height: 140, overflow: 'auto' }}>
                                        {item.text || <span style={{ color: '#9aa6c7' }}>No extracted text</span>}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fullscreen overlay */}
      {fullscreenItem && (
        <div
          onClick={() => setFullscreenId(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{ width: '100%', maxWidth: 1000, maxHeight: '90vh', background: '#0b0b0b', borderRadius: 12, padding: 18, overflow: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.6)' }}
          >
            <div className="d-flex justify-content-between align-items-start mb-3">
              <div>
                <h3 style={{ margin: 0, color: '#fff' }}>{fullscreenItem.filename || fullscreenItem.name || 'Untitled'}</h3>
                <div style={{ color: '#9aa6c7', fontSize: 13 }}>{new Date(fullscreenItem.created_at).toLocaleString()}</div>
              </div>
              <div>
                <button className="btn btn-sm btn-light" onClick={() => setFullscreenId(null)}>Close</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
              <div style={{ flex: '0 0 48%', maxHeight: '70vh', overflow: 'hidden', borderRadius: 8, background: '#111' }}>
                {fullscreenItem.image_url ? (
                  <img src={fullscreenItem.image_url} alt={fullscreenItem.filename || fullscreenItem.name || 'preview'} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                ) : (
                  <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
                    <i className="bi bi-card-image" style={{ fontSize: 48 }} />
                  </div>
                )}
              </div>

              <div style={{ flex: '1 1 52%', background: '#111318', padding: 12, borderRadius: 8, color: '#fff', overflow: 'auto', maxHeight: '70vh', whiteSpace: 'pre-wrap' }}>
                {fullscreenItem.text || <span style={{ color: '#9aa6c7' }}>No extracted text</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SavedTexts; 

// Fullscreen overlay styles are rendered inside the component via portal-like markup in SavedTexts
