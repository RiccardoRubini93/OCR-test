import React, { useEffect, useState } from 'react';

const accentGradient = 'linear-gradient(90deg, #a259ff 0%, #4f8cff 100%)';
const accentText = {
  background: accentGradient,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  fontWeight: 700,
};

function StatsAndQuery() {
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [query, setQuery] = useState('SELECT * FROM handwritten_texts LIMIT 5;');
  const [queryResult, setQueryResult] = useState(null);
  const [queryError, setQueryError] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);

  useEffect(() => {
    fetch('http://localhost:8000/stats')
      .then(res => res.json())
      .then(data => setStats(data))
      .finally(() => setLoadingStats(false));
  }, []);

  const handleQuery = async (e) => {
    e.preventDefault();
    setQueryLoading(true);
    setQueryError('');
    setQueryResult(null);
    try {
      const res = await fetch('http://localhost:8000/texts/raw_query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (data.error) {
        setQueryError(data.error);
      } else {
        setQueryResult(data);
      }
    } catch (err) {
      setQueryError('Failed to run query');
    }
    setQueryLoading(false);
  };

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '0 5vw' }}>
      <h2 style={{ fontSize: 38, marginBottom: 32, ...accentText }}>Database Statistics & Query</h2>
      <div style={{ marginBottom: 40 }}>
        <h4 style={{ color: '#fff', fontSize: 26, fontWeight: 700, marginBottom: 18 }}>Table Statistics</h4>
        {loadingStats ? (
          <div style={{ color: '#bfc9d9' }}>Loading...</div>
        ) : stats ? (
          <ul style={{ fontSize: 20, color: '#bfc9d9', lineHeight: 2 }}>
            <li><b style={{ color: '#fff' }}>Total Rows:</b> {stats.count}</li>
            <li><b style={{ color: '#fff' }}>Earliest Entry:</b> {stats.earliest || 'N/A'}</li>
            <li><b style={{ color: '#fff' }}>Latest Entry:</b> {stats.latest || 'N/A'}</li>
            <li><b style={{ color: '#fff' }}>Average Text Length:</b> {stats.avg_text_length ? stats.avg_text_length.toFixed(2) : 'N/A'}</li>
          </ul>
        ) : (
          <div style={{ color: '#e63946' }}>Failed to load stats</div>
        )}
      </div>
      <div>
        <h4 style={{ color: '#fff', fontSize: 26, fontWeight: 700, marginBottom: 18 }}>Run a SQL Query</h4>
        <form onSubmit={handleQuery} style={{ display: 'flex', marginBottom: 24, gap: 16 }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ flex: 1, padding: 16, borderRadius: 12, border: '2px solid #4f8cff', fontSize: 18, background: '#191919', color: '#fff', fontWeight: 500 }}
          />
          <button type="submit" style={{
            background: accentGradient,
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            padding: '14px 36px',
            fontWeight: 700,
            fontSize: 18,
            cursor: 'pointer',
          }} disabled={queryLoading}>Run</button>
        </form>
        {queryError && <div style={{ color: '#e63946' }}>{queryError}</div>}
        {queryResult && (
          <div style={{ overflowX: 'auto', marginTop: 16 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', background: '#191919', borderRadius: 16, overflow: 'hidden' }}>
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
    </div>
  );
}

export default StatsAndQuery; 