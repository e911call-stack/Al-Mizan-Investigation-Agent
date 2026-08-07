import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase-server';

// GET /auth/callback — Supabase redirects the browser here after Google OAuth
// completes, with ?code=...&next=... We exchange the code for a session, the
// session cookies get set, and the user lands on the protected app.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/investigate';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // next must stay on the same origin to avoid an open-redirect via ?next=.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/investigate';
  return NextResponse.redirect(`${origin}${safeNext}`);
}
