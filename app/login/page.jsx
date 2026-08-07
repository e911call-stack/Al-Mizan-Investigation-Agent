'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '../../lib/supabase-client';
import { supabaseUrl, supabaseAnonKey } from '../../lib/supabase-config';

function GoogleSignInButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/investigate';
  const errorParam = searchParams.get('error');

  useEffect(() => {
    if (errorParam === 'auth_failed') setError('Sign-in with Google did not complete. Please try again.');
    if (errorParam === 'missing_code') setError('The sign-in returned no authorization code. Please try again.');
  }, [errorParam]);

  async function signIn() {
    if (!supabaseUrl() || !supabaseAnonKey()) {
      setError('Supabase auth is not configured on this app.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
        }
      });
      if (error) { setError(error.message); setLoading(false); }
      // On success Supabase navigates away to Google — no need to reset loading.
    } catch (e) {
      setError('Could not start sign-in — check your connection.');
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={signIn}
        disabled={loading}
        style={{ width: '100%', padding: 11, background: '#fff', color: '#12203A', border: '1px solid #DCD7C9', borderRadius: 6, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
      >
        <span aria-hidden style={{ fontWeight: 600 }}>G</span>
        {loading ? 'Redirecting to Google…' : 'Continue with Google'}
      </button>
      {error && <p style={{ color: '#9C4B3B', fontSize: 13, marginTop: 12 }}>{error}</p>}
    </div>
  );
}

export default function LoginPage() {
  return (
    <main style={{ maxWidth: 360, margin: '90px auto', padding: '0 24px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 20, marginBottom: 6 }}>Al Mizan — Case Investigation</h1>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>Internal tool. Sign in with your Google Workspace account to continue.</p>
      <Suspense fallback={null}>
        <GoogleSignInButton />
      </Suspense>
    </main>
  );
}