'use client';
import { useState } from 'react';

// Not protected by the app-wide Google login (middleware.js only matches
// /investigate, /admin, /api/case, /api/corpus) — safe to leave up since a
// real API key is still required to get any data back. Meant as a quick way
// to sanity-check the LKC search endpoint from a browser, no Postman/curl
// needed. Fine to delete once WakeelyPro/Mokhamen are wired in directly.
export default function LkcTestPage() {
  const [apiKey, setApiKey] = useState('');
  const [query, setQuery] = useState('');
  const [jurisdiction, setJurisdiction] = useState('JO');
  const [currentOnly, setCurrentOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function submit() {
    setError(null);
    setResult(null);
    if (!apiKey.trim() || !query.trim()) {
      setError('API key and a search query are both required.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/v1/legal/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ jurisdiction, query, current_only: currentOnly })
      });
      const data = await res.json();
      if (!res.ok) { setError((data.error || 'Search failed.') + (data.debug ? ` (${data.debug})` : '')); return; }
      setResult(data);
    } catch (e) {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 22 }}>Legal Knowledge Core — search test</h1>
      <p style={{ color: '#666', fontSize: 13.5, lineHeight: 1.6 }}>
        Paste one of the LKC API keys (WakeelyPro's or Mokhamen's), type a question
        or legal term, and see what the shared corpus returns.
      </p>

      <div style={{ display: 'grid', gap: 14, marginTop: 24 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12.5, marginBottom: 4 }}>API key</label>
          <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="lkc_live_..." style={{ width: '100%', padding: 8 }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12.5, marginBottom: 4 }}>Jurisdiction</label>
          <select value={jurisdiction} onChange={e => setJurisdiction(e.target.value)} style={{ width: '100%', padding: 8 }}>
            <option value="JO">Jordan (JO)</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12.5, marginBottom: 4 }}>Search query</label>
          <textarea rows={3} value={query} onChange={e => setQuery(e.target.value)} dir="rtl" style={{ width: '100%', padding: 8, fontFamily: 'inherit' }} />
        </div>
        <div>
          <label style={{ fontSize: 12.5 }}>
            <input type="checkbox" checked={currentOnly} onChange={e => setCurrentOnly(e.target.checked)} /> Current law only
          </label>
        </div>
        {error && <p style={{ color: '#9C4B3B', fontSize: 13 }}>{error}</p>}
        <button onClick={submit} disabled={loading} style={{ padding: '10px 18px', background: '#12203A', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: 24 }}>
          <p style={{ fontSize: 13 }}><strong>{result.result_count}</strong> results</p>
          {result.results.map((r, i) => (
            <div key={i} style={{ marginTop: 12, padding: 14, background: '#F8F6F0', border: '1px solid #DCD7C9', borderRadius: 6 }}>
              <p style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
                {r.citation.document} — Art. {r.citation.article} (score: {r.relevance_score?.toFixed(4)})
              </p>
              <p dir="rtl" style={{ fontSize: 14 }}>{r.provision_text}</p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
