import React, { useEffect, useState, useMemo } from 'react';
import { apiUrl } from './api';

const accentGradient = 'linear-gradient(90deg, #a259ff 0%, #4f8cff 100%)';
const accentText = {
  background: accentGradient,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  fontWeight: 700,
};

function Summarize() {
  const [texts, setTexts] = useState([]);
  const [loadingTexts, setLoadingTexts] = useState(true);
  const [error, setError] = useState('');

  const [selectedId, setSelectedId] = useState('');

  const [provider, setProvider] = useState('openai');
  const [ollamaModels, setOllamaModels] = useState([]);
  const [ollamaModel, setOllamaModel] = useState('llama3');

  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchTexts = async () => {
      try {
        const res = await fetch(apiUrl('/texts/'));
        const data = await res.json();
        setTexts(data);
      } catch (err) {
        setError('Failed to fetch saved texts');
      }
      setLoadingTexts(false);
    };
    fetchTexts();
  }, []);

  useEffect(() => {
    if (provider === 'ollama') {
      fetch(apiUrl('/ollama/models'))
        .then(res => res.json())
        .then(data => {
          if (data.models) {
            setOllamaModels(data.models);
            setOllamaModel(data.models[0] || 'llama3');
          }
        });
    }
  }, [provider]);

  const selectedText = useMemo(() => {
    const id = Number(selectedId);
    return texts.find(t => t.id === id) || null;
  }, [selectedId, texts]);

  const handleSummarize = async (e) => {
    e.preventDefault();
    setError('');
    setSummary('');
    setLoading(true);

    if (!selectedId) {
      setError('Please select a saved text to summarize');
      setLoading(false);
      return;
    }

    const payload = {
      provider,
      model: provider === 'ollama' ? ollamaModel : undefined,
      text_id: Number(selectedId),
    };

    try {
      const res = await fetch(apiUrl('/texts/summarize'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setSummary(data.summary);
      } else {
        setError(data.error || 'Failed to summarize');
      }
    } catch (err) {
      setError('Network error');
    }
    setLoading(false);
  };

  return (
    <div className="main-responsive-box" style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '0 5vw' }}>
      <h2 style={{ fontSize: 38, marginBottom: 24, ...accentText }}>Summarize Saved Text</h2>

      <form onSubmit={handleSummarize} className="d-flex flex-column gap-3" style={{ maxWidth: 900 }}>
        <div className="row g-2 align-items-center">
          <div className="col-12 col-md-6">
            <label htmlFor="provider-select" className="form-label" style={{ color: '#fff', fontWeight: 600 }}>LLM Provider</label>
            <select
              id="provider-select"
              value={provider}
              onChange={e => setProvider(e.target.value)}
              className="form-select bg-dark text-white"
              style={{ padding: '10px 18px', borderRadius: 8, border: '1.5px solid #4f8cff', fontSize: 17, fontWeight: 600 }}
            >
              <option value="openai">OpenAI</option>
              <option value="ollama">Ollama</option>
            </select>
          </div>
          {provider === 'ollama' && ollamaModels.length > 0 && (
            <div className="col-12 col-md-6">
              <label htmlFor="ollama-model-select" className="form-label" style={{ color: '#fff', fontWeight: 600 }}>Ollama Model</label>
              <select
                id="ollama-model-select"
                value={ollamaModel}
                onChange={e => setOllamaModel(e.target.value)}
                className="form-select bg-dark text-white"
                style={{ padding: '10px 18px', borderRadius: 8, border: '1.5px solid #4f8cff', fontSize: 17, fontWeight: 600 }}
              >
                {ollamaModels.map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="row g-2 align-items-start">
          <div className="col-12 col-md-6">
            <label htmlFor="saved-select" className="form-label" style={{ color: '#fff', fontWeight: 600 }}>Saved Text</label>
            <select
              id="saved-select"
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              className="form-select bg-dark text-white"
              style={{ padding: '10px 18px', borderRadius: 8, border: '1.5px solid #4f8cff', fontSize: 17, fontWeight: 600 }}
            >
              <option value="">— Select a saved text —</option>
              {texts.map(t => (
                <option key={t.id} value={t.id}>{`#${t.id} ${t.filename ? `(${t.filename})` : ''}`}</option>
              ))}
            </select>
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label" style={{ color: '#fff', fontWeight: 600 }}>Preview</label>
            <div style={{ background: '#191919', padding: 16, borderRadius: 12, border: '1.5px solid #232323', minHeight: 120, color: '#bfc9d9', fontSize: 15 }}>
              {selectedText ? (
                <pre style={{ whiteSpace: 'pre-wrap', margin: 0, color: '#fff' }}>{selectedText.text}</pre>
              ) : (
                <span>Select a saved text to preview it here.</span>
              )}
            </div>
          </div>
        </div>

        <div>
          <button type="submit" className="btn btn-primary" disabled={loading || !selectedId} style={{ borderRadius: 12, padding: '14px 36px', fontWeight: 700, fontSize: 18 }}>
            {loading ? 'Summarizing...' : 'Summarize'}
          </button>
        </div>
      </form>

      {error && <div style={{ color: '#e63946', marginTop: 16 }}>{error}</div>}
      {summary && (
        <div style={{ marginTop: 24 }}>
          <h4 style={{ ...accentText, fontSize: 28, marginBottom: 12 }}>Summary</h4>
          <pre style={{ background: '#191919', padding: 20, borderRadius: 12, fontSize: 17, color: '#fff', whiteSpace: 'pre-wrap', fontWeight: 500, margin: 0, boxShadow: '0 1px 4px rgba(162,89,255,0.05)' }}>{summary}</pre>
        </div>
      )}
    </div>
  );
}

export default Summarize; 