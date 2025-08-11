import React, { useState, useEffect } from 'react';
import SavedTexts from './SavedTexts';
import QueryTexts from './QueryTexts';
import SimilaritySearch from './SimilaritySearch';
import StatsAndQuery from './StatsAndQuery';
import Summarize from './Summarize';
import { apiUrl } from './api';

// Global style injection for demo
const globalStyle = `
  body {
    background: #000 !important;
    color: #fff !important;
    font-family: 'Poppins', 'Inter', 'Helvetica Neue', Arial, sans-serif !important;
    margin: 0;
    padding: 0;
  }
`;
if (typeof document !== 'undefined' && !document.getElementById('bs-global-style')) {
  const style = document.createElement('style');
  style.id = 'bs-global-style';
  style.innerHTML = globalStyle;
  document.head.appendChild(style);
}

const accentGradient = 'linear-gradient(90deg, #a259ff 0%, #4f8cff 100%)';
const accentText = {
  background: accentGradient,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  fontWeight: 700,
};

function App() {
  const [file, setFile] = useState(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [page, setPage] = useState('ocr');
  const [provider, setProvider] = useState('openai');
  const [ollamaModels, setOllamaModels] = useState([]);
  const [ollamaModel, setOllamaModel] = useState('llama3');
  const [ollamaOnlyRunning, setOllamaOnlyRunning] = useState(false);
  const [ollamaModelsRefresh, setOllamaModelsRefresh] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [projectError, setProjectError] = useState('');
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState(() => (typeof window !== 'undefined' ? (localStorage.getItem('theme') || 'dark') : 'dark'));

  useEffect(() => {
    // Load projects on app start
    fetch(apiUrl('/projects/'))
      .then(res => res.json())
      .then(data => {
        setProjects(Array.isArray(data) ? data : []);
        if (Array.isArray(data) && data.length > 0) {
          setCurrentProjectId(String(data[0].id));
        }
      })
      .catch(() => setProjects([]));

    // Restore provider & model
    const savedProvider = localStorage.getItem('ocr_provider');
    const savedOllamaModel = localStorage.getItem('ocr_ollama_model');
    if (savedProvider) setProvider(savedProvider);
    if (savedOllamaModel) setOllamaModel(savedOllamaModel);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('theme-light', theme === 'light');
    if (typeof window !== 'undefined') localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('ocr_provider', provider);
  }, [provider]);
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('ocr_ollama_model', ollamaModel);
  }, [ollamaModel]);

  const handleCreateProject = async () => {
    setProjectError('');
    const name = newProjectName.trim();
    if (!name) {
      setProjectError('Project name required');
      return;
    }
    try {
      const res = await fetch(apiUrl('/projects/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: newProjectDesc.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setProjectError(data.detail || data.error || 'Failed to create project');
        return;
      }
      setProjects(prev => [data, ...prev]);
      setCurrentProjectId(String(data.id));
      setNewProjectName('');
      setNewProjectDesc('');
    } catch (e) {
      setProjectError('Network error creating project');
    }
  };

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

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    setText('');
    setError('');
    if (selectedFile) {
      setPreview(URL.createObjectURL(selectedFile));
    } else {
      setPreview(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setText('');
    setError('');
    const formData = new FormData();
    formData.append('file', file);
    let url = apiUrl(`/ocr/?provider=${provider}`);
    if (provider === 'ollama' && ollamaModel) {
      url += `&model=${encodeURIComponent(ollamaModel)}`;
    }
    if (provider === 'gemini') {
      // Optionally allow model override via query or future UI; use backend default if not provided
    }
    if (currentProjectId) {
      url += `&project_id=${encodeURIComponent(currentProjectId)}`;
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setText(data.text);
      } else {
        setError(data.error || 'Error extracting text');
      }
    } catch (err) {
      setError('Network error');
    }
    setLoading(false);
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange({ target: { files: e.dataTransfer.files } });
    }
  };

  const handleClearFile = () => {
    setFile(null);
    setPreview(null);
    setText('');
    setError('');
    const input = document.getElementById('file-upload');
    if (input) input.value = '';
  };

  // Replace nav and mainBox with Bootstrap classes and add a style tag for mobile tweaks

  const nav = (
    <nav className="navbar navbar-expand-lg navbar-dark bg-black sticky-top mb-4" style={{ borderBottom: '1px solid #222', minHeight: 64, zIndex: 10 }}>
      <div className="container-fluid justify-content-between">
        <div className="d-flex align-items-center gap-3">
          <span className="brand sheen" style={{ fontSize: 20 }}>OCR AI</span>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button className={`btn btn-sm ${theme === 'dark' ? 'btn-primary' : 'btn-outline-light'}`} onClick={() => setTheme('dark')}>Dark</button>
          <button className={`btn btn-sm ${theme === 'light' ? 'btn-primary' : 'btn-outline-light'}`} onClick={() => setTheme('light')}>Light</button>
        </div>
        <div className="d-flex flex-wrap gap-2 gap-md-3 align-items-center">
          <button onClick={() => setPage('ocr')} className={`btn ${page === 'ocr' ? 'btn-primary' : 'btn-outline-light'}`} style={navBtnStyle(page === 'ocr')}>OCR Image</button>
          <button onClick={() => setPage('saved')} className={`btn ${page === 'saved' ? 'btn-primary' : 'btn-outline-light'}`} style={navBtnStyle(page === 'saved')}>Saved Texts</button>
          <button onClick={() => setPage('query')} className={`btn ${page === 'query' ? 'btn-primary' : 'btn-outline-light'}`} style={navBtnStyle(page === 'query')}>Query Texts</button>
          <button onClick={() => setPage('similarity')} className={`btn ${page === 'similarity' ? 'btn-primary' : 'btn-outline-light'}`} style={navBtnStyle(page === 'similarity')}>Similarity Search</button>
          <button onClick={() => setPage('stats')} className={`btn ${page === 'stats' ? 'btn-primary' : 'btn-outline-light'}`} style={navBtnStyle(page === 'stats')}>Stats & Query</button>
          <button onClick={() => setPage('summarize')} className={`btn ${page === 'summarize' ? 'btn-primary' : 'btn-outline-light'}`} style={navBtnStyle(page === 'summarize')}>Summarize</button>
        </div>
      </div>
      {projectError && (
        <div className="container-fluid" style={{ color: '#e63946', fontSize: 12, paddingTop: 6 }}>{projectError}</div>
      )}
      <div className="container-fluid" style={{ borderTop: '1px solid #222', paddingTop: 10, paddingBottom: 10 }}>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <label className="text-light me-1" style={{ fontWeight: 600 }}>Project:</label>
          <select
            value={currentProjectId}
            onChange={e => setCurrentProjectId(e.target.value)}
            className="form-select form-select-sm bg-dark text-white"
            style={{ border: '1px solid #333', minWidth: 160 }}
          >
            <option value="">— None —</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="New project name"
            value={newProjectName}
            onChange={e => setNewProjectName(e.target.value)}
            className="form-control form-control-sm bg-dark text-white"
            style={{ border: '1px solid #333', minWidth: 160 }}
          />
          <input
            type="text"
            placeholder="Description (opt)"
            value={newProjectDesc}
            onChange={e => setNewProjectDesc(e.target.value)}
            className="form-control form-control-sm bg-dark text-white"
            style={{ border: '1px solid #333', minWidth: 200 }}
          />
          <button type="button" className="btn btn-sm btn-outline-light" onClick={handleCreateProject}>Create</button>
        </div>
      </div>
    </nav>
  );

  const mainBox = {
    width: '100%',
    maxWidth: 1100,
    margin: '0 auto',
    background: '#111',
    borderRadius: 32,
    boxShadow: '0 4px 32px rgba(0,0,0,0.18)',
    padding: '48px 5vw',
    marginBottom: 40,
    minHeight: 400,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  };

  // Add a style tag for mobile tweaks
  const mobileStyle = `
  @media (max-width: 600px) {
    h1, h2, h4 { font-size: 7vw !important; }
    .navbar .btn { font-size: 4vw !important; padding: 8px 12px !important; }
    .container-fluid, .main-responsive-box { padding: 0 2vw !important; }
    .main-responsive-box { padding: 24px 2vw !important; border-radius: 18px !important; }
    form, .main-responsive-box { min-width: 0 !important; }
  }
  `;
  if (typeof document !== 'undefined' && !document.getElementById('mobile-style')) {
    const style = document.createElement('style');
    style.id = 'mobile-style';
    style.innerHTML = mobileStyle;
    document.head.appendChild(style);
  }

  if (page === 'saved') {
    return (
      <>
        {nav}
        <div className="main-responsive-box" style={mainBox}>
          <SavedTexts projectId={currentProjectId} />
        </div>
      </>
    );
  }

  if (page === 'query') {
    return (
      <>
        {nav}
        <div className="main-responsive-box" style={mainBox}>
          <QueryTexts projectId={currentProjectId} />
        </div>
      </>
    );
  }

  if (page === 'similarity') {
    return (
      <>
        {nav}
        <div className="main-responsive-box" style={mainBox}>
          <SimilaritySearch projectId={currentProjectId} />
        </div>
      </>
    );
  }

  if (page === 'stats') {
    return (
      <>
        {nav}
        <div className="main-responsive-box" style={mainBox}>
          <StatsAndQuery projectId={currentProjectId} />
        </div>
      </>
    );
  }

  if (page === 'summarize') {
    return (
      <>
        {nav}
        <div className="main-responsive-box" style={mainBox}>
          <Summarize projectId={currentProjectId} />
        </div>
      </>
    );
  }

  return (
    <>
      {nav}
      <div className="section glass-card main-responsive-box">
        <div className="hero">
          <div className="small-pill center mb-8"><i className="bi bi-stars"/> Smart OCR with AI</div>
          <h1 className="brand">OCR Image to Text</h1>
          <p>Upload an image and extract the text within it using AI. Choose your preferred LLM provider and model.</p>
        </div>

        <div className="stepper">
          <div className="step"><span className="index">1</span><span className="label">Add image</span></div>
          <div className="step"><span className="index">2</span><span className="label">Pick provider</span></div>
          <div className="step"><span className="index">3</span><span className="label">Extract & copy</span></div>
        </div>

        {/* Main split layout */}
        <div className="split">
          <div>
            {/* Drag and drop area */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`dropzone ${dragActive ? 'active' : ''}`}
              onClick={() => document.getElementById('file-upload').click()}
            >
              <div className="inner">
                {file ? file.name : dragActive ? 'Drop your image here…' : 'Tap to take a photo or choose an image (or drag & drop)'}
                {file && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleClearFile(); }}
                    className="btn btn-ghost"
                    style={{ position: 'absolute', top: 8, right: 8 }}
                  >
                    <i className="bi bi-x"/> Remove
                  </button>
                )}
                <input id="file-upload" type="file" accept="image/*" capture="environment" onChange={handleFileChange} style={{ display: 'none' }} />
              </div>
              <div className="hint">PNG, JPG up to ~10MB</div>
            </div>

            {/* Provider controls */}
            <form onSubmit={handleSubmit} className="mt-16" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <label htmlFor="provider-select" style={{ fontWeight: 600 }}>LLM Provider:</label>
                <select id="provider-select" value={provider} onChange={e => setProvider(e.target.value)} className="form-select bg-dark text-white" style={{ padding: '10px 18px', borderRadius: 8, border: '1.5px solid #4f8cff', fontSize: 17, fontWeight: 600 }}>
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Gemini</option>
                  <option value="ollama">Ollama</option>
                </select>
                {provider === 'ollama' && (
                  <>
                    <label htmlFor="ollama-model-select" className="ms-2" style={{ fontWeight: 600 }}>Model:</label>
                    <select id="ollama-model-select" value={ollamaModel} onChange={e => setOllamaModel(e.target.value)} className="form-select bg-dark text-white" style={{ padding: '10px 18px', borderRadius: 8, border: '1.5px solid #4f8cff', fontSize: 17, fontWeight: 600 }} disabled={ollamaModels.length === 0}>
                      {ollamaModels.map(model => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </select>
                    <div className="form-check form-switch" style={{ color: '#bfc9d9', fontWeight: 600 }}>
                      <input className="form-check-input" type="checkbox" id="only-running-switch" checked={ollamaOnlyRunning} onChange={e => setOllamaOnlyRunning(e.target.checked)} />
                      <label className="form-check-label" htmlFor="only-running-switch">Only running</label>
                    </div>
                    <button type="button" className="btn btn-ghost" onClick={() => setOllamaModelsRefresh(v => v + 1)}><i className="bi bi-arrow-repeat"/> Refresh</button>
                  </>
                )}
              </div>

              <div className="d-flex gap-2">
                <button type="submit" disabled={!file || loading} className="btn btn-gradient">
                  {loading ? 'Extracting…' : 'Extract Text'}
                </button>
                {text && (
                  <button type="button" className="btn btn-ghost" onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(()=>setCopied(false), 1200); }}>
                    <i className="bi bi-clipboard2"/> {copied ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>
            </form>
          </div>

          <div>
            {/* Preview + Result */}
            {preview && (
              <div className="image-frame mb-16">
                <img src={preview} alt="Preview" />
              </div>
            )}
            <div>
              <div className="d-flex align-items-center justify-content-between mb-8">
                <h4 style={{ ...accentText, fontSize: 24, margin: 0 }}>Extracted Text</h4>
                <span className="small-pill"><i className="bi bi-cpu"/> {provider === 'ollama' ? `Ollama (${ollamaModel})` : provider === 'gemini' ? 'Gemini' : 'OpenAI'}</span>
              </div>
              {loading ? (
                <div className="pre skeleton" style={{ minHeight: 160 }} />
              ) : text ? (
                <pre className="pre">{text}</pre>
              ) : (
                <div className="pre" style={{ color: '#8892a6' }}>No text yet. Upload an image and click Extract.</div>
              )}
            </div>
          </div>
        </div>
      </div>
      <footer className="footer">&copy; {new Date().getFullYear()} OCR AI Platform Demo</footer>
    </>
  );
}

const navBtnStyle = (active) => ({
  background: active ? accentGradient : 'transparent',
  color: active ? '#fff' : '#bfc9d9',
  border: 'none',
  borderRadius: 8,
  padding: '12px 32px',
  fontWeight: 700,
  fontSize: 18,
  cursor: 'pointer',
  marginBottom: 0,
  marginRight: 0,
  letterSpacing: 0.5,
  transition: 'background 0.2s, color 0.2s',
});

export default App; 