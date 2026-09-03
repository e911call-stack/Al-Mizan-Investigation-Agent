'use client';
import { useState } from 'react';

// Protected by the app-wide password gate (see middleware.js) — not a
// per-user permission system yet, but no longer wide open.
export default function IngestLawPage() {
  const [jurisdiction, setJurisdiction] = useState('jordan-civil');
  const [lawNameAr, setLawNameAr] = useState('');
  const [lawNameEn, setLawNameEn] = useState('');
  const [sourceNote, setSourceNote] = useState('');
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function submit() {
    setError(null);
    setResult(null);
    if (!rawText.trim() || !lawNameAr.trim()) {
      setError('Law name and pasted text are both required.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/corpus/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jurisdiction, lawNameAr, lawNameEn, sourceNote, rawText })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Ingestion failed.'); return; }
      setResult(data);
    } catch (e) {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 22 }}>Ingest a law into the corpus</h1>
      <p style={{ color: '#666', fontSize: 13.5, lineHeight: 1.6 }}>
        Paste raw law text below. Claude splits it into individual articles, strips any
        non-statutory commentary, and every article is stored at the <code>extracted-unverified</code> tier —
        nothing here is promoted to <code>corpus-verified</code> automatically.
        <br /><br />
        <strong>For long laws (100+ articles):</strong> paste in chapter-sized chunks using the same
        law name each time, rather than the whole law at once — a single call has execution-time and
        output-size limits. Each chunk's articles get appended to the same law.
      </p>

      <div style={{ display: 'grid', gap: 14, marginTop: 24 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12.5, marginBottom: 4 }}>Jurisdiction</label>
          <select value={jurisdiction} onChange={e => setJurisdiction(e.target.value)} style={{ width: '100%', padding: 8 }}>
            <option value="jordan-civil">Jordan</option>
            <option value="uae-mainland">UAE — Mainland</option>
            <option value="uae-difc">UAE — DIFC</option>
            <option value="egypt-civil">Egypt</option>
            <option value="saudi">Saudi Arabia</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12.5, marginBottom: 4 }}>Law name (Arabic)</label>
          <input value={lawNameAr} onChange={e => setLawNameAr(e.target.value)} placeholder="قانون الضمان الاجتماعي الأردني" style={{ width: '100%', padding: 8 }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12.5, marginBottom: 4 }}>Law name (English, optional)</label>
          <input value={lawNameEn} onChange={e => setLawNameEn(e.target.value)} placeholder="Jordan Social Security Law" style={{ width: '100%', padding: 8 }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12.5, marginBottom: 4 }}>Source note</label>
          <input value={sourceNote} onChange={e => setSourceNote(e.target.value)} placeholder="e.g. republished by موقع القانون في الأردن, not Official Gazette — pending verification" style={{ width: '100%', padding: 8 }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12.5, marginBottom: 4 }}>Raw law text</label>
          <textarea rows={16} value={rawText} onChange={e => setRawText(e.target.value)} dir="rtl" style={{ width: '100%', padding: 8, fontFamily: 'inherit' }} />
        </div>
        {error && <p style={{ color: '#9C4B3B', fontSize: 13 }}>{error}</p>}
        <button onClick={submit} disabled={loading} style={{ padding: '10px 18px', background: '#12203A', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          {loading ? 'Splitting, embedding, storing…' : 'Ingest'}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: 24, padding: 16, background: '#F8F6F0', border: '1px solid #DCD7C9', borderRadius: 6 }}>
          <p><strong>{result.articlesFound}</strong> articles found, <strong>{result.strippedCommentaryCount}</strong> commentary blocks stripped.</p>
          <ul style={{ fontSize: 12.5, maxHeight: 300, overflow: 'auto' }}>
            {result.results.map((r, i) => (
              <li key={i} style={{ color: r.status === 'ok' ? '#3F6E52' : '#9C4B3B' }}>
                Art. {r.articleNumber}: {r.status}{r.extractionFlag ? ` — flagged: ${r.extractionFlag}` : ''}{r.error ? ` — ${r.error}` : ''}
                {' '}<span style={{ color: r.lkcSynced ? '#3F6E52' : '#B08A3E' }}>
                  {r.lkcSynced ? '· synced to Legal Knowledge Core' : r.lkcReason ? `· LKC: ${r.lkcReason}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
