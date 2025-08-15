import React, { useEffect, useState, useMemo } from 'react';
import { apiUrl, extractError } from './api';
import { jsPDF } from 'jspdf';

const accentGradient = 'linear-gradient(90deg, #a259ff 0%, #4f8cff 100%)';
const accentText = {
  background: accentGradient,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  fontWeight: 700,
};

function Summarize({ projectId }) {
  const [texts, setTexts] = useState([]);
  const [loadingTexts, setLoadingTexts] = useState(true);
  const [error, setError] = useState('');

  const [selectedId, setSelectedId] = useState('');
  const [summarizeAll, setSummarizeAll] = useState(false);

  const [provider, setProvider] = useState('openai');
  const [ollamaModels, setOllamaModels] = useState([]);
  const [ollamaModel, setOllamaModel] = useState('llama3');
  const [ollamaOnlyRunning, setOllamaOnlyRunning] = useState(false);
  const [ollamaModelsRefresh, setOllamaModelsRefresh] = useState(0);

  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [summaryLength, setSummaryLength] = useState('medium');
  const [summaryFormat, setSummaryFormat] = useState('bullets');
  const [instructions, setInstructions] = useState('');
  const [showLengthInfo, setShowLengthInfo] = useState(false);

  const handleSavePdf = () => {
    if (!summary) return;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const marginX = 48;
    const marginY = 56;
    let cursorY = marginY;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Summary', marginX, cursorY);
    cursorY += 20;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const meta = [
      `Text ID: ${summarizeAll ? 'ALL' : (selectedId || '-')}`,
      selectedText?.name ? `Text Name: ${selectedText.name}` : null,
      `Provider: ${provider}${provider === 'ollama' ? ` (${ollamaModel})` : ''}`,
      `Length: ${summaryLength}`,
      `Format: ${summaryFormat}`,
      instructions ? `Instructions: ${instructions}` : null,
      projectId ? `Project: ${projectId}` : 'Project: All',
    ].filter(Boolean).join('  |  ');
    const metaLines = doc.splitTextToSize(meta, 540);
    metaLines.forEach(line => {
      if (cursorY > doc.internal.pageSize.getHeight() - marginY) {
        doc.addPage();
        cursorY = marginY;
      }
      doc.text(line, marginX, cursorY);
      cursorY += 16;
    });

    cursorY += 8;
    doc.setDrawColor(200);
    doc.line(marginX, cursorY, doc.internal.pageSize.getWidth() - marginX, cursorY);
    cursorY += 18;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    const contentLines = doc.splitTextToSize(summary, 540);
    contentLines.forEach(line => {
      if (cursorY > doc.internal.pageSize.getHeight() - marginY) {
        doc.addPage();
        cursorY = marginY;
      }
      doc.text(line, marginX, cursorY);
      cursorY += 16;
    });

    const filenameBase = summarizeAll ? `summary_all${projectId ? `_project_${projectId}` : ''}` : (selectedId ? `summary_${selectedText?.name ? selectedText.name.replace(/[^a-zA-Z0-9]/g, '_') : selectedId}` : 'summary');
    doc.save(`${filenameBase}.pdf`);
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
      setLoadingTexts(false);
    };
    fetchTexts();
  }, [projectId]);

  useEffect(() => {
    if (provider === 'ollama') {
      const endpoint = ollamaOnlyRunning ? '/ollama/models/running' : '/ollama/models';
      fetch(apiUrl(endpoint))
        .then(res => res.json())
        .then(data => {
          if (data.models) {
            setOllamaModels(data.models);
            setOllamaModel(prev => (data.models.includes(prev) ? prev : (data.models[0] || 'llama3')));
          } else {
            setOllamaModels([]);
          }
        })
        .catch(() => setOllamaModels([]));
    }
  }, [provider, ollamaOnlyRunning, ollamaModelsRefresh]);

  const selectedText = useMemo(() => {
    const id = Number(selectedId);
    return texts.find(t => t.id === id) || null;
  }, [selectedId, texts]);

  const handleSummarize = async (e) => {
    e.preventDefault();
    setError('');
    setSummary('');
    setLoading(true);

    if (!summarizeAll && !selectedId) {
      setError('Please select a saved text to summarize or toggle "Summarize all"');
      setLoading(false);
      return;
    }

    const payload = {
      provider,
      model: provider === 'ollama' ? ollamaModel : undefined,
      text_id: summarizeAll ? undefined : Number(selectedId),
      summarize_all: summarizeAll,
      project_id: projectId ? Number(projectId) : undefined,
      summary_length: summaryLength,
      format: summaryFormat,
      instructions: instructions.trim() ? instructions.trim() : undefined,
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
            setError(extractError(data) || 'Failed to summarize');
      }
    } catch (err) {
      setError('Network error');
    }
    setLoading(false);
  };

  return (
    <div className="main-responsive-box" style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '0 5vw' }}>
      <h2 style={{ fontSize: 38, marginBottom: 24, ...accentText }}>Summarize Saved Text</h2>

      <form onSubmit={handleSummarize} className="d-flex flex-column gap-3" style={{ maxWidth: 900, width: '100%' }}>
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
              <option value="gemini">Gemini</option>
              <option value="ollama">Ollama</option>
            </select>
          </div>
          {provider === 'ollama' && (
            <div className="col-12 col-md-6">
              <label htmlFor="ollama-model-select" className="form-label" style={{ color: '#fff', fontWeight: 600 }}>Ollama Model</label>
              <select
                id="ollama-model-select"
                value={ollamaModel}
                onChange={e => setOllamaModel(e.target.value)}
                className="form-select bg-dark text-white"
                style={{ padding: '10px 18px', borderRadius: 8, border: '1.5px solid #4f8cff', fontSize: 17, fontWeight: 600 }}
                disabled={ollamaModels.length === 0}
              >
                {ollamaModels.map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
              <div className="form-check form-switch mt-2" style={{ color: '#bfc9d9', fontWeight: 600 }}>
                <input className="form-check-input" type="checkbox" id="only-running-switch-sum" checked={ollamaOnlyRunning} onChange={e => setOllamaOnlyRunning(e.target.checked)} />
                <label className="form-check-label" htmlFor="only-running-switch-sum">Only running</label>
              </div>
              <button type="button" className="btn btn-outline-light mt-2" onClick={() => setOllamaModelsRefresh(v => v + 1)} style={{ borderRadius: 10, padding: '8px 14px' }}>Refresh</button>
              {ollamaModels.length === 0 && (
                <span style={{ color: '#bfc9d9', fontSize: 14, display: 'inline-block', marginTop: 8 }}>No models found. Toggle "Only running" off, start a model in Ollama, or refresh.</span>
              )}
            </div>
          )}
        </div>

        <div className="row g-2 align-items-start">
          <div className="col-12 col-md-6">
            <div className="d-flex align-items-center justify-content-between">
              <label htmlFor="saved-select" className="form-label" style={{ color: '#fff', fontWeight: 600 }}>Saved Text</label>
              <div className="form-check form-switch" style={{ color: '#bfc9d9', fontWeight: 600 }}>
                <input className="form-check-input" type="checkbox" id="summarize-all-switch" checked={summarizeAll} onChange={e => setSummarizeAll(e.target.checked)} />
                <label className="form-check-label" htmlFor="summarize-all-switch">Summarize all in current project</label>
              </div>
            </div>
            <select
              id="saved-select"
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              className="form-select bg-dark text-white"
              style={{ padding: '10px 18px', borderRadius: 8, border: '1.5px solid #4f8cff', fontSize: 17, fontWeight: 600 }}
              disabled={summarizeAll}
            >
              <option value="">— Select a saved text —</option>
              {texts.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name ? `${t.name}` : `#${t.id}`} {t.filename ? `(${t.filename})` : ''}
                </option>
              ))}
            </select>
            <div className="row g-2 mt-2">
              <div className="col-6">
                <div className="d-flex align-items-center justify-content-between">
                  <label className="form-label m-0" style={{ color: '#fff', fontWeight: 600 }}>Length</label>
                  <button type="button" className="btn btn-sm btn-outline-light" style={{ borderRadius: 8, padding: '2px 8px' }} onClick={() => setShowLengthInfo(v => !v)}>?</button>
                </div>
                <select
                  value={summaryLength}
                  onChange={e => setSummaryLength(e.target.value)}
                  className="form-select bg-dark text-white"
                  style={{ padding: '10px 18px', borderRadius: 8, border: '1.5px solid #4f8cff', fontSize: 17, fontWeight: 600 }}
                >
                  <option value="short">Short</option>
                  <option value="medium">Medium</option>
                  <option value="long">Long</option>
                </select>
                {showLengthInfo && (
                  <div style={{ background: '#111', border: '1px solid #232323', borderRadius: 10, padding: 10, marginTop: 8, color: '#bfc9d9', fontSize: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
                    <div><b style={{ color: '#fff' }}>Short</b>: 2-3 sentences or up to 3 bullet points</div>
                    <div><b style={{ color: '#fff' }}>Medium</b>: ~4-6 sentences or 3-5 bullet points</div>
                    <div><b style={{ color: '#fff' }}>Long</b>: 1-2 paragraphs or 5-8 bullet points</div>
                  </div>
                )}
              </div>
              <div className="col-6">
                <label className="form-label" style={{ color: '#fff', fontWeight: 600 }}>Format</label>
                <select
                  value={summaryFormat}
                  onChange={e => setSummaryFormat(e.target.value)}
                  className="form-select bg-dark text-white"
                  style={{ padding: '10px 18px', borderRadius: 8, border: '1.5px solid #4f8cff', fontSize: 17, fontWeight: 600 }}
                >
                  <option value="bullets">Bullets</option>
                  <option value="plain">Plain Text</option>
                </select>
              </div>
            </div>
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label" style={{ color: '#fff', fontWeight: 600 }}>Preview</label>
            <div style={{ background: '#191919', padding: 16, borderRadius: 12, border: '1.5px solid #232323', minHeight: 120, color: '#bfc9d9', fontSize: 15 }}>
              {summarizeAll ? (
                <span>All texts in {projectId ? `project ${projectId}` : 'the entire database'} will be summarized.</span>
              ) : selectedText ? (
                <div>
                  {selectedText.name && (
                    <div style={{ marginBottom: 12, padding: '8px 12px', background: 'linear-gradient(135deg, rgba(79,140,255,0.1), rgba(162,89,255,0.1))', borderRadius: 8, border: '1px solid rgba(79,140,255,0.2)' }}>
                      <strong style={{ color: '#4f8cff' }}>{selectedText.name}</strong>
                    </div>
                  )}
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0, color: '#fff' }}>{selectedText.text}</pre>
                </div>
              ) : (
                <span>Select a saved text to preview it here.</span>
              )}
            </div>
            <div className="mt-3">
              <label className="form-label" style={{ color: '#fff', fontWeight: 600 }}>Optional Instructions</label>
              <input
                type="text"
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                placeholder="Add a short hint (optional)"
                className="form-control bg-dark text-white"
                style={{ padding: 12, borderRadius: 10, border: '1.5px solid #4f8cff', fontSize: 16, fontWeight: 500 }}
              />
            </div>
          </div>
        </div>

        <div>
          <button type="submit" className="btn btn-primary" disabled={loading || (!summarizeAll && !selectedId)} style={{ borderRadius: 12, padding: '14px 36px', fontWeight: 700, fontSize: 18 }}>
            {loading ? 'Summarizing...' : (summarizeAll ? 'Summarize All' : 'Summarize')}
          </button>
          {summary && (
            <button type="button" onClick={handleSavePdf} className="btn btn-outline-light ms-2" style={{ borderRadius: 12, padding: '14px 24px', fontWeight: 700, fontSize: 18 }}>
              Save as PDF
            </button>
          )}
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