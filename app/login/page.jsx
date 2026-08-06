'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Login failed.'); return; }
      router.push(searchParams.get('next') || '/investigate');
    } catch (e) {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="Password"
        autoFocus
        style={{ width: '100%', padding: 10, fontSize: 14, border: '1px solid #DCD7C9', borderRadius: 4, marginBottom: 10 }}
      />
      {error && <p style={{ color: '#9C4B3B', fontSize: 13, marginBottom: 10 }}>{error}</p>}
      <button
        type="submit"
        disabled={loading}
        style={{ width: '100%', padding: 10, background: '#12203A', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
      >
        {loading ? 'Checking…' : 'Log in'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main style={{ maxWidth: 360, margin: '90px auto', padding: '0 24px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 20, marginBottom: 6 }}>Al Mizan — Case Investigation</h1>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>Internal tool. Password required.</p>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
