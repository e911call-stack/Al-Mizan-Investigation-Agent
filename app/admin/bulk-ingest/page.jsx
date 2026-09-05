'use client';
import { useState, useRef } from 'react';

// Same password + same /api/corpus/ingest endpoint as the single-law page —
// this just automates calling it once per law instead of you doing that by
// hand, and shows live progress as each one finishes.
function blankLaw() {
  return { id: Math.random().toString(36).slice(2), jurisdiction: 'jordan-civil', lawNameAr: '', lawNameEn: '', sourceNote: '', rawText: '', status: 'pending', summary: null };
}

export default function BulkIngestPage() {
  const [adminPassword, setAdminPassword] = useState('');
  const [laws, setLaws] = useState([blankLaw()]);
  const [running, setRunning] = useState(false);
  const fileInputs = useRef({});

  function updateLaw(id, field, value) {
    setLaws(prev => prev.map(l => (l.id === id ? { ...l, [field]: value } : l)));
  }

  function addLaw() {
    setLaws(prev => [...prev, blankLaw()]);
  }

  function removeLaw(id) {
    setLaws(prev => prev.filter(l => l.id !== id));
  }

  function handleFile(id, file) {
    const reader = new FileReader();
    reader.onload = () => updateLaw(id, 'rawText', String(reader.result || ''));
    reader.readAsText(file, 'utf-8');
  }

  async function runAll() {
    if (!adminPassword.trim()) { alert('Enter the admin password first.'); return; }
    setRunning(true);
    for (const law of laws) {
      if (!law.rawText.trim() || !law.lawNameAr.trim()) {
        setLaws(prev => prev.map(l => (l.id === law.id ? { ...l, status: 'skipped', summary: 'missing name or text' } : l)));
        continue;
      }
      setLaws(prev => prev.map(l => (l.id === law.id ? { ...l, status: 'running' } : l)));
      try {
        const res = await fetch('/api/corpus/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
          body: JSON.stringify({
            jurisdiction: law.jurisdiction,
            lawNameAr: law.lawNameAr,
            lawNameEn: law.lawNameEn,
            sourceNote: law.sourceNote,
            rawText: law.rawText,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setLaws(prev => prev.map(l => (l.id === law.id ? { ...l, status: 'failed', summary: data.error || 'Ingestion failed.' } : l)));
        } else {
          setLaws(prev => prev.map(l => (l.id === law.id ? { ...l, status: 'done', summary: `${data.okCount}/${data.articlesFound} articles stored` } : l)));
        }
      } catch (e) {
        setLaws(prev => prev.map(l => (l.id === law.id ? { ...l, status: 'failed', summary: 'Could not reach the server.' } : l)));
      }
    }
    setRunning(false);
  }

  const statusColor = { pending: '#999', running: '#B08A3E', done: '#3F6E52', failed: '#9C4B3B', skipped: '#9C4B3B' };

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '40px 24px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 22 }}>Bulk-ingest laws into the Legal Knowledge Core</h1>
      <p style={{ color: '#666', fontSize: 13.5, lineHeight: 1.6 }}>
        Add one block per law below (paste the text, or use "Upload file" to load it from a .txt file
        instead of pasting). When you're ready, click "Ingest all" once — it runs through every law
        automatically, one after another, and shows the result of each as it finishes. You don't need
        to press anything else or refill the form in between.
      </p>

      <div style={{ marginTop: 20 }}>
        <label style={{ display: 'block', fontSize: 12.5, marginBottom: 4 }}>Admin password</label>
        <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} style={{ width: '100%', maxWidth: 340, padding: 8 }} />
      </div>

      {laws.map((law, idx) => (
        <div key={law.id} style={{ marginTop: 24, padding: 16, border: '1px solid #DCD7C9', borderRadius: 6, background: law.status === 'done' ? '#F3F7F3' : '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 13 }}>Law #{idx + 1}</strong>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {law.status !== 'pending' && (
                <span style={{ fontSize: 12, color: statusColor[law.status] }}>
                  {law.status}{law.summary ? ` — ${law.summary}` : ''}
                </span>
              )}
              {!running && laws.length > 1 && (
                <button onClick={() => removeLaw(law.id)} style={{ fontSize: 12, color: '#9C4B3B', background: 'none', border: 'none', cursor: 'pointer' }}>remove</button>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            <select value={law.jurisdiction} onChange={e => updateLaw(law.id, 'jurisdiction', e.target.value)} style={{ padding: 8, maxWidth: 260 }} disabled={running}>
              <option value="jordan-civil">Jordan</option>
              <option value="uae-mainland">UAE — Mainland</option>
              <option value="uae-difc">UAE — DIFC</option>
              <option value="egypt-civil">Egypt</option>
              <option value="saudi">Saudi Arabia</option>
            </select>
            <input placeholder="Law name (Arabic)" value={law.lawNameAr} onChange={e => updateLaw(law.id, 'lawNameAr', e.target.value)} dir="rtl" style={{ padding: 8 }} disabled={running} />
            <input placeholder="Law name (English, optional)" value={law.lawNameEn} onChange={e => updateLaw(law.id, 'lawNameEn', e.target.value)} style={{ padding: 8 }} disabled={running} />
            <input placeholder="Source note (optional)" value={law.sourceNote} onChange={e => updateLaw(law.id, 'sourceNote', e.target.value)} style={{ padding: 8 }} disabled={running} />
            <div>
              <input
                type="file"
                accept=".txt"
                ref={el => (fileInputs.current[law.id] = el)}
                onChange={e => e.target.files[0] && handleFile(law.id, e.target.files[0])}
                disabled={running}
                style={{ fontSize: 12.5 }}
              />
              <span style={{ fontSize: 11.5, color: '#999', marginLeft: 8 }}>— loads the file's text into the box below</span>
            </div>
            <textarea rows={8} value={law.rawText} onChange={e => updateLaw(law.id, 'rawText', e.target.value)} dir="rtl" placeholder="…or paste the raw law text here" style={{ padding: 8, fontFamily: 'inherit' }} disabled={running} />
          </div>
        </div>
      ))}

      <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
        <button onClick={addLaw} disabled={running} style={{ padding: '8px 14px', background: '#fff', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer' }}>
          + Add another law
        </button>
        <button onClick={runAll} disabled={running} style={{ padding: '10px 20px', background: '#12203A', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          {running ? 'Ingesting…' : 'Ingest all'}
        </button>
      </div>
    </main>
  );
}
