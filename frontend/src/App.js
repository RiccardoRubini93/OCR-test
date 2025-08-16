import React, { useState, useEffect } from 'react';
import SavedTexts from './SavedTexts';

import StatsAndQuery from './StatsAndQuery';
import Summarize from './Summarize';
import { apiUrl, extractError } from './api';

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
  const [textName, setTextName] = useState('');
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
  // Theme fixed to dark (removed toggle)
  const theme = 'dark';
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showProjectManageModal, setShowProjectManageModal] = useState(false);
  const [projectActionLoading, setProjectActionLoading] = useState(false);

  // Helper: safely parse the currentProjectId into an integer or return null
  const parseProjectId = (id) => {
    if (id === null || id === undefined) return null;
    if (typeof id === 'number') return Number.isFinite(id) ? id : null;
    const s = String(id).trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  // Debug function to check modal state
  const handleOpenModal = () => {
    console.log('Opening modal, current state:', showProjectModal);
    setShowProjectModal(true);
    console.log('Modal state after set:', true);
  };

  const handleCloseModal = () => {
    console.log('Closing modal');
    setShowProjectModal(false);
  };

  const handleClearProject = async () => {
    const pid = parseProjectId(currentProjectId);
    if (pid === null) {
      alert('No project selected');
      return;
    }
    
    if (!confirm('Are you sure you want to clear all content from this project? This action cannot be undone.')) {
      return;
    }

    setProjectActionLoading(true);
    try {
      const res = await fetch(apiUrl(`/projects/${pid}/content`), {
        method: 'DELETE',
      });
      
      if (res.ok) {
        const data = await res.json();
        alert(data.message);
        // Refresh projects and clear current project
        const projectsRes = await fetch(apiUrl('/projects/'));
        const projectsData = await projectsRes.json();
        setProjects(Array.isArray(projectsData) ? projectsData : []);
        setCurrentProjectId('');
        setShowProjectManageModal(false);
      } else {
        const data = await res.json();
        alert(extractError(data) || 'Failed to clear project content');
      }
    } catch (err) {
      alert('Network error while clearing project content');
    } finally {
      setProjectActionLoading(false);
    }
  };

  const handleDeleteProject = async () => {
    const pid = parseProjectId(currentProjectId);
    if (pid === null) {
      alert('No project selected');
      return;
    }
    
    const currentProject = projects.find(p => p.id === pid);
    if (!currentProject) return;
    
    if (!confirm(`Are you sure you want to delete the project "${currentProject.name}" and ALL its content? This action cannot be undone.`)) {
      return;
    }

    setProjectActionLoading(true);
    try {
      const res = await fetch(apiUrl(`/projects/${pid}`), {
        method: 'DELETE',
      });
      
      if (res.ok) {
        const data = await res.json();
        alert(data.message);
        // Refresh projects and clear current project
        const projectsRes = await fetch(apiUrl('/projects/'));
        const projectsData = await projectsRes.json();
        setProjects(Array.isArray(projectsData) ? projectsData : []);
        setCurrentProjectId('');
        setShowProjectManageModal(false);
      } else {
        const data = await res.json();
        alert(extractError(data) || 'Failed to delete project');
      }
    } catch (err) {
      alert('Network error while deleting project');
    } finally {
      setProjectActionLoading(false);
    }
  };

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
    if (typeof window !== 'undefined') localStorage.setItem('ocr_provider', provider);
  }, [provider]);
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('ocr_ollama_model', ollamaModel);
  }, [ollamaModel]);

  // Handle Escape key to close modal
  useEffect(() => {
    console.log('useEffect triggered, showProjectModal:', showProjectModal);
    
    const handleEscape = (e) => {
      if (e.key === 'Escape' && showProjectModal) {
        console.log('Escape key pressed, closing modal');
        setShowProjectModal(false);
      }
    };

    if (showProjectModal) {
      console.log('Adding event listeners for modal');
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      console.log('Cleaning up event listeners');
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [showProjectModal]);

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
    setProjectError(extractError(data) || 'Failed to create project');
        return;
      }
      setProjects(prev => [data, ...prev]);
      setCurrentProjectId(String(data.id));
      setNewProjectName('');
      setNewProjectDesc('');
      
      // Close the modal
      setShowProjectModal(false);
      
      // Show success feedback
      setProjectError(''); // Clear any previous errors
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
      const pid = parseProjectId(currentProjectId);
      if (pid !== null) url += `&project_id=${encodeURIComponent(pid)}`;
    }
    if (textName.trim()) {
      url += `&name=${encodeURIComponent(textName.trim())}`;
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
        setError(extractError(data) || 'Error extracting text');
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
    setTextName('');
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
          {/* Theme fixed to dark; toggles removed */}
        </div>
        <div className="d-flex flex-wrap gap-2 gap-md-3 align-items-center">
          <button onClick={() => setPage('ocr')} className={`btn ${page === 'ocr' ? 'btn-primary' : 'btn-outline-light'}`} style={navBtnStyle(page === 'ocr')}>OCR Image</button>
          <button onClick={() => setPage('saved')} className={`btn ${page === 'saved' ? 'btn-primary' : 'btn-outline-light'}`} style={navBtnStyle(page === 'saved')}>Saved Texts</button>
          <button onClick={() => setPage('stats')} className={`btn ${page === 'stats' ? 'btn-primary' : 'btn-outline-light'}`} style={navBtnStyle(page === 'stats')}>Stats & Query</button>
          <button onClick={() => setPage('summarize')} className={`btn ${page === 'summarize' ? 'btn-primary' : 'btn-outline-light'}`} style={navBtnStyle(page === 'summarize')}>Summarize</button>
        </div>
      </div>
      {projectError && (
        <div className="container-fluid" style={{ color: '#e63946', fontSize: 12, paddingTop: 6 }}>{projectError}</div>
      )}
      
      {/* Improved Project Management Section */}
      <div className="container-fluid" style={{ borderTop: '1px solid #222', paddingTop: 16, paddingBottom: 16 }}>
        <div className="row align-items-center">
          <div className="col-12 col-md-4">
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-folder2-open text-primary" style={{ fontSize: 18 }}></i>
              <span className="text-light fw-semibold">Current Project:</span>
            </div>
          </div>
          <div className="col-12 col-md-8">
            <div className="d-flex align-items-center gap-3 flex-wrap">
              <select
                value={currentProjectId}
                onChange={e => setCurrentProjectId(e.target.value)}
                className="form-select form-select-sm bg-dark text-white"
                style={{ border: '1px solid #333', minWidth: 180 }}
              >
                <option value="">— No Project Selected —</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.description ? `(${p.description})` : ''}
                  </option>
                ))}
              </select>
              
              <div className="vr text-muted" style={{ height: 24 }}></div>
              
              <div className="d-flex align-items-center gap-2">
                <button 
                  type="button" 
                  className="btn btn-sm btn-outline-primary" 
                  onClick={handleOpenModal}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  <i className="bi bi-plus-circle me-1"></i>
                  New Project
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Project Info Display */}
        {currentProjectId && projects.find(p => String(p.id) === currentProjectId) && (
          <div className="row mt-2">
            <div className="col-12">
              <div className="d-flex align-items-center gap-2 text-muted" style={{ fontSize: 13 }}>
                <i className="bi bi-info-circle"></i>
                <span>
                  Working in: <strong className="text-light">{projects.find(p => String(p.id) === currentProjectId)?.name}</strong>
                  {projects.find(p => String(p.id) === currentProjectId)?.description && (
                    <span className="ms-2">— {projects.find(p => String(p.id) === currentProjectId)?.description}</span>
                  )}
                </span>
              </div>
            </div>
          </div>
        )}
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

        </div>
      </>
    );
  }

  if (page === 'similarity') {
    return (
      <>
        {nav}
        <div className="main-responsive-box" style={mainBox}>

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
      
      {/* Project Management Help Section */}
      {!currentProjectId && (
        <div className="container mb-4">
          <div className="alert alert-info bg-dark border-primary" style={{ borderRadius: 12 }}>
            <div className="d-flex align-items-start gap-3">
              <i className="bi bi-lightbulb text-primary" style={{ fontSize: 20, marginTop: 2 }}></i>
              <div>
                <h6 className="alert-heading text-primary mb-2">Why Use Projects?</h6>
                <p className="mb-2 text-muted" style={{ fontSize: 14 }}>
                  Projects help you organize your OCR work by grouping related documents together. 
                  Create a project for different types of work like:
                </p>
                <ul className="mb-0 text-muted" style={{ fontSize: 14 }}>
                  <li>📄 <strong>Receipt Analysis:</strong> Process expense receipts and invoices</li>
                  <li>📚 <strong>Document Processing:</strong> Extract text from contracts, forms, or reports</li>
                  <li>📝 <strong>Handwriting Recognition:</strong> Convert handwritten notes to digital text</li>
                  <li>🔍 <strong>Research Projects:</strong> Organize research materials and findings</li>
                </ul>
                <div className="mt-3">
                  <button 
                    type="button" 
                    className="btn btn-sm btn-primary" 
                    onClick={handleOpenModal}
                  >
                    <i className="bi bi-plus-circle me-1"></i>
                    Create Your First Project
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Current Project Display */}
      {currentProjectId && projects.find(p => String(p.id) === currentProjectId) && (
        <div className="container mb-4">
          <div className="alert alert-success bg-dark border-success" style={{ borderRadius: 12 }}>
            <div className="d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-3">
                <i className="bi bi-folder2-open text-success" style={{ fontSize: 20 }}></i>
                <div>
                  <h6 className="alert-heading text-success mb-1">
                    Working in: <strong>{projects.find(p => String(p.id) === currentProjectId)?.name}</strong>
                  </h6>
                  {projects.find(p => String(p.id) === currentProjectId)?.description && (
                    <p className="mb-0 text-muted" style={{ fontSize: 14 }}>
                      {projects.find(p => String(p.id) === currentProjectId)?.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="d-flex gap-2">
                <button 
                  type="button" 
                  className="btn btn-sm btn-outline-success" 
                  onClick={handleOpenModal}
                >
                  <i className="bi bi-plus-circle me-1"></i>
                  New Project
                </button>
                <button 
                  type="button" 
                  className="btn btn-sm btn-outline-warning" 
                  onClick={() => setShowProjectManageModal(true)}
                >
                  <i className="bi bi-gear me-1"></i>
                  Manage Project
                </button>
                <button 
                  type="button" 
                  className="btn btn-sm btn-outline-secondary" 
                  onClick={() => setCurrentProjectId('')}
                >
                  <i className="bi bi-x-circle me-1"></i>
                  Clear Project
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
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
            
            {/* Text Name Input */}
            <div className="mt-3">
              <label htmlFor="textName" className="text-name-label">
                <i className="bi bi-tag me-1"></i>
                Text Name (Optional)
              </label>
              <input
                type="text"
                id="textName"
                className="text-name-input"
                placeholder="e.g., Receipt from Coffee Shop, Meeting Notes, Contract Page 1"
                value={textName}
                onChange={e => setTextName(e.target.value)}
              />
              <div className="text-name-help">
                Give your extracted text a descriptive name to help organize and find it later
              </div>
            </div>
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
                <div className="d-flex align-items-center gap-2">
                  {currentProjectId && projects.find(p => String(p.id) === currentProjectId) && (
                    <span className="small-pill text-success" style={{ background: 'rgba(40,167,69,0.1)', border: '1px solid rgba(40,167,69,0.3)' }}>
                      <i className="bi bi-folder2"></i> {projects.find(p => String(p.id) === currentProjectId)?.name}
                    </span>
                  )}
                  <span className="small-pill"><i className="bi bi-cpu"/> {provider === 'ollama' ? `Ollama (${ollamaModel})` : provider === 'gemini' ? 'Gemini' : 'OpenAI'}</span>
                </div>
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
      
      {/* Project Creation Modal */}
      {showProjectModal && (
        <div 
          className="modal-backdrop"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            zIndex: 1050,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={handleCloseModal}
        >
          <div 
            className="modal-content bg-dark text-white"
            style={{ 
              border: '1px solid #333',
              borderRadius: '12px',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '90vh',
              overflow: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header border-secondary" style={{ borderBottom: '1px solid #333', padding: '16px 20px' }}>
              <h5 className="modal-title" id="projectModalLabel">
                <i className="bi bi-folder-plus text-primary me-2"></i>
                Create New Project
              </h5>
              <button 
                type="button" 
                className="btn-close btn-close-white" 
                onClick={handleCloseModal}
                aria-label="Close"
              ></button>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <div className="mb-3">
                <label htmlFor="projectName" className="form-label fw-semibold">
                  Project Name <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  className="form-control bg-dark text-white border-secondary"
                  id="projectName"
                  placeholder="e.g., Receipt Analysis, Document Processing"
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && handleCreateProject()}
                />
                <div className="form-text text-muted">
                  Choose a descriptive name for your project
                </div>
              </div>
              
              <div className="mb-3">
                <label htmlFor="projectDescription" className="form-label fw-semibold">
                  Description <span className="text-muted">(Optional)</span>
                </label>
                <textarea
                  className="form-control bg-dark text-white border-secondary"
                  id="projectDescription"
                  rows="3"
                  placeholder="Describe what this project is for, what types of documents you'll be processing, etc."
                  value={newProjectDesc}
                  onChange={e => setNewProjectDesc(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && !e.shiftKey && handleCreateProject()}
                ></textarea>
                <div className="form-text text-muted">
                  Help organize your work by adding context about this project
                </div>
              </div>
              
              {projectError && (
                <div className="alert alert-danger py-2" style={{ fontSize: 14 }}>
                  <i className="bi bi-exclamation-triangle me-2"></i>
                  {projectError}
                </div>
              )}
            </div>
            <div className="modal-footer border-secondary" style={{ borderTop: '1px solid #333', padding: '16px 20px' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={handleCloseModal}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleCreateProject}
                disabled={!newProjectName.trim()}
              >
                <i className="bi bi-check-circle me-2"></i>
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Project Management Modal */}
      {showProjectManageModal && currentProjectId && projects.find(p => String(p.id) === currentProjectId) && (
        <div 
          className="modal-backdrop"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            zIndex: 1050,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={() => setShowProjectManageModal(false)}
        >
          <div 
            className="modal-content bg-dark text-white"
            style={{ 
              border: '1px solid #333',
              borderRadius: '12px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '90vh',
              overflow: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header border-secondary" style={{ borderBottom: '1px solid #333', padding: '16px 20px' }}>
              <h5 className="modal-title">
                <i className="bi bi-gear text-warning me-2"></i>
                Manage Project: {projects.find(p => String(p.id) === currentProjectId)?.name}
              </h5>
              <button 
                type="button" 
                className="btn-close btn-close-white" 
                onClick={() => setShowProjectManageModal(false)}
                aria-label="Close"
              ></button>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <div className="alert alert-info bg-dark border-info" style={{ borderRadius: 8 }}>
                <i className="bi bi-info-circle me-2"></i>
                <strong>Current Project:</strong> {projects.find(p => String(p.id) === currentProjectId)?.name}
                {projects.find(p => String(p.id) === currentProjectId)?.description && (
                  <div className="mt-2">
                    <strong>Description:</strong> {projects.find(p => String(p.id) === currentProjectId)?.description}
                  </div>
                )}
              </div>
              
              <div className="row g-3">
                <div className="col-12">
                  <div className="card project-management-card border-warning">
                    <div className="card-body">
                      <h6 className="card-title text-warning">
                        <i className="bi bi-exclamation-triangle me-2"></i>
                        Clear Project Content
                      </h6>
                      <p className="card-text text-muted">
                        This will remove all OCR texts from this project but keep the project itself.
                        Useful when you want to start fresh with the same project.
                      </p>
                      <button 
                        type="button" 
                        className="btn btn-warning btn-sm"
                        onClick={handleClearProject}
                        disabled={projectActionLoading}
                      >
                        <i className="bi bi-eraser me-1"></i>
                        {projectActionLoading ? 'Processing...' : 'Clear Project Content'}
                      </button>
                    </div>
                  </div>
                </div>
                
                <div className="col-12">
                  <div className="card project-management-card border-danger">
                    <div className="card-body">
                      <h6 className="card-title text-danger">
                        <i className="bi bi-trash me-2"></i>
                        Delete Entire Project
                      </h6>
                      <p className="card-text text-muted">
                        This will permanently delete the project and ALL its content.
                        This action cannot be undone.
                      </p>
                      <button 
                        type="button" 
                        className="btn btn-danger btn-sm"
                        onClick={handleDeleteProject}
                        disabled={projectActionLoading}
                      >
                        <i className="bi bi-trash me-1"></i>
                        {projectActionLoading ? 'Processing...' : 'Delete Project & All Content'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer border-secondary" style={{ borderTop: '1px solid #333', padding: '16px 20px' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setShowProjectManageModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Debug Info - Remove this after fixing */}
      <div style={{ position: 'fixed', bottom: 10, right: 10, background: 'rgba(0,0,0,0.8)', color: 'white', padding: '10px', borderRadius: '5px', fontSize: '12px', zIndex: 9999 }}>
        Modal State: {showProjectModal ? 'OPEN' : 'CLOSED'}
      </div>
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