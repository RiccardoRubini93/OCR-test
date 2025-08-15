import React, { useEffect, useMemo, useState } from 'react';
import { apiUrl } from './api';

const accentGradient = 'linear-gradient(90deg, #a259ff 0%, #4f8cff 100%)';
const accentText = {
  background: accentGradient,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  fontWeight: 700,
};

function MiniLineChart({ data = [], width = 520, height = 140 }) {
  if (!data || data.length === 0) return <div style={{ color: '#bfc9d9' }}>No data</div>;
  const padding = 24;
  const xs = data.map((_, i) => i);
  const ys = data.map(d => d.count);
  const minY = 0;
  const maxY = Math.max(1, Math.max(...ys));
  const scaleX = (i) => padding + (i * (width - 2 * padding)) / Math.max(1, (xs.length - 1));
  const scaleY = (y) => height - padding - ((y - minY) * (height - 2 * padding)) / (maxY - minY || 1);
  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(i)} ${scaleY(d.count)}`).join(' ');
  return (
    <svg width={width} height={height} style={{ background: '#111', borderRadius: 12, border: '1.5px solid #232323' }}>
      <path d={path} stroke="#4f8cff" strokeWidth={2} fill="none" />
    </svg>
  );
}

function MiniBarChart({ data = [], width = 520, height = 180, labelKey = 'name', valueKey = 'count' }) {
  if (!data || data.length === 0) return <div style={{ color: '#bfc9d9' }}>No data</div>;
  const padding = 24;
  const maxVal = Math.max(1, Math.max(...data.map(d => d[valueKey])));
  const barHeight = (height - 2 * padding) / data.length;
  return (
    <svg width={width} height={height} style={{ background: '#111', borderRadius: 12, border: '1.5px solid #232323' }}>
      {data.map((d, i) => {
        const y = padding + i * barHeight;
        const w = ((d[valueKey] / maxVal) * (width - 2 * padding));
        return (
          <g key={i}>
            <rect x={padding} y={y + 4} width={w} height={barHeight - 8} fill="#a259ff" opacity={0.8} />
            <text x={padding + 6} y={y + barHeight / 2 + 4} fill="#fff" fontSize={12}>{d[labelKey]}</text>
            <text x={padding + w + 8} y={y + barHeight / 2 + 4} fill="#bfc9d9" fontSize={12}>{d[valueKey]}</text>
          </g>
        );
      })}
    </svg>
  );
}

function StatsAndQuery({ projectId }) {
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [query, setQuery] = useState('SELECT * FROM handwritten_texts LIMIT 5;');
  const [queryResult, setQueryResult] = useState(null);
  const [queryError, setQueryError] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);

  const [projects, setProjects] = useState([]);
  const [schemas, setSchemas] = useState([]);
  const [tables, setTables] = useState([]);
  const [schemaFilter, setSchemaFilter] = useState('');
  const [activeTab, setActiveTab] = useState('overview'); // overview | browse | query | charts

  const [projectCounts, setProjectCounts] = useState([]);
  const [activitySeries, setActivitySeries] = useState([]);
  const [lengthHistogram, setLengthHistogram] = useState({ bins: [], min: 0, max: 0 });
  const [topFilenames, setTopFilenames] = useState([]);

  // Browse builder state
  const [browseSchema, setBrowseSchema] = useState('public');
  const [browseTable, setBrowseTable] = useState('handwritten_texts');
  const [browseLimit, setBrowseLimit] = useState(50);
  const [browseFilters, setBrowseFilters] = useState([]); // [{ col, op, val }]
  const [browseColumns, setBrowseColumns] = useState([]);
  const [browseRows, setBrowseRows] = useState([]);

  useEffect(() => {
    const url = projectId ? `${apiUrl('/stats')}?project_id=${encodeURIComponent(projectId)}` : apiUrl('/stats');
    fetch(url)
      .then(res => res.json())
      .then(data => setStats(data))
      .finally(() => setLoadingStats(false));
  }, [projectId]);

  useEffect(() => {
    // Load projects
    fetch(apiUrl('/projects/'))
      .then(res => res.json())
      .then(data => setProjects(Array.isArray(data) ? data : []))
      .catch(() => setProjects([]));

    // Load schemas
    fetch(apiUrl('/db/schemas'))
      .then(res => res.json())
      .then(data => setSchemas(Array.isArray(data.schemas) ? data.schemas : []))
      .catch(() => setSchemas([]));

    // Load analytics
    fetch(apiUrl('/analytics/project_counts'))
      .then(res => res.json())
      .then(data => setProjectCounts(Array.isArray(data.projects) ? data.projects : []))
      .catch(() => setProjectCounts([]));
  }, []);

  useEffect(() => {
    const url = schemaFilter ? `${apiUrl('/db/tables')}?schema=${encodeURIComponent(schemaFilter)}` : apiUrl('/db/tables');
    fetch(url)
      .then(res => res.json())
      .then(data => setTables(Array.isArray(data.tables) ? data.tables : []))
      .catch(() => setTables([]));
  }, [schemaFilter]);

  useEffect(() => {
    const base = `${apiUrl('/analytics/activity')}`;
    const url = projectId ? `${base}?project_id=${encodeURIComponent(projectId)}` : base;
    fetch(url)
      .then(res => res.json())
      .then(data => setActivitySeries(Array.isArray(data.series) ? data.series : []))
      .catch(() => setActivitySeries([]));

    const baseH = `${apiUrl('/analytics/length_histogram')}`;
    const urlH = projectId ? `${baseH}?project_id=${encodeURIComponent(projectId)}` : baseH;
    fetch(urlH)
      .then(res => res.json())
      .then(data => setLengthHistogram(data && data.bins ? data : { bins: [], min: 0, max: 0 }))
      .catch(() => setLengthHistogram({ bins: [], min: 0, max: 0 }));

    const baseTop = `${apiUrl('/analytics/top_filenames')}`;
    const urlTop = projectId ? `${baseTop}?project_id=${encodeURIComponent(projectId)}` : baseTop;
    fetch(urlTop)
      .then(res => res.json())
      .then(data => setTopFilenames(Array.isArray(data.top) ? data.top : []))
      .catch(() => setTopFilenames([]));
  }, [projectId]);

  useEffect(() => {
    // load columns for browse
    fetch(`${apiUrl('/db/columns')}?schema=${encodeURIComponent(browseSchema)}&table=${encodeURIComponent(browseTable)}`)
      .then(res => res.json())
      .then(data => setBrowseColumns(Array.isArray(data.columns) ? data.columns : []))
      .catch(() => setBrowseColumns([]));
  }, [browseSchema, browseTable]);

  const handleQuery = async (e) => {
    e.preventDefault();
    setQueryLoading(true);
    setQueryError('');
    setQueryResult(null);
    try {
      const res = await fetch(apiUrl('/texts/raw_query'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (data.error) {
        setQueryError(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
      } else {
        setQueryResult(data);
      }
    } catch (err) {
      setQueryError('Failed to run query');
    }
    setQueryLoading(false);
  };

  const runBrowse = async () => {
    const whereParts = [];
    if (projectId) whereParts.push(`project_id = ${Number(projectId)}`);
    browseFilters.forEach(({ col, op, val }) => {
      if (!col || !op) return;
      const safeVal = String(val ?? '').replace(/'/g, "''");
      if (op === 'contains') whereParts.push(`${col} ILIKE '%${safeVal}%'`);
      else if (op === '=') whereParts.push(`${col} = '${safeVal}'`);
      else if (op === '!=') whereParts.push(`${col} != '${safeVal}'`);
      else if (op === 'is null') whereParts.push(`${col} IS NULL`);
      else if (op === 'is not null') whereParts.push(`${col} IS NOT NULL`);
    });
    const whereClause = whereParts.length ? ` WHERE ${whereParts.join(' AND ')}` : '';
    const sql = `SELECT * FROM ${browseSchema}.${browseTable}${whereClause} ORDER BY 1 DESC LIMIT ${Number(browseLimit) || 50};`;
    setQuery(sql);
    setActiveTab('query');
    // Auto-run
    try {
      setQueryLoading(true);
      setQueryError('');
      setQueryResult(null);
      const res = await fetch(apiUrl('/texts/raw_query'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setQueryError(data.error ? (typeof data.error === 'string' ? data.error : JSON.stringify(data.error)) : 'Query failed');
      } else {
        setQueryResult(data);
      }
    } catch (e) {
      setQueryError('Query failed');
    } finally {
      setQueryLoading(false);
    }
  };

  const addFilterRow = () => setBrowseFilters(prev => [...prev, { col: '', op: 'contains', val: '' }]);
  const updateFilter = (idx, patch) => setBrowseFilters(prev => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  const removeFilter = (idx) => setBrowseFilters(prev => prev.filter((_, i) => i !== idx));

  return (
    <div className="main-responsive-box" style={{ width: '100%', maxWidth: 1200, margin: '0 auto', padding: '0 5vw' }}>
      <h2 style={{ fontSize: 38, marginBottom: 16, ...accentText }}>Database Explorer</h2>
      <div className="row" style={{ gap: 16 }}>
        <div className="col-12 col-lg-3" style={{ minWidth: 260 }}>
          <div style={{ background: '#111', border: '1.5px solid #232323', borderRadius: 12, padding: 12 }}>
            <h6 style={{ color: '#fff', fontWeight: 700 }}>Navigator</h6>
            <div style={{ color: '#bfc9d9', marginTop: 8, marginBottom: 8 }}>Projects</div>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {projects.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', color: '#bfc9d9', padding: '6px 8px', borderRadius: 8, border: '1px solid #232323', marginBottom: 6 }}>
                  <span style={{ color: '#fff' }}>{p.name}</span>
                  <span style={{ opacity: 0.8 }}>{p.description ? '' : ''}</span>
                </div>
              ))}
            </div>
            <div style={{ color: '#bfc9d9', marginTop: 12, marginBottom: 8 }}>Schemas & Tables</div>
            <select value={schemaFilter} onChange={e => setSchemaFilter(e.target.value)} className="form-select form-select-sm bg-dark text-white" style={{ border: '1.5px solid #232323', marginBottom: 8 }}>
              <option value="">All (user schemas)</option>
              {schemas.map(s => (<option key={s} value={s}>{s}</option>))}
            </select>
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              {tables.map(t => (
                <div key={`${t.schema}.${t.table}`} style={{ color: '#bfc9d9', padding: '4px 6px', cursor: 'pointer' }} onClick={() => { setBrowseSchema(t.schema); setBrowseTable(t.table); setActiveTab('browse'); }}>
                  <span style={{ color: '#a259ff' }}>{t.schema}</span>.{t.table}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="col" style={{ minWidth: 0 }}>
          <div className="d-flex gap-2 mb-3">
            {['overview', 'browse', 'query', 'charts'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`btn ${activeTab === tab ? 'btn-primary' : 'btn-outline-light'}`} style={{ borderRadius: 10, padding: '8px 14px', textTransform: 'capitalize' }}>{tab}</button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <div>
              <div className="row g-3">
                <div className="col-12 col-md-3"><div style={{ background: '#191919', border: '1.5px solid #232323', borderRadius: 12, padding: 16 }}>
                  <div style={{ color: '#bfc9d9' }}>Total Rows</div>
                  <div style={{ color: '#fff', fontSize: 28, fontWeight: 700 }}>{stats?.count ?? '—'}</div>
                </div></div>
                <div className="col-12 col-md-3"><div style={{ background: '#191919', border: '1.5px solid #232323', borderRadius: 12, padding: 16 }}>
                  <div style={{ color: '#bfc9d9' }}>Avg Text Length</div>
                  <div style={{ color: '#fff', fontSize: 28, fontWeight: 700 }}>{stats?.avg_text_length ? stats.avg_text_length.toFixed(2) : '—'}</div>
                </div></div>
                <div className="col-12 col-md-6"><div style={{ background: '#191919', border: '1.5px solid #232323', borderRadius: 12, padding: 16 }}>
                  <div style={{ color: '#bfc9d9', marginBottom: 8 }}>Activity</div>
                  <MiniLineChart data={activitySeries} />
                </div></div>
              </div>
              <div className="row g-3 mt-1">
                <div className="col-12 col-md-6"><div style={{ background: '#191919', border: '1.5px solid #232323', borderRadius: 12, padding: 16 }}>
                  <div style={{ color: '#bfc9d9', marginBottom: 8 }}>Length distribution</div>
                  <MiniBarChart data={lengthHistogram.bins.map(b => ({ name: `#${b.bucket}`, count: b.count }))} />
                </div></div>
                <div className="col-12 col-md-6"><div style={{ background: '#191919', border: '1.5px solid #232323', borderRadius: 12, padding: 16 }}>
                  <div style={{ color: '#bfc9d9', marginBottom: 8 }}>Top filenames</div>
                  <MiniBarChart data={topFilenames} />
                </div></div>
              </div>
              <div className="mt-3" style={{ background: '#191919', border: '1.5px solid #232323', borderRadius: 12, padding: 12 }}>
                <div style={{ color: '#bfc9d9', marginBottom: 6 }}>Top Projects</div>
                <div className="d-flex flex-wrap gap-2">
                  {projectCounts.map(p => (
                    <div key={p.id} style={{ background: '#111', border: '1px solid #232323', borderRadius: 10, padding: '10px 12px', color: '#fff' }}>
                      {p.name}: <span style={{ color: '#4f8cff' }}>{p.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'browse' && (
            <div style={{ background: '#191919', border: '1.5px solid #232323', borderRadius: 12, padding: 16 }}>
              <div className="row g-2 align-items-end">
                <div className="col-12 col-md-4">
                  <label className="form-label" style={{ color: '#bfc9d9' }}>Schema</label>
                  <input value={browseSchema} onChange={e => setBrowseSchema(e.target.value)} className="form-control bg-dark text-white" />
                </div>
                <div className="col-12 col-md-4">
                  <label className="form-label" style={{ color: '#bfc9d9' }}>Table</label>
                  <input value={browseTable} onChange={e => setBrowseTable(e.target.value)} className="form-control bg-dark text-white" />
                </div>
                <div className="col-6 col-md-2">
                  <label className="form-label" style={{ color: '#bfc9d9' }}>Limit</label>
                  <input type="number" min={1} max={5000} value={browseLimit} onChange={e => setBrowseLimit(e.target.value)} className="form-control bg-dark text-white" />
                </div>
                <div className="col-6 col-md-2 d-grid">
                  <button className="btn btn-primary" onClick={runBrowse}>Run</button>
                </div>
              </div>
              <div className="mt-3">
                <div className="d-flex justify-content-between align-items-center">
                  <div style={{ color: '#bfc9d9' }}>Filters</div>
                  <button className="btn btn-sm btn-outline-light" onClick={addFilterRow}>Add filter</button>
                </div>
                {browseFilters.length === 0 && <div style={{ color: '#666', marginTop: 8 }}>No filters</div>}
                {browseFilters.map((f, idx) => (
                  <div key={idx} className="row g-2 align-items-center mt-1">
                    <div className="col-12 col-md-4">
                      <select value={f.col} onChange={e => updateFilter(idx, { col: e.target.value })} className="form-select bg-dark text-white">
                        <option value="">— column —</option>
                        {browseColumns.map(c => (<option key={c.name} value={c.name}>{c.name}</option>))}
                      </select>
                    </div>
                    <div className="col-6 col-md-3">
                      <select value={f.op} onChange={e => updateFilter(idx, { op: e.target.value })} className="form-select bg-dark text-white">
                        <option value="contains">contains</option>
                        <option value="=">=</option>
                        <option value="!=">!=</option>
                        <option value="is null">is null</option>
                        <option value="is not null">is not null</option>
                      </select>
                    </div>
                    <div className="col-6 col-md-4">
                      {!(f.op === 'is null' || f.op === 'is not null') && (
                        <input value={f.val} onChange={e => updateFilter(idx, { val: e.target.value })} className="form-control bg-dark text-white" />
                      )}
                    </div>
                    <div className="col-12 col-md-1 d-grid">
                      <button className="btn btn-sm btn-outline-danger" onClick={() => removeFilter(idx)}>X</button>
                    </div>
                  </div>
                ))}
                {browseColumns.length > 0 && (
                  <div className="d-flex flex-wrap gap-2 mt-2">
                    {browseColumns.map(c => (
                      <span key={c.name} className="badge bg-secondary" style={{ background: '#232323', border: '1px solid #333', color: '#bfc9d9' }}>{c.name}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'query' && (
            <div>
              <h4 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Run a SQL Query</h4>
              <form onSubmit={handleQuery} className="row g-2 align-items-center mb-3" style={{ marginBottom: 24 }}>
                <div className="col-12 col-md-9 mb-2 mb-md-0">
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    className="form-control bg-dark text-white"
                    style={{ padding: 16, borderRadius: 12, border: '2px solid #4f8cff', fontSize: 18, fontWeight: 500 }}
                  />
                </div>
                <div className="col-12 col-md-3 d-grid">
                  <button type="submit" className="btn btn-primary" style={{ borderRadius: 12, padding: '14px 36px', fontWeight: 700, fontSize: 18 }} disabled={queryLoading}>
                    Run
                  </button>
                </div>
              </form>
              {queryError && <div style={{ color: '#e63946' }}>{queryError}</div>}
              {queryResult && (
                <div style={{ overflowX: 'auto', marginTop: 16 }}>
                  <table className="table table-dark table-bordered" style={{ borderCollapse: 'collapse', width: '100%', background: '#191919', borderRadius: 16, overflow: 'hidden' }}>
                    <thead>
                      <tr>
                        {queryResult.columns.map(col => (
                          <th key={col} style={{ border: '1.5px solid #232323', padding: 14, background: '#232323', color: '#a259ff', fontSize: 18 }}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {queryResult.rows.map((row, i) => (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td key={j} style={{ border: '1.5px solid #232323', padding: 14, color: '#fff', fontSize: 17 }}>{String(cell)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'charts' && (
            <div className="row g-3">
              <div className="col-12 col-lg-7">
                <div style={{ background: '#191919', border: '1.5px solid #232323', borderRadius: 12, padding: 16 }}>
                  <div style={{ color: '#bfc9d9', marginBottom: 8 }}>Rows over time</div>
                  <MiniLineChart data={activitySeries} width={720} height={220} />
                </div>
              </div>
              <div className="col-12 col-lg-5">
                <div style={{ background: '#191919', border: '1.5px solid #232323', borderRadius: 12, padding: 16 }}>
                  <div style={{ color: '#bfc9d9', marginBottom: 8 }}>Length distribution</div>
                  <MiniBarChart data={lengthHistogram.bins.map(b => ({ name: `#${b.bucket}`, count: b.count }))} width={520} height={220} />
                </div>
              </div>
              <div className="col-12">
                <div style={{ background: '#191919', border: '1.5px solid #232323', borderRadius: 12, padding: 16 }}>
                  <div style={{ color: '#bfc9d9', marginBottom: 8 }}>Top filenames</div>
                  <MiniBarChart data={topFilenames} width={1080} height={220} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default StatsAndQuery; 